import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pinSession, getPinnedAccountRef, unpinSession, clearSessionPins } from '../lib/session-pin.js'

// #288 follow-up: session-pin had 34% coverage. Pin lifecycle matters
// for account stickiness during a conversation.

test('pin then read returns the bound account', () => {
  clearSessionPins()
  pinSession('s1', 'REF_A')
  assert.equal(getPinnedAccountRef('s1'), 'REF_A')
})

test('unknown and empty session ids return null', () => {
  clearSessionPins()
  assert.equal(getPinnedAccountRef('missing'), null)
  assert.equal(getPinnedAccountRef(''), null)
  assert.equal(getPinnedAccountRef(undefined), null)
  assert.equal(getPinnedAccountRef(null), null)
})

test('pinning without session or account is a no-op', () => {
  clearSessionPins()
  pinSession('', 'REF_A')
  pinSession('s2', '')
  pinSession(undefined, undefined)
  assert.equal(getPinnedAccountRef('s2'), null)
  assert.equal(getPinnedAccountRef(''), null)
})

test('expired pins are dropped on read', async () => {
  clearSessionPins()
  pinSession('s3', 'REF_B', 1)
  await new Promise((r) => setTimeout(r, 5))
  assert.equal(getPinnedAccountRef('s3'), null)
  // and the entry is gone for good
  assert.equal(getPinnedAccountRef('s3'), null)
})

test('a later pin replaces the earlier one', () => {
  clearSessionPins()
  pinSession('s4', 'REF_OLD')
  pinSession('s4', 'REF_NEW')
  assert.equal(getPinnedAccountRef('s4'), 'REF_NEW')
})

test('unpin removes a single session, clear removes all', () => {
  clearSessionPins()
  pinSession('s5', 'REF_C')
  pinSession('s6', 'REF_D')
  unpinSession('s5')
  assert.equal(getPinnedAccountRef('s5'), null)
  assert.equal(getPinnedAccountRef('s6'), 'REF_D')
  clearSessionPins()
  assert.equal(getPinnedAccountRef('s6'), null)
  unpinSession(undefined)
  unpinSession('')
})
