import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseProxyUrl } from '../lib/proxy.js'
import { registerProxyRoutes } from '../lib/routes/proxy.js'

// #302: the /proxy route is the only prefix route with a caller-controlled
// path. These tests pin its traversal containment and the provider
// allowlist, plus parseProxyUrl scheme hardening.

function harness() {
  const routes = []
  const requested = []
  const ctx = {
    webServer: { register(spec) { routes.push(spec); return () => {} } },
    effect(fn) { fn(); return () => {} },
    log: { warn() {}, error() {}, info() {} },
  }
  const state = {
    live: () => ({}),
    subscriptions: {
      async request(input) {
        requested.push(input)
        return { status: 200, text: async () => '{"ok":true}' }
      },
    },
  }
  registerProxyRoutes(ctx, state)
  const proxy = routes.find((r) => r.path === '/dsh-subscriptions/proxy')
  assert.ok(proxy, 'proxy route registered')
  return { proxy, requested }
}

const res = () => {
  const s = { code: 0, body: '' }
  return { get code() { return s.code }, set code(v) { s.code = v }, get body() { return s.body }, set body(v) { s.body = v }, writeHead(c) { s.code = c }, end(b) { s.body = b || '' }, setHeader() {} }
}

test('unknown provider is rejected with 404 before any request', async () => {
  const { proxy, requested } = harness()
  const r = res()
  await proxy.handler({ method: 'GET', url: '/dsh-subscriptions/proxy/not-a-vendor/path', headers: {} }, r)
  assert.equal(r.code, 404)
  assert.equal(requested.length, 0)
})

test('dot-dot traversal is neutralized by URL normalization, never forwarded', async () => {
  const { proxy, requested } = harness()
  const r = res()
  await proxy.handler({ method: 'GET', url: '/dsh-subscriptions/proxy/codex/../../admin/secret', headers: {} }, r)
  assert.equal(r.code, 404, 'normalized path must not resolve to a valid provider')
  assert.equal(requested.length, 0)
})

test('percent-encoded traversal is resolved by the URL parser and contained', async () => {
  const { proxy, requested } = harness()
  const r = res()
  // WHATWG URL resolves %2e%2e as a dot segment, so the normalized path
  // leaves no valid provider behind: the request is rejected, not forwarded.
  await proxy.handler({ method: 'GET', url: '/dsh-subscriptions/proxy/codex/%2e%2e/other', headers: {} }, r)
  assert.equal(r.code, 404)
  assert.equal(requested.length, 0)
})

test('a valid provider path is forwarded with the declared provider', async () => {
  const { proxy, requested } = harness()
  const r = res()
  await proxy.handler({ method: 'GET', url: '/dsh-subscriptions/proxy/grok/v1/billing', headers: {} }, r)
  assert.equal(requested.length, 1)
  assert.equal(requested[0].provider, 'grok')
  assert.equal(requested[0].path, '/v1/billing')
})

test('parseProxyUrl allows only http, https and socks5', () => {
  assert.equal(parseProxyUrl('http://p:8080').scheme, 'http')
  assert.equal(parseProxyUrl('https://p').port, 443)
  assert.equal(parseProxyUrl('socks5://u:p@p:1080').auth.username, 'u')
  assert.equal(parseProxyUrl('socks5://p').port, 1080)
  assert.equal(parseProxyUrl('ftp://p'), null)
  assert.equal(parseProxyUrl('file:///etc/passwd'), null)
  assert.equal(parseProxyUrl('gopher://p'), null)
  assert.equal(parseProxyUrl('data:text/html,x'), null)
  assert.equal(parseProxyUrl(''), null)
  assert.equal(parseProxyUrl('not a url'), null)
  assert.equal(parseProxyUrl('http://'), null)
})
