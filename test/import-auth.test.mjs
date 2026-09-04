import { test } from 'node:test'
import assert from 'node:assert/strict'
import { discoverLocalCliSessions } from '../lib/import-auth.js'

test('discoverLocalCliSessions returns object with detected providers', async () => {
  const detected = await discoverLocalCliSessions()
  assert.ok(typeof detected === 'object' && detected !== null)
})
