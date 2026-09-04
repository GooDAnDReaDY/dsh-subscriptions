import test from 'node:test'
import assert from 'node:assert/strict'
import * as copilot from '../lib/vendors/copilot.js'
import * as qwen from '../lib/vendors/qwen.js'
import * as ernie from '../lib/vendors/ernie.js'
import * as spark from '../lib/vendors/spark.js'
import * as jetbrains from '../lib/vendors/jetbrains.js'
import * as perplexity from '../lib/vendors/perplexity.js'
import * as replit from '../lib/vendors/replit.js'
import * as cody from '../lib/vendors/cody.js'
import { getVendor, isProvider } from '../lib/vendors/index.js'
import { discoverLocalCliSessions } from '../lib/import-auth.js'

test('copilot vendor metadata, models, and telemetry', async () => {
  assert.equal(copilot.id, 'copilot')
  const info = copilot.providerInfo()
  assert.equal(info.name, 'GitHub Copilot')
  const models = await copilot.listModels()
  assert.ok(models.length >= 4)
  assert.ok(models.some((m) => m.id === 'claude-3.7-sonnet'))
  assert.ok(models.some((m) => m.id === 'gpt-4o'))

  const telemetry = copilot.getTelemetryHeaders('test-session-123')
  assert.equal(telemetry['vscode-sessionid'], 'test-session-123')
  assert.ok(telemetry['editor-version'].includes('vscode'))
  assert.equal(telemetry['Openai-Organization'], 'github-copilot')
})

test('copilot streamOnce dispatches request with headers and model', async () => {
  let requestedUrl = ''
  let requestedHeaders = {}
  let requestedBody = null

  const mockFetch = async (url, opts) => {
    requestedUrl = url
    requestedHeaders = opts.headers
    requestedBody = JSON.parse(opts.body)
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Hello Copilot"}}]}\\n\\n'))
        controller.enqueue(new TextEncoder().encode('data: [DONE]\\n\\n'))
        controller.close()
      }
    })
    return new Response(stream, { status: 200 })
  }

  const chunks = []
  const gen = copilot.streamOnce({
    blob: { accessToken: 'gh-mock-token-xyz' },
    options: { model: 'claude-3.7-sonnet', prompt: 'hi', sessionId: 'sess-1' },
    fetchImpl: mockFetch
  })
  for await (const ch of gen) {
    chunks.push(ch)
  }

  assert.ok(requestedUrl.includes('api.githubcopilot.com'))
  assert.equal(requestedHeaders['vscode-sessionid'], 'sess-1')
  assert.equal(requestedHeaders['Authorization'], 'Bearer gh-mock-token-xyz')
  assert.equal(requestedBody.model, 'claude-3.7-sonnet')
  assert.ok(chunks.length > 0)
})

test('qwen vendor metadata and stream', async () => {
  assert.equal(qwen.id, 'qwen')
  const models = await qwen.listModels()
  assert.ok(models.some((m) => m.id === 'qwen-2.5-coder-32b-instruct'))
  const u = await qwen.usage({ apiKey: 'qwen-test-key' })
  assert.ok(u)
  assert.equal(u.usedPercent, 15)
})

test('ernie vendor metadata, models, and usage', async () => {
  assert.equal(ernie.id, 'ernie')
  const models = await ernie.listModels()
  assert.ok(models.some((m) => m.id === 'ernie-speed-128k'))
  const u = await ernie.usage({ accessToken: 'ernie-mock' })
  assert.ok(u)
})

test('spark vendor metadata and models', async () => {
  assert.equal(spark.id, 'spark')
  const models = await spark.listModels()
  assert.ok(models.some((m) => m.id === 'spark-max'))
})

test('jetbrains vendor metadata and models', async () => {
  assert.equal(jetbrains.id, 'jetbrains')
  const models = await jetbrains.listModels()
  assert.ok(models.some((m) => m.id === 'jb-claude-3.5-sonnet'))
})

test('perplexity vendor metadata and models', async () => {
  assert.equal(perplexity.id, 'perplexity')
  const models = await perplexity.listModels()
  assert.ok(models.some((m) => m.id === 'sonar-reasoning-pro'))
  const u = await perplexity.usage({ apiKey: 'pplx-mock' })
  assert.equal(u.plan, 'Perplexity Pro')
})

test('replit vendor metadata and models', async () => {
  assert.equal(replit.id, 'replit')
  const models = await replit.listModels()
  assert.ok(models.some((m) => m.id === 'replit-code-v2'))
  const u = await replit.usage({ token: 'replit-mock' })
  assert.equal(u.plan, 'Replit Core')
})

test('cody vendor metadata and models', async () => {
  assert.equal(cody.id, 'cody')
  const models = await cody.listModels()
  assert.ok(models.some((m) => m.id === 'cody-claude-3.5-sonnet'))
  const u = await cody.usage({ token: 'cody-mock' })
  assert.equal(u.plan, 'Cody Pro')
})

test('vendors index contains all block-1 providers', () => {
  const expected = ['copilot', 'qwen', 'ernie', 'spark', 'jetbrains', 'perplexity', 'replit', 'cody']
  for (const prov of expected) {
    assert.ok(isProvider(prov), `Provider ${prov} should be registered`)
    const vendor = getVendor(prov)
    assert.equal(vendor.id, prov)
  }
})

test('import-auth discoverLocalCliSessions function runs without error', async () => {
  const detected = await discoverLocalCliSessions()
  assert.ok(typeof detected === 'object')
})
