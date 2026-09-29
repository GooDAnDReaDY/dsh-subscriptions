import test from 'node:test'
import assert from 'node:assert/strict'
import { apply } from '../lib/index.js'
import { createAccountStore, normalizeSlots } from '../lib/accounts.js'
import { publicConfig } from '../lib/config-schema.js'

// The host hands apply() the live profile entry object. Its volatile fields hold
// Volatile boxes, and the Loader mutates them in place and re-announces the change with
// loader/volatile-update. No settings service is registered or injected: that API was
// removed before DSH 0.1.7-rc.2.
function makeMockCtx({ baseConfig = {} }) {
  const events = new Map()
  const cleanups = []
  const provided = {}

  const ctx = {
    rawConfig: baseConfig,
    logger: () => ({ warn() {}, error() {}, info() {} }),
    inject: () => () => {},
    on: (event, handler) => {
      if (!events.has(event)) events.set(event, [])
      events.get(event).push(handler)
      return () => ctx.off(event, handler)
    },
    off: (event, handler) => {
      const list = events.get(event) || []
      const idx = list.indexOf(handler)
      if (idx >= 0) list.splice(idx, 1)
    },
    effect: (fn) => {
      const c = typeof fn === 'function' ? fn() : undefined
      if (typeof c === 'function') cleanups.push(c)
      return c
    },
    emit: (event, ...args) => {
      for (const h of events.get(event) || []) h(...args)
    },
    provide: (name, value) => {
      provided[name] = value
      return () => { delete provided[name] }
    },
    webServer: {
      register: () => () => {},
      tapIndex: (h) => h,
    },
    credentials: {
      resolve: async () => null,
      set: async () => {},
      unset: async () => {},
      describe: async () => ({ configured: false }),
    },
    tools: { register: () => () => {} },
  }

  return {
    ctx,
    provided,
    cleanups,
    emitEvent: (event, ...args) => ctx.emit(event, ...args),
  }
}

test('#367: the resolved config is cached and only refreshed on volatile-update', () => {
  const cfg = {
    slots: [
      { provider: 'codex', index: 1, label: 'Account 1' },
      { provider: 'claude', index: 1, label: 'Account 2' },
    ],
    cooldownMs: 60000,
  }

  const mock = makeMockCtx({ baseConfig: cfg })
  apply(mock.ctx, cfg)

  const svc = mock.provided.subscriptions
  assert.ok(svc, 'the subscriptions service must be provided')

  // Repeated reads must reuse one resolved snapshot instead of re-resolving the whole
  // schema per operation. That per-operation re-resolution is the regression #367 fixed.
  const first = svc.live()
  assert.equal(first.cooldownMs, 60000)
  for (let i = 0; i < 100; i++) {
    normalizeSlots(cfg.slots)
    assert.strictEqual(svc.live(), first, 'reads must reuse the resolved snapshot (#367)')
  }

  // The Loader mutates the entry boxes in place and re-announces them. Until that
  // announcement arrives, the cached snapshot must not change.
  mock.ctx.rawConfig.cooldownMs = 5000
  assert.strictEqual(svc.live(), first, 'a mutation alone must not re-resolve the config')

  mock.emitEvent('loader/volatile-update')
  const second = svc.live()
  assert.notStrictEqual(second, first, 'volatile-update must resolve a fresh snapshot')
  assert.equal(second.cooldownMs, 5000, 'the fresh snapshot carries the new value')

  for (let i = 0; i < 50; i++) {
    assert.strictEqual(svc.live(), second, 'reads stay cached until the next volatile-update')
  }

  for (const c of mock.cleanups) c()
})

test('#367: accounts.js reads getConfig once per operation, not in loop iterations', async () => {
  let getConfigCalls = 0
  const cfg = {
    slots: [
      { provider: 'codex', index: 1 },
      { provider: 'codex', index: 2 },
      { provider: 'codex', index: 3 },
      { provider: 'claude', index: 1 },
    ],
  }

  const getConfig = () => {
    getConfigCalls++
    return cfg
  }

  const store = createAccountStore({
    credentials: {
      resolve: async () => JSON.stringify({ email: 'test@example.com' }),
      describe: async () => ({ configured: true }),
      set: async () => {},
      unset: async () => {},
    },
    getConfig,
  })

  // 1. listAccounts with 3 codex slots
  getConfigCalls = 0
  const accounts = await store.listAccounts('codex')
  assert.equal(accounts.length, 3)
  assert.equal(getConfigCalls, 1, 'listAccounts must call getConfig exactly once regardless of slot count')

  // 2. loggedInProviders with 4 slots
  getConfigCalls = 0
  const providers = await store.loggedInProviders()
  assert.ok(providers.includes('codex'))
  assert.equal(getConfigCalls, 1, 'loggedInProviders must call getConfig exactly once regardless of slot count')

  // 3. refreshUsage with 3 codex slots
  getConfigCalls = 0
  await store.refreshUsage('codex')
  assert.equal(getConfigCalls, 1, 'refreshUsage must call getConfig exactly once regardless of slot count')
})

test('#367: publicConfig redacts secrets without structuredClone', () => {
  const cfg = {
    codexClientId: 'client-123',
    codexClientSecret: 'super-secret',
    claudeClientSecret: 'secret-2',
    otherField: 'safe',
  }
  const redacted = publicConfig(cfg)
  assert.equal(redacted.codexClientId, 'client-123')
  assert.equal(redacted.codexClientSecret, '••••••')
  assert.equal(redacted.claudeClientSecret, '••••••')
  assert.equal(redacted.otherField, 'safe')
  // Original is not mutated
  assert.equal(cfg.codexClientSecret, 'super-secret')
})
