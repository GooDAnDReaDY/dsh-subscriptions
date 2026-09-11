import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { discoverLocalCliSessions, loadLocalCliBlob } from '../lib/import-auth.js'

// #296: the CLI importers read local credential files. A fixture home
// keeps the tests hermetic - no real HOME, no env mutation for the
// file-based providers.

async function fixtureHome(files) {
  const root = await mkdtemp(join(tmpdir(), 'dsh-import-'))
  for (const [rel, content] of Object.entries(files)) {
    const target = join(root, rel)
    await mkdir(join(target, '..'), { recursive: true })
    await writeFile(target, typeof content === 'string' ? content : JSON.stringify(content))
  }
  return root
}

async function withHome(files, fn) {
  const root = await fixtureHome(files)
  try {
    return await fn(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

test('detects a Codex CLI session from auth.json', async () => {
  await withHome({ '.codex/auth.json': { access_token: 'at', refresh_token: 'rt', email: 'user@example.com' } }, async (home) => {
    const found = await discoverLocalCliSessions({ home })
    assert.ok(found.codex, 'codex session detected')
    assert.equal(found.codex.provider, 'codex')
    assert.equal(found.codex.email, 'user@example.com')
    assert.equal(found.codex.hasRefreshToken, true)
    assert.ok(found.codex.path.startsWith(home))
  })
})

test('detects a Grok session and falls back to the Hermes path', async () => {
  await withHome({ '.grok/auth.json': { token: 'gt' } }, async (home) => {
    const found = await discoverLocalCliSessions({ home })
    assert.ok(found.grok, 'grok session detected via .grok')
  })
  await withHome({ '.hermes/auth.json': { access_token: 'ht' } }, async (home) => {
    const found = await discoverLocalCliSessions({ home })
    assert.ok(found.grok, 'grok session detected via .hermes fallback')
  })
})

test('detects an Antigravity session from the proxy credentials file', async () => {
  await withHome({ '.cli-proxy-api/antigravity.json': { token: { access_token: 'agt' } } }, async (home) => {
    const found = await discoverLocalCliSessions({ home })
    assert.ok(found.antigravity, 'antigravity session detected')
  })
})

test('a missing or corrupted credential file is ignored without throwing', async () => {
  await withHome({ '.codex/auth.json': 'not json at all' }, async (home) => {
    const found = await discoverLocalCliSessions({ home })
    assert.equal(found.codex, undefined)
  })
  await withHome({}, async (home) => {
    const found = await discoverLocalCliSessions({ home })
    assert.equal(found.codex, undefined)
    assert.equal(found.grok, undefined)
    assert.equal(found.antigravity, undefined)
  })
})

test('loadLocalCliBlob rejects a provider with no detected session', async () => {
  await withHome({}, async (home) => {
    await assert.rejects(() => loadLocalCliBlob('codex', { home }), /no local CLI session found/)
  })
})

test('loadLocalCliBlob returns a usable blob for Codex', async () => {
  await withHome({ '.codex/auth.json': { access_token: 'at', refresh_token: 'rt', email: 'e@x' } }, async (home) => {
    const blob = await loadLocalCliBlob('codex', { home })
    assert.equal(blob.accessToken, 'at')
    assert.ok(blob.expiresAt > Date.now())
  })
})

test('loadLocalCliBlob reads Copilot from the environment token', async () => {
  const prev = process.env.GITHUB_COPILOT_TOKEN
  process.env.GITHUB_COPILOT_TOKEN = 'ghu_test'
  try {
    await withHome({}, async (home) => {
      const blob = await loadLocalCliBlob('copilot', { home })
      assert.equal(blob.accessToken, 'ghu_test')
      assert.equal(blob.refreshToken, 'ghu_test')
    })
  } finally {
    if (prev === undefined) delete process.env.GITHUB_COPILOT_TOKEN
    else process.env.GITHUB_COPILOT_TOKEN = prev
  }
})

test('loadLocalCliBlob reads Cursor and Kiro tokens from their files', async () => {
  await withHome({ '.cursor/auth.json': { accessToken: 'cur', authInfo: { email: 'c@x' } } }, async (home) => {
    const detected = await discoverLocalCliSessions({ home })
    if (detected.cursor) {
      const blob = await loadLocalCliBlob('cursor', { home })
      assert.equal(blob.accessToken, 'cur')
    }
  })
})

test('loadLocalCliBlob rejects unsupported providers explicitly', async () => {
  await withHome({ '.codex/auth.json': { access_token: 'at' } }, async (home) => {
    const detected = await discoverLocalCliSessions({ home })
    if (detected.codex) {
      await assert.rejects(() => loadLocalCliBlob('codex-unknown', { home }), /(no local CLI session found|unsupported)/)
    }
  })
})
