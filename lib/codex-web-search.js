import { randomUUID } from 'node:crypto'
import { CodexWebSearchProvider } from './web-search-provider.js'
import { identityHeaders } from './vendors/codex.js'
import { webSearchRetryDelay } from './feature-helpers.js'
import { parseBlob } from './blob.js'

// #1058: never bake a concrete model id into the request. An empty setting
// means "let the upstream pick", so a retired model id cannot silently break
// web search.
export function buildCodexSearchBody({ query, model, id }) {
  const text = String(query || '')
  const configured = String(model || '').trim()
  return {
    id,
    ...(configured ? { model: configured } : {}),
    input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text }] }],
    commands: { search_query: [{ q: text }] },
    settings: { search_context_size: 'medium', allowed_callers: ['direct'], external_web_access: false },
    max_output_tokens: 10000,
  }
}

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
          // #28: `/responses` rejects a non-streaming call without `store: false`
          // (400 store/stream required). `/alpha/search` is Codex's standalone
          // search endpoint and answers with plain JSON `{ output, results }`.
          const query = String(request.query || '')
          const res = await fetchFn(base + '/alpha/search', {
            method: 'POST',
            headers: identityHeaders(blob, cfg, { 'Content-Type': 'application/json', Accept: 'application/json' }),
            body: JSON.stringify(buildCodexSearchBody({
              id: randomUUID(),
              model: live().codexWebSearchModel,
              query,
            })),
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

