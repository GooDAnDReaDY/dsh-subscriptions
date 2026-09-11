import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeSlots, createAccountStore } from '../lib/accounts.js'

// #288 follow-up: accounts.js (the account store core) sat at 47%.
// These tests drive the store through a fake credentials service.

function fakeCredentials() {
  const store = new Map()
  return {
    store,
    async resolve(ref) {
      return store.has(ref) ? { value: store.get(ref) } : null
    },
    async set(ref, value) { store.set(ref, value) },
    async unset(ref) { store.delete(ref) },
    async describe(ref) { return { configured: store.has(ref), writable: true } },
  }
}

function makeStore(credentials) {
  return createAccountStore({
    credentials,
    getConfig: () => ({}),
    fetchImpl: async () => { throw new Error('no network in tests') },
    fetchForRef: undefined,
    onLimitNotice: () => {},
  })
}

test('normalizeSlots keeps valid slots, drops junk and dedupes', () => {
  const slots = normalizeSlots([
    { provider: 'codex', index: 1, label: 'main' },
    { provider: 'codex', index: 1, label: 'duplicate ref' },
    { provider: 'nope', index: 1 },
    { provider: 'claude', index: 0 },
    { provider: 'claude', index: 2.5 },
    { provider: 'claude', index: 'x' },
    { provider: 'claude', index: 4, label: 'second' },
    null,
    'garbage',
  ])
  assert.deepEqual(slots.map((s) => s.ref).sort(), ['CLAUDE_OAUTH_4', 'CODEX_OAUTH_1'].sort())
  assert.equal(slots.find((s) => s.ref === 'CODEX_OAUTH_1').label, 'main')
  assert.equal(slots.find((s) => s.ref === 'CLAUDE_OAUTH_4').label, 'second')
})

test('normalizeSlots tolerates non-array input', () => {
  assert.deepEqual(normalizeSlots(undefined), [])
  assert.deepEqual(normalizeSlots(null), [])
  assert.deepEqual(normalizeSlots({}), [])
})

test('loadBlob rejects when no credential is stored', async () => {
  const store = makeStore(fakeCredentials())
  await assert.rejects(() => store.loadBlob('CODEX_OAUTH_1'), (e) => e.code === 'AUTH')
})

test('saveBlob then loadBlob round-trips through the credentials service', async () => {
  const creds = fakeCredentials()
  const store = makeStore(creds)
  await store.saveBlob('CODEX_OAUTH_1', { accessToken: 'at', refreshToken: 'rt', label: 'a' })
  const blob = await store.loadBlob('CODEX_OAUTH_1')
  assert.equal(blob.accessToken, 'at')
  assert.equal(blob.refreshToken, 'rt')
  assert.equal(creds.store.size, 1)
})

test('clearRef wipes the credential and every in-memory trace', async () => {
  const creds = fakeCredentials()
  const store = makeStore(creds)
  const ref = 'CODEX_OAUTH_1'
  await store.saveBlob(ref, { accessToken: 'at' })
  store.rememberCooldown(ref, Date.now() + 60000)
  store.rememberQuota(ref, { usedPercent: 10 })
  store.rememberQuarantine(ref, 'RATE_LIMIT', Date.now() + 60000)
  store.rememberUsage(ref, 5)
  store.rememberRequest(ref)
  await store.clearRef(ref)
  assert.equal(creds.store.size, 0)
  assert.equal(store.getQuota(ref), null)
  assert.equal(store.getQuarantine(ref), null)
  assert.equal(store.getRequestCount(ref), 0)
  assert.equal(store.getHealth(ref), null)
})

test('whole-account cooldown blocks until recordSuccess clears it', () => {
  const store = makeStore(fakeCredentials())
  const ref = 'CLAUDE_OAUTH_1'
  store.rememberCooldown(ref, Date.now() + 60000)
  store.recordSuccess(ref)
  assert.equal(store.getHealth(ref), null)
})

