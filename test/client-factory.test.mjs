import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const clientPath = fileURLToPath(new URL('../lib/client.js', import.meta.url))

test('client.js parses without syntax errors', () => {
  execFileSync(process.execPath, ['--check', clientPath], { stdio: 'pipe' })
})

const src = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')

test('client factory uses CommonJS shim and scoped id', () => {
  assert.match(src, /var module = \{ exports: \{\} \}/)
  assert.match(src, /var exports = module.exports/)
  assert.match(src, /return module.exports/)
  assert.match(src, /id: '@goodandready\/dsh-subscriptions'/)
  assert.match(src, /\/dsh-subscriptions\/oauth/)
  assert.match(src, /settings\.section/)
})

test('registers plugin.item card with NS key, section as fallback', () => {
  assert.match(src, /settings\.plugin\.item/)
  assert.match(src, /key: NS/)
  // fallback path kept for builds without the slot
  assert.match(src, /settings\.section/)
})
