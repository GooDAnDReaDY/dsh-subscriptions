import { test } from 'node:test'
import assert from 'node:assert/strict'
import { serializeBlob, parseBlob } from '../lib/blob.js'

test('blob round-trip does not drop refreshToken', () => {
  const raw = serializeBlob({
    accessToken: 'at', refreshToken: 'rt', expiresAt: 1, label: 'acct', email: 'a@b.c',
  })
  const parsed = parseBlob(raw)
  assert.equal(parsed.refreshToken, 'rt')
  assert.equal(JSON.parse(raw).refreshToken, 'rt')
})

test('serializeBlob rejects empty access and refresh', () => {
  assert.throws(() => serializeBlob({ accessToken: '', refreshToken: '' }))
})
