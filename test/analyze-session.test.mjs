import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analyzeSessionEvents } from '../lib/analyze-session.js'

test('analyzeSessionEvents handles empty list', () => {
  const res = analyzeSessionEvents([])
  assert.equal(res.totalCalls, 0)
  assert.equal(res.weightedCacheHitPercent, 0)
})

test('analyzeSessionEvents calculates prompt cache hit percent', () => {
  const events = [
    { usage: { prompt_tokens: 1000, prompt_tokens_details: { cached_tokens: 0 }, completion_tokens: 50 } },
    { usage: { prompt_tokens: 1200, prompt_tokens_details: { cached_tokens: 1000 }, completion_tokens: 60 } },
    { usage: { prompt_tokens: 1500, prompt_tokens_details: { cached_tokens: 1200 }, completion_tokens: 70 } },
  ]
  const res = analyzeSessionEvents(events)
  assert.equal(res.totalCalls, 3)
  assert.equal(res.promptTokens, 3700)
  assert.equal(res.cachedTokens, 2200)
  // 2200 / 3700 = 59.5%
  assert.equal(res.weightedCacheHitPercent, 59.5)
  assert.equal(res.calls[0].classification, 'cold_start')
  assert.equal(res.calls[1].classification, 'cache_hit')
})
