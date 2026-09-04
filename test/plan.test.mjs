import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizePlanName } from '../lib/plan.js'

test('normalizePlanName for codex plans', () => {
  assert.equal(normalizePlanName('codex', 'plus'), 'Plus')
  assert.equal(normalizePlanName('codex', 'chatgpt_plus'), 'Plus')
  assert.equal(normalizePlanName('codex', 'pro'), 'Pro 20x')
  assert.equal(normalizePlanName('codex', 'chatgpt_pro_20x'), 'Pro 20x')
  assert.equal(normalizePlanName('codex', 'prolite'), 'Pro 5x')
  assert.equal(normalizePlanName('codex', 'team'), 'Team')
  assert.equal(normalizePlanName('codex', 'enterprise'), 'Enterprise')
})

test('normalizePlanName for grok plans', () => {
  assert.equal(normalizePlanName('grok', 'supergrok'), 'SuperGrok')
  assert.equal(normalizePlanName('grok', 'x_premium_plus'), 'X Premium+')
  assert.equal(normalizePlanName('grok', 'premium'), 'X Premium')
})

test('normalizePlanName for kimi and glm defaults', () => {
  assert.equal(normalizePlanName('kimi', ''), 'Coding Plan')
  assert.equal(normalizePlanName('glm', ''), 'Coding Plan 150%')
})
