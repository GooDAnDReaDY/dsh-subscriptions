import { CodexWebSearchProvider } from './web-search-provider.js'
import { identityHeaders } from './vendors/codex.js'
import { webSearchRetryDelay } from './feature-helpers.js'
import { parseBlob } from './blob.js'

export function registerCodexWebSearch(ctx, { store, live, fetch, fetchForRef, vendorConfig }) {
  // #815: register Codex subscription search behind the host web seam.
  if (ctx.web && typeof ctx.web.registerSearchProvider === 'function') {
    const provider = new CodexWebSearchProvider({
      available: () => !!live().codexWebSearch,
      search: async (request, signal) => {
        const rows = await store.listAccounts('codex')
        const row = (rows || []).find((account) => account && account.hasToken && account.ref)
        if (!row) throw new Error('Codex web search requires a connected Codex account')
        const raw = await store.resolveRaw(row.ref)
        if (!raw) throw new Error('Codex web search requires a connected Codex account')
        const blob = await store.ensureFresh('codex', parseBlob(raw), row.ref)
        const cfg = vendorConfig('codex', live())
        const base = (cfg.baseUrl || 'https://chatgpt.com/backend-api/codex').replace(/\/$/, '')
        const fetchFn = fetchForRef(row.ref) || fetch
        let attempt = 0
        for (;;) {
          const res = await fetchFn(base + '/responses', {
            method: 'POST',
            headers: identityHeaders(blob, cfg, { 'Content-Type': 'application/json', Accept: 'application/json' }),
            body: JSON.stringify({
              model: live().codexWebSearchModel || 'gpt-5.6-luna',
              input: [{ role: 'user', content: [{ type: 'input_text', text: String(request.query || '') }] }],
              tools: [{ type: 'web_search' }],
              stream: false,
            }),
            signal,
          })
          if (res.ok) return res.json()
          const delay = webSearchRetryDelay(attempt, res.status)
          if (delay == null) throw new Error('Codex web search failed: HTTP ' + res.status)
          await new Promise((resolve) => setTimeout(resolve, delay))
          attempt += 1
        }
      },
    })
    ctx.effect(() => {
      const dispose = ctx.web.registerSearchProvider(provider)
      return () => { if (typeof dispose === 'function') dispose() }
    }, 'dsh-subscriptions: codex web search provider')
  }
}

