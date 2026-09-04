import test from 'node:test'
import assert from 'node:assert/strict'
import { ProactiveTokenRefreshDaemon } from '../lib/proactive-refresh.js'
import { storePkceState, consumePkceState } from '../lib/pkce-store.js'
import { exportEncryptedBundle, importEncryptedBundle } from '../lib/encrypted-bundle.js'
import { detectCodexBillingType } from '../lib/credit-detect.js'
import { isTokenRevokedError, handleAccountRevocation } from '../lib/revocation.js'
import { parseRateLimitHeaders } from '../lib/ratelimit-parser.js'
import { sanitizeLogText } from '../lib/zero-trace-logger.js'
import { filterAccountsForUser } from '../lib/multi-tenant.js'
import { extractBearerFromCookie } from '../lib/cookie-bridge.js'

test('proactive token refresh daemon identifies expiring tokens (#186)', async () => {
  const daemon = new ProactiveTokenRefreshDaemon({ refreshLeadMs: 1000, checkIntervalMs: 50 })
  let refreshed = false

  const accounts = [
    { ref: 'acc-1', expiresAt: Date.now() + 500, refreshToken: 'rt-1' }
  ]

  daemon.start(
    async () => accounts,
    async (acc) => {
      refreshed = true
    }
  )

  await new Promise((r) => setTimeout(r, 120))
  daemon.stop()
  assert.ok(refreshed)
})

test('pkce single-use state consumption prevents replay attack (#187)', () => {
  storePkceState('state-123', 'verifier-secret-abc')
  const consumed = consumePkceState('state-123')
  assert.equal(consumed, 'verifier-secret-abc')

  // Second consumption fails (prevent INVALID_REPLAY_STATE)
  const replayed = consumePkceState('state-123')
  assert.equal(replayed, null)
})

test('encrypted pool bundle export and import with AES-256-GCM (#188)', () => {
  const data = { accounts: [{ id: 'acc-1', token: 'secret-token' }] }
  const password = 'StrongPassword!2026'

  const bundle = exportEncryptedBundle(data, password)
  assert.equal(bundle.algorithm, 'aes-256-gcm')
  assert.ok(bundle.payload)
  assert.ok(bundle.authTag)

  const restored = importEncryptedBundle(bundle, password)
  assert.deepEqual(restored, data)

  assert.throws(() => {
    importEncryptedBundle(bundle, 'WrongPassword')
  })
})

test('codex credit and plan detection (#189)', () => {
  const res1 = detectCodexBillingType({ plan: 'codex_team', hard_limit_reached: true })
  assert.equal(res1.plan, 'Team')
  assert.equal(res1.isHardLimit, true)

  const res2 = detectCodexBillingType({ subscription_type: 'pro', remaining_credits: 50 })
  assert.equal(res2.plan, 'Pro')
  assert.equal(res2.remainingCredits, 50)
})

test('token revocation handling (#191)', () => {
  const err = new Error('invalid_grant: refresh token expired')
  assert.ok(isTokenRevokedError(err))

  const acc = { ref: 'acc-1', hasToken: true }
  const handled = handleAccountRevocation(acc)
  assert.equal(handled.hasToken, false)
  assert.equal(handled.needsReauth, true)
})

test('rate limit headers dynamic parser (#192)', () => {
  const headers = {
    'x-ratelimit-remaining-tokens': '150000',
    'x-ratelimit-reset-requests': '2s'
  }
  const parsed = parseRateLimitHeaders(headers)
  assert.equal(parsed.remainingTokens, 150000)
  assert.equal(parsed.resetRequestsTime, '2s')
})

test('zero trace logger masks tokens and credentials (#193)', () => {
  const log = 'Request with Bearer sk-ant-1234567890 and "accessToken": "super-secret"'
  const masked = sanitizeLogText(log)
  assert.ok(!masked.includes('sk-ant-1234567890'))
  assert.ok(!masked.includes('super-secret'))
  assert.ok(masked.includes('***MASKED***'))
})

test('multi-tenant account isolation (#194)', () => {
  const accounts = [
    { id: 'acc-admin', allowedUsers: ['alice'] },
    { id: 'acc-public' }
  ]

  const forBob = filterAccountsForUser(accounts, { username: 'bob', isAdmin: false })
  assert.equal(forBob.length, 1)
  assert.equal(forBob[0].id, 'acc-public')

  const forAlice = filterAccountsForUser(accounts, { username: 'alice', isAdmin: false })
  assert.equal(forAlice.length, 2)

  const forAdmin = filterAccountsForUser(accounts, { username: 'charlie', isAdmin: true })
  assert.equal(forAdmin.length, 2)
})

test('cookie to token bridge extracts bearer token (#195)', () => {
  const cookie = 'other=123; __Secure-next-auth.session-token=jwt-secret-abc-123; theme=dark'
  const token = extractBearerFromCookie(cookie)
  assert.equal(token, 'jwt-secret-abc-123')
})