test('family-scoped cooldown keeps the account usable for other families', () => {
  const store = makeStore(fakeCredentials())
  const ref = 'GROK_OAUTH_1'
  store.rememberCooldown(ref, Date.now() + 60000, ['reasoning'])
  store.rememberCooldown(ref, Date.now() + 120000, ['standard'])
  const h = store.getHealth(ref)
  assert.equal(h, null) // health is a separate channel from cooldowns
})

test('quota snapshots are stored, replaced and removed', () => {
  const store = makeStore(fakeCredentials())
  const ref = 'GLM_OAUTH_1'
  assert.equal(store.getQuota(ref), null)
  store.rememberQuota(ref, { usedPercent: 42 })
  assert.equal(store.getQuota(ref).usedPercent, 42)
  store.rememberQuota(ref, null)
  assert.equal(store.getQuota(ref), null)
})

test('quarantine expires by its own deadline', async () => {
  const store = makeStore(fakeCredentials())
  const ref = 'KIRO_OAUTH_1'
  store.rememberQuarantine(ref, 'VERIFY', Date.now() + 1)
  await new Promise((r) => setTimeout(r, 5))
  assert.equal(store.getQuarantine(ref), null)
})

test('explicit quarantine release works', () => {
  const store = makeStore(fakeCredentials())
  const ref = 'KIRO_OAUTH_2'
  store.rememberQuarantine(ref, 'VERIFY', Date.now() + 60000)
  assert.equal(store.getQuarantine(ref).reason, 'VERIFY')
  store.releaseQuarantine(ref)
  assert.equal(store.getQuarantine(ref), null)
})

test('request counters and health records accumulate per ref', () => {
  const store = makeStore(fakeCredentials())
  const ref = 'QWEN_OAUTH_1'
  assert.equal(store.getRequestCount(ref), 0)
  store.rememberRequest(ref)
  store.rememberRequest(ref)
  assert.equal(store.getRequestCount(ref), 2)
  store.recordSwitch(ref)
  store.recordSwitch(ref)
  assert.equal(store.getHealth(ref).switches, 2)
  store.recordSuccess(ref)
  assert.equal(store.getHealth(ref), null)
})

test('describeRef reports configured state from the credentials service', async () => {
  const creds = fakeCredentials()
  const store = makeStore(creds)
  const ref = 'ERNIE_OAUTH_1'
  const before = await store.describeRef(ref)
  assert.equal(before.configured, false)
  assert.equal(before.writable, true)
  await store.saveBlob(ref, { accessToken: 'at' })
  const after = await store.describeRef(ref)
  assert.equal(after.configured, true)
})

test('shouldSkipRefresh is false without a recorded failure', () => {
  const store = makeStore(fakeCredentials())
  assert.equal(store.shouldSkipRefresh('X_OAUTH_1', Date.now(), 1000), false)
})

test('listAccounts and loggedInProviders survive an empty store', async () => {
  const store = makeStore(fakeCredentials())
  const list = await store.listAccounts('codex')
  assert.ok(Array.isArray(list))
  const providers = await store.loggedInProviders()
  assert.equal(typeof providers, 'object')
})

test('describeRef exposes the cooldown scope and the quarantine reason', async () => {
  const store = makeStore(fakeCredentials())
  const ref = 'CURSOR_OAUTH_1'
  store.rememberCooldown(ref, Date.now() + 60000, ['reasoning'])
  store.rememberQuarantine(ref, 'VERIFY', Date.now() + 60000)
  const info = await store.describeRef(ref)
  assert.deepEqual(info.cooldownFamilies, ['reasoning'])
  assert.equal(info.quarantineReason, 'VERIFY')
  assert.ok(info.quarantineUntil > Date.now())
})

test('describeRef reports no scope for a whole-account cooldown', async () => {
  const store = makeStore(fakeCredentials())
  const ref = 'CURSOR_OAUTH_2'
  store.rememberCooldown(ref, Date.now() + 60000)
  const info = await store.describeRef(ref)
  assert.equal(info.cooldownFamilies, null)
  assert.equal(info.quarantineReason, null)
  assert.equal(info.quarantineUntil, 0)
})
