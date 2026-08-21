import { test } from 'node:test'
import assert from 'node:assert/strict'
import { httpError } from '../lib/wire.js'

test('vendor 401 stays VENDOR so the UI does not say API key is invalid', () => {
  const err = httpError(401, '{"error":{"message":"UNAUTHENTICATED"}}')
  assert.equal(err.code, 'VENDOR')
  assert.match(err.message, /401/)
})

test('429 is RATE_LIMIT', () => {
  const err = httpError(429, '{"error":{"status":"RESOURCE_EXHAUSTED"}}')
  assert.equal(err.code, 'RATE_LIMIT')
})
