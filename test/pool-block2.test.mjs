import test from 'node:test'
import assert from 'node:assert/strict'
import { pickAccount } from '../lib/rotate.js'
import { withFileLock } from '../lib/atomic-lock.js'
import { pinSession, getPinnedAccountRef, clearSessionPins } from '../lib/session-pin.js'
import { putInQuarantine, isQuarantined, releaseFromQuarantine } from '../lib/quarantine.js'
import { streamWithRotation } from '../lib/stream-rotate.js'

test('atomic lock: serializes concurrent executions with file lock (#169)', async () => {
  const tmpFile = '/tmp/test-atomic-pool-lock'
  let counter = 0
  const op = async () => {
    await withFileLock(tmpFile, async () => {
      const current = counter
      await new Promise((r) => setTimeout(r, 20))
      counter = current + 1
    })
  }

  await Promise.all([op(), op(), op()])
  assert.equal(counter, 3)
})

test('sticky session pinning: pins session to specific slot (#170)', () => {
  clearSessionPins()
  pinSession('sess-abc', 'account-ref-1')
  assert.equal(getPinnedAccountRef('sess-abc'), 'account-ref-1')
  assert.equal(getPinnedAccountRef('unknown-sess'), null)

  const accounts = [
    { ref: 'account-ref-1', hasToken: true },
    { ref: 'account-ref-2', hasToken: true }
  ]
  const chosen = pickAccount(accounts, Date.now(), { sessionId: 'sess-abc' })
  assert.equal(chosen.ref, 'account-ref-1')
})

test('safety quota buffer (5% threshold) & least-remaining window (#167, #168)', () => {
  const now = 1000000
  const acc1 = {
    ref: 'acc-near-limit',
    hasToken: true,
    quota: { remaining: 4, limit: 100, resetAt: now + 3600000 } // 4% <= 5% safety buffer
  }
  const acc2 = {
    ref: 'acc-healthy-soonest-reset',
    hasToken: true,
    quota: { remaining: 50, limit: 100, resetAt: now + 600000 } // resets in 10 mins
  }
  const acc3 = {
    ref: 'acc-healthy-later-reset',
    hasToken: true,
    quota: { remaining: 50, limit: 100, resetAt: now + 18000000 } // resets in 5 hours
  }

  const chosen = pickAccount([acc1, acc2, acc3], now, {})
  assert.equal(chosen.ref, 'acc-healthy-soonest-reset')
})

test('vip reservation and tag-based filtering (#173, #175)', () => {
  const accounts = [
    { ref: 'acc-vip', hasToken: true, vipOnly: true, tags: ['work'] },
    { ref: 'acc-shared', hasToken: true, vipOnly: false, tags: ['general'] }
  ]

  // Normal request does not get VIP slot
  const normal = pickAccount(accounts, Date.now(), { vip: false })
  assert.equal(normal.ref, 'acc-shared')

  // VIP request gets VIP slot
  const vip = pickAccount(accounts, Date.now(), { vip: true })
  assert.equal(vip.ref, 'acc-vip')

  // Tag filtering
  const general = pickAccount(accounts, Date.now(), { tag: 'general' })
  assert.equal(general.ref, 'acc-shared')
})

test('quarantine manager sets and checks quarantine duration (#172)', () => {
  const now = 1000
  const acc = { ref: 'acc-limited', hasToken: true }
  const inQuarantine = putInQuarantine(acc, 'RATE_LIMIT', now)
  assert.ok(isQuarantined(inQuarantine, now + 1000))
  assert.ok(!isQuarantined(inQuarantine, now + 3700000))

  const released = releaseFromQuarantine(inQuarantine)
  assert.ok(!isQuarantined(released, now + 1000))
})

test('seamless failover on 429/500 switchable error (#166)', async () => {
  const acc1 = { ref: 'fail-429', hasToken: true }
  const acc2 = { ref: 'success-slot', hasToken: true }

  const streamOnce = async function* (account) {
    if (account.ref === 'fail-429') {
      const err = new Error('Rate limit')
      err.status = 429
      throw err
    }
    yield 'chunk-from-acc2'
  }

  const chunks = []
  for await (const chunk of streamWithRotation({
    accounts: [acc1, acc2],
    nowMs: () => Date.now(),
    cooldownMs: 60000,
    streamOnce,
    options: {}
  })) {
    chunks.push(chunk)
  }

  assert.deepEqual(chunks, ['chunk-from-acc2'])
})

test('offline fallback triggers when all accounts exhausted (#174)', async () => {
  const acc1 = { ref: 'fail-1', hasToken: true }

  const streamOnce = async function* () {
    const err = new Error('500 Server Error')
    err.status = 500
    throw err
  }

  const offlineFallback = async function* (opts, lastErr) {
    yield `offline-fallback-ok: ${lastErr.message}`
  }

  const chunks = []
  for await (const chunk of streamWithRotation({
    accounts: [acc1],
    nowMs: () => Date.now(),
    cooldownMs: 60000,
    streamOnce,
    options: {},
    offlineFallback
  })) {
    chunks.push(chunk)
  }

  assert.ok(chunks[0].includes('offline-fallback-ok'))
})
