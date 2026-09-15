import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseSemver,
  isNewerVersion,
  isLoopback,
  isTrustedUpdateRequest,
  readCurrentVersion,
  getUpdaterStatus,
  registerPluginUpdater,
} from '../lib/updater.js'

test('updater: parseSemver parses valid and invalid semver', () => {
  assert.deepEqual(parseSemver('0.6.8'), { core: [0, 6, 8], prerelease: [] })
  assert.deepEqual(parseSemver('v1.2.3'), { core: [1, 2, 3], prerelease: [] })
  assert.deepEqual(parseSemver('1.0.0-beta.2'), { core: [1, 0, 0], prerelease: ['beta', '2'] })
  assert.equal(parseSemver('invalid'), undefined)
  assert.equal(parseSemver('1.2'), undefined)
  assert.equal(parseSemver(''), undefined)
})

test('updater: isNewerVersion compares versions correctly', () => {
  assert.equal(isNewerVersion('0.6.8', '0.6.9'), true)
  assert.equal(isNewerVersion('0.6.8', '0.7.0'), true)
  assert.equal(isNewerVersion('0.6.8', '1.0.0'), true)
  assert.equal(isNewerVersion('0.6.8', '0.6.8'), false)
  assert.equal(isNewerVersion('0.6.8', '0.6.7'), false)
  assert.equal(isNewerVersion('0.6.8-beta.1', '0.6.8'), true)
  assert.equal(isNewerVersion('0.6.8-beta.1', '0.6.8-beta.2'), true)
  assert.equal(isNewerVersion('0.6.8', 'invalid'), false)
})

test('updater: isLoopback recognizes IPv4, IPv6 and hostnames', () => {
  assert.equal(isLoopback('127.0.0.1'), true)
  assert.equal(isLoopback('127.0.1.1'), true)
  assert.equal(isLoopback('localhost'), true)
  assert.equal(isLoopback('::1'), true)
  assert.equal(isLoopback('[::1]'), true)
  assert.equal(isLoopback('::ffff:127.0.0.1'), true)
  assert.equal(isLoopback('192.168.1.111'), false)
  assert.equal(isLoopback('8.8.8.8'), false)
  assert.equal(isLoopback('example.com'), false)
  assert.equal(isLoopback(null), false)
  assert.equal(isLoopback(undefined), false)
})

test('updater: isTrustedUpdateRequest validates headers and remote addresses', () => {
  // Trusted loopback with custom header
  assert.equal(isTrustedUpdateRequest({
    headers: { 'x-dsh-plugin-update': '1', host: '127.0.0.1:3000' },
    socket: { remoteAddress: '127.0.0.1' },
  }), true)

  // Non-loopback remote is rejected
  assert.equal(isTrustedUpdateRequest({
    headers: { 'x-dsh-plugin-update': '1', host: '127.0.0.1:3000' },
    socket: { remoteAddress: '192.168.1.100' },
  }), false)

  // Cross-site request without update header is rejected
  assert.equal(isTrustedUpdateRequest({
    headers: { 'sec-fetch-site': 'cross-site', host: 'localhost:3000' },
    socket: { remoteAddress: '127.0.0.1' },
  }), false)

  // Same-origin browser request on loopback is trusted
  assert.equal(isTrustedUpdateRequest({
    headers: {
      origin: 'http://localhost:3000',
      host: 'localhost:3000',
      'sec-fetch-site': 'same-origin',
    },
    socket: { remoteAddress: '127.0.0.1' },
  }), true)
})

test('updater: readCurrentVersion reads package.json version', async () => {
  const version = await readCurrentVersion(new URL('../package.json', import.meta.url))
  assert.match(version, /^\d+\.\d+\.\d+/)
})

test('updater: getUpdaterStatus returns status structure', async () => {
  const status = await getUpdaterStatus({
    packageName: '@goodandready/dsh-subscriptions',
    manifestUrl: new URL('../package.json', import.meta.url),
    registry: 'https://registry.npmjs.org',
  }, {
    profileName: 'web',
    profileDir: '/tmp',
  })
  assert.equal(status.ok, true)
  assert.equal(status.packageName, '@goodandready/dsh-subscriptions')
  assert.ok(typeof status.currentVersion === 'string')
  assert.equal(status.profileName, 'web')
  assert.equal(status.canAutoUpdate, false) // no cliEntry in mock target
})

test('updater: registerPluginUpdater route handles GET, 405 on unsupported methods, and 403 on untrusted POST', async () => {
  let registeredRoute = null
  const mockCtx = {
    webServer: {
      register(spec) {
        registeredRoute = spec
        return () => {}
      },
    },
    logger: { warn() {} },
  }

  registerPluginUpdater(mockCtx, {
    endpoint: '/dsh-subscriptions/update',
    packageName: '@goodandready/dsh-subscriptions',
    manifestUrl: new URL('../package.json', import.meta.url),
  })

  assert.ok(registeredRoute)
  assert.equal(registeredRoute.path, '/dsh-subscriptions/update')

  const createMockRes = () => {
    let statusCode = 200
    const headers = {}
    let body = ''
    return {
      writeHead(code, h) { statusCode = code; Object.assign(headers, h) },
      setHeader(k, v) { headers[k] = v },
      end(chunk) { if (chunk) body += chunk },
      get statusCode() { return statusCode },
      get body() { return body },
      get headers() { return headers },
    }
  }

  // GET returns 200 with updater status
  const getRes = createMockRes()
  await registeredRoute.handler({
    method: 'GET',
    headers: { host: '127.0.0.1' },
    socket: { remoteAddress: '127.0.0.1' },
  }, getRes)
  assert.equal(getRes.statusCode, 200)
  const getPayload = JSON.parse(getRes.body)
  assert.equal(getPayload.ok, true)
  assert.equal(getPayload.packageName, '@goodandready/dsh-subscriptions')

  // PUT returns 405
  const putRes = createMockRes()
  await registeredRoute.handler({
    method: 'PUT',
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
  }, putRes)
  assert.equal(putRes.statusCode, 405)

  // Untrusted POST returns 403
  const postUntrustedRes = createMockRes()
  await registeredRoute.handler({
    method: 'POST',
    headers: { host: '127.0.0.1' },
    socket: { remoteAddress: '192.168.1.200' },
  }, postUntrustedRes)
  assert.equal(postUntrustedRes.statusCode, 403)
  const untrustedPayload = JSON.parse(postUntrustedRes.body)
  assert.equal(untrustedPayload.ok, false)
  assert.equal(untrustedPayload.error.code, 'forbidden')
})
