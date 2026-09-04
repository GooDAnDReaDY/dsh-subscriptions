import test from 'node:test'
import assert from 'node:assert/strict'
import { generateIdeTelemetryHeaders, getRandomUserAgent } from '../lib/telemetry.js'
import { PromptCacheWarmer } from '../lib/prompt-cache-warmer.js'
import { coalesceStreamChunks } from '../lib/coalesce-stream.js'
import { LatencyTracker } from '../lib/latency-score.js'
import { executeWithRetry } from '../lib/backoff.js'
import { estimateTokens, validateContextLimit } from '../lib/preflight-tokens.js'
import { streamWithReconnect } from '../lib/reconnect-stream.js'

test('telemetry headers generation and user-agent rotation (#176, #182)', () => {
  const h1 = generateIdeTelemetryHeaders('sess-1')
  assert.equal(h1['vscode-sessionid'], 'sess-1')
  assert.ok(h1['vscode-machineid'])
  assert.ok(h1['User-Agent'].length > 0)

  const ua = getRandomUserAgent('seed-user-1')
  assert.ok(typeof ua === 'string')
})

test('prompt cache warmer scheduling (#177)', async () => {
  const warmer = new PromptCacheWarmer(50) // 50ms ttl
  let called = false
  warmer.touchSession('s1', 'slot-1', async () => {
    called = true
  })

  await new Promise((r) => setTimeout(r, 80))
  assert.ok(called)
  assert.ok(warmer.isWarmed('s1'))
  warmer.clear()
})

test('stream chunk coalescing combines tiny chunks (#178)', async () => {
  async function* tinyStream() {
    yield 'a'
    yield 'b'
    yield 'c'
    yield 'd'
  }

  const chunks = []
  for await (const chunk of coalesceStreamChunks(tinyStream(), 50, 10)) {
    chunks.push(chunk)
  }

  assert.equal(chunks.join(''), 'abcd')
  assert.ok(chunks.length < 4) // coalesced into fewer chunks
})

test('latency tracker calculates running average and health score (#179)', () => {
  const tracker = new LatencyTracker()
  tracker.record('slot-fast', 120)
  tracker.record('slot-fast', 140)
  assert.equal(tracker.getAverage('slot-fast'), 130)
  assert.equal(tracker.getHealthScore('slot-fast'), 100)

  tracker.record('slot-slow', 2500)
  assert.equal(tracker.getHealthScore('slot-slow'), 30)
})

test('exponential backoff with jitter retries transient failure (#181)', async () => {
  let attempts = 0
  const result = await executeWithRetry(async () => {
    attempts++
    if (attempts < 3) throw new Error('ECONNRESET')
    return 'ok-retry'
  }, { maxRetries: 3, initialDelayMs: 20 })

  assert.equal(result, 'ok-retry')
  assert.equal(attempts, 3)
})

test('token pre-flight estimation and context limit validation (#184)', () => {
  const count = estimateTokens('Hello world this is a test prompt for subscription models.')
  assert.ok(count > 5)

  const validation = validateContextLimit([{ content: 'Short message' }], 1000)
  assert.ok(validation.isSafe)
  assert.ok(validation.marginTokens > 900)
})

test('stream reconnect recovers after dropped stream (#185)', async () => {
  let attempt = 0
  const producer = async function* (offset) {
    attempt++
    if (attempt === 1) {
      yield 'chunk1'
      throw new Error('Socket closed')
    }
    yield 'chunk2'
  }

  const collected = []
  for await (const ch of streamWithReconnect(producer, { maxReconnects: 2 })) {
    collected.push(ch)
  }

  assert.deepEqual(collected, ['chunk1', 'chunk2'])
})
