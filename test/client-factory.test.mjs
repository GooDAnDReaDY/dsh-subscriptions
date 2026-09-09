import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const clientPath = fileURLToPath(new URL('../lib/client.js', import.meta.url))

test('client.js parses without syntax errors', () => {
  execFileSync(process.execPath, ['--check', clientPath], { stdio: 'pipe' })
})

test('client ui modules parse without syntax errors', () => {
  const dir = fileURLToPath(new URL('../lib/ui/', import.meta.url))
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.js'))) {
    execFileSync(process.execPath, ['--check', dir + f], { stdio: 'pipe' })
  }
})

// The client half is modular since #266: contract markers are checked
// against the combined sources of the entry file and its ui modules.
import { readdirSync } from 'node:fs'
const uiDir = fileURLToPath(new URL('../lib/ui/', import.meta.url))
const src = [readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')]
  .concat(readdirSync(uiDir).filter((f) => f.endsWith('.js')).map((f) => readFileSync(uiDir + f, 'utf8')))
  .join(String.fromCharCode(10))

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
