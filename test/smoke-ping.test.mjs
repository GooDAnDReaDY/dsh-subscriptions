import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerStatusRoutes } from '../lib/routes/status.js'
import { HistoryStore } from '../lib/history.js'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtempSync, rmSync } from 'node:fs'

function fakeCtx() {
  const routes = []
  const ctx = {
    webServer: { register(spec) { routes.push(spec) } },
    effect(fn) { fn(); return () => {} },
    log: { warn() {}, error() {}, info() {} },
  }
  return { ctx, routes }
}

test('telemetry route returns summary object with 200', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsub-telemetry-'))
  try {
    const history = new HistoryStore(dir, 100000)
    history.add({ provider: 'codex', model: 'gpt-5', path: '/responses', status: 200, ms: 150 })
    history.add({ provider: 'claude', model: 'claude-3-7-sonnet', path: '/v1/messages', status: 500, ms: 300 })

    const { ctx, routes } = fakeCtx()
    registerStatusRoutes(ctx, {
      accountsView: async () => [],
      live: () => ({}),
      getSettingsApi: () => ({}),
      syncCustomVendors: () => {},
      syncAdapter: async () => {},
      stripLegacySlots: () => {},
      store: { describeRef: async () => ({ configured: false }) },
      history,
      pmL: (x) => x,
      pmE: (x) => x,
    })

    const telemetryRoute = routes.find((r) => r.path === '/dsh-subscriptions/telemetry')
    assert.ok(telemetryRoute, 'telemetry route registered')

    let statusCode = 0
    let payload = null
    const res = {
      writeHead(c) { statusCode = c },
      end(b) { payload = JSON.parse(b) },
      setHeader() {},
    }

    await telemetryRoute.handler({ method: 'GET', headers: {} }, res)
    assert.equal(statusCode, 200)
    assert.equal(payload.ok, true)
    assert.equal(payload.telemetry.totalRequests, 2)
    assert.equal(payload.telemetry.successRequests, 1)
    assert.equal(payload.telemetry.errorRequests, 1)
    assert.equal(payload.telemetry.successRate, 50)
    assert.equal(payload.telemetry.avgLatencyMs, 225)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('smoke route returns 400 if no connected account', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'dsub-smoke-'))
  try {
    const history = new HistoryStore(dir, 100000)
    const { ctx, routes } = fakeCtx()
    registerStatusRoutes(ctx, {
      accountsView: async () => [],
      live: () => ({}),
      getSettingsApi: () => ({}),
      syncCustomVendors: () => {},
      syncAdapter: async () => {},
      stripLegacySlots: () => {},
      store: { describeRef: async () => ({ configured: false }) },
      history,
      pmL: (x) => x,
      pmE: (x) => x,
    })

    const smokeRoute = routes.find((r) => r.path === '/dsh-subscriptions/smoke')
    assert.ok(smokeRoute, 'smoke route registered')

    let statusCode = 0
    let payload = null
    const res = {
      writeHead(c) { statusCode = c },
      end(b) { payload = JSON.parse(b) },
      setHeader() {},
    }

    const req = {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      on(event, handler) {
        if (event === 'data') handler(Buffer.from('{}'))
        if (event === 'end') handler()
      },
    }

    await smokeRoute.handler(req, res)
    assert.equal(statusCode, 400)
    assert.equal(payload.ok, false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
