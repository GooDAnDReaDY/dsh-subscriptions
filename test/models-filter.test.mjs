import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SubscriptionAdapter } from '../lib/adapter.js'

function makeAdapter(hide) {
  return new SubscriptionAdapter({
    listAccounts: async () => [{ hasToken: true, ref: 'CLAUDE_OAUTH_1' }],
    loadBlob: async () => ({}),
    ensureFresh: async (p, b) => b,
    vendorConfig: () => ({ models: [
      { id: 'claude-ok' },
      { id: 'claude-test' },
      { id: 'claude-preview-9' },
      { id: 'claude-beta' },
      { id: 'claude-sonnet:legacy' },
    ] }),
    hideDeprecatedModels: () => hide,
  })
}

test('#94: hideDeprecatedModels filters test/preview/beta/legacy ids', async () => {
  const models = await makeAdapter(true).listModels('claude')
  assert.deepEqual(models.map((m) => m.id), ['claude-ok'])
})

test('#94: filter off keeps the full catalog', async () => {
  const models = await makeAdapter(false).listModels('claude')
  assert.equal(models.length, 5)
})
