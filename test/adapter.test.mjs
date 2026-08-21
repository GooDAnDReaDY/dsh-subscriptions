import { test } from 'node:test'
import assert from 'node:assert/strict'
import { streamWithRotation } from '../lib/stream-rotate.js'

test('retries the next account after 429', async () => {
  const accounts = [
    { ref: 'CODEX_OAUTH_1', hasToken: true, usagePercent: 10, cooldownUntil: 0 },
    { ref: 'CODEX_OAUTH_2', hasToken: true, usagePercent: 10, cooldownUntil: 0 },
  ]
  const seen = []
  async function* streamOnce(account) {
    seen.push(account.ref)
    if (account.ref === 'CODEX_OAUTH_1') {
      const err = new Error('limited')
      err.status = 429
      throw err
    }
    yield { type: 'text-delta', index: 0, text: 'ok' }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
  const chunks = []
  for await (const chunk of streamWithRotation({
    accounts,
    nowMs: () => 1,
    cooldownMs: 1000,
    streamOnce,
    options: { provider: 'codex', model: 'x', messages: [] },
    onCooldown: () => {},
  })) chunks.push(chunk)
  assert.deepEqual(seen, ['CODEX_OAUTH_1', 'CODEX_OAUTH_2'])
  assert.equal(chunks[0].text, 'ok')
})
