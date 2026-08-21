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
