import test from 'node:test'
import assert from 'node:assert/strict'
import { apply, Config } from '../lib/index.js'
import { createAccountStore, normalizeSlots } from '../lib/accounts.js'
import { publicConfig } from '../lib/config-schema.js'

function makeMockCtx({ baseConfig = {}, initialScopeConfig = null }) {
  const events = new Map()
  const cleanups = []
  let scopeGetCalls = 0

  let currentSettings = initialScopeConfig || baseConfig

  const scope = {
    get: () => {
      scopeGetCalls++
      return currentSettings
    },
    replace: async (next) => {
      currentSettings = next
    },
    watch: () => () => {},
  }

  const sctx = {
    settings: {
      register: () => scope,
    },
    on: (event, handler) => {
      if (!events.has(event)) events.set(event, [])
      events.get(event).push(handler)
      return () => {
        const list = events.get(event) || []
        const idx = list.indexOf(handler)
        if (idx >= 0) list.splice(idx, 1)
      }
    },
    effect: (fn) => {
      const c = fn()
      if (typeof c === 'function') cleanups.push(c)
    },
  }

  const ctx = {
    logger: () => ({ warn() {}, error() {}, info() {} }),
    inject: (deps, fn) => {
      if (deps.includes('settings')) {
        fn(sctx)
      }
      return () => {}
    },
    on: (event, handler) => sctx.on(event, handler),
    effect: (fn) => sctx.effect(fn),
    emit: (event, ...args) => {
      for (const h of events.get(event) || []) {
        h(...args)
      }
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
    provide: () => {},
  }

  return {
    ctx,
    sctx,
    scope,
    getScopeGetCalls: () => scopeGetCalls,
    emitEvent: (event, ...args) => ctx.emit(event, ...args),
    setSettings: (next) => { currentSettings = next },
    cleanups,
  }
}

test('#367: series of operations without settings changes results in exactly 1 scope.get() call', async () => {
  const cfg = {
    slots: [
      { provider: 'codex', index: 1, label: 'Account 1' },
      { provider: 'claude', index: 1, label: 'Account 2' },
    ],
    cooldownMs: 60000,
  }

  const mock = makeMockCtx({ baseConfig: cfg, initialScopeConfig: cfg })
  apply(mock.ctx, Config(cfg))

  // Initial registration performs 1 scope.get()
  assert.equal(mock.getScopeGetCalls(), 1, 'scope.get() should only be called once on init')

  // Run 100 consecutive operations (multiple calls in accounts, adapters, etc.)
  // None of these should call scope.get()!
  for (let i = 0; i < 100; i++) {
    // Calling store / helper operations
    normalizeSlots(cfg.slots)
  }

  assert.equal(mock.getScopeGetCalls(), 1, 'consecutive operations must NOT call scope.get()')

  // Now simulate external settings/document-updated event from core
  mock.setSettings({
    slots: [
      { provider: 'codex', index: 1, label: 'Account 1' },
      { provider: 'claude', index: 1, label: 'Account 2' },
      { provider: 'grok', index: 1, label: 'Account 3' },
    ],
  })

  mock.emitEvent('settings/document-updated', 'dsh-subscriptions', 2)

  // Exactly one additional scope.get() call to refresh the snapshot
  assert.equal(mock.getScopeGetCalls(), 2, 'settings/document-updated should trigger exactly one scope.get()')

  // Another batch of operations should still not trigger scope.get()
  for (let i = 0; i < 50; i++) {
    normalizeSlots(cfg.slots)
  }
  assert.equal(mock.getScopeGetCalls(), 2, 'subsequent operations must remain cached')

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
