import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pickAccount, markCooldown, isSwitchableError } from '../lib/rotate.js'

test('skips 100% usage and cooldown, picks the next token', () => {
  const now = 1_000
  const accounts = [
    { ref: 'CODEX_OAUTH_1', hasToken: true, usagePercent: 100, cooldownUntil: 0 },
    { ref: 'CODEX_OAUTH_2', hasToken: true, usagePercent: 10, cooldownUntil: 5_000 },
    { ref: 'CODEX_OAUTH_3', hasToken: true, usagePercent: 10, cooldownUntil: 0 },
  ]
  assert.equal(pickAccount(accounts, now).ref, 'CODEX_OAUTH_3')
})

test('429 is switchable', () => {
  assert.equal(isSwitchableError({ code: 'RATE_LIMIT' }), true)
  assert.equal(isSwitchableError({ status: 429 }), true)
  assert.equal(isSwitchableError({ code: 'AUTH' }), false)
})

test('markCooldown sets a future timestamp', () => {
  const next = markCooldown({ ref: 'X' }, 1000, 500)
  assert.equal(next.cooldownUntil, 1500)
})

test("healthScore prioritizes healthier accounts when usage is equal", () => {
  const now = 1_000
  const accounts = [
    { ref: "ACC_DEGRADED", hasToken: true, usagePercent: 10, cooldownUntil: 0, healthScore: 70 },
    { ref: "ACC_HEALTHY", hasToken: true, usagePercent: 10, cooldownUntil: 0, healthScore: 100 },
  ]
  assert.equal(pickAccount(accounts, now).ref, "ACC_HEALTHY")
})

test("autoPacing prefers account with lower pacing risk", () => {
  const now = 1_000_000
  const resetAt = now + 3600 * 1000 // 1 hour reset
  const accounts = [
    { ref: "HIGH_RISK", hasToken: true, quota: { remainingPercent: 5, resetAt }, pacePerHour: 50, cooldownUntil: 0 }, // Will exhaust in 20 min (deficit)
    { ref: "LOW_RISK", hasToken: true, quota: { remainingPercent: 50, resetAt }, pacePerHour: 10, cooldownUntil: 0 },  // Will last 5 hrs (safe)
  ]
  const picked = pickAccount(accounts, now, { autoPacing: true })
  assert.equal(picked.ref, "LOW_RISK")
})

test("returns null when all accounts are blocked", () => {
  const now = 1_000
  const accounts = [
    { ref: "ACC_COOLDOWN", hasToken: true, usagePercent: 10, cooldownUntil: 5_000 },
    { ref: "ACC_QUARANTINED", hasToken: true, usagePercent: 10, quarantineUntil: 5_000 },
    { ref: "ACC_EXHAUSTED", hasToken: true, usagePercent: 100, cooldownUntil: 0 },
  ]
  const picked = pickAccount(accounts, now)
  assert.equal(picked, null)
})
