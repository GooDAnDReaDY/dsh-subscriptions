const MAX_BYTES = 64 * 1024

function outputText(payload) {
  if (typeof payload?.output_text === 'string') return payload.output_text
  if (!Array.isArray(payload?.output)) return ''
  return payload.output
    .flatMap((item) => Array.isArray(item?.content) ? item.content : [])
    .filter((block) => block && (block.type === 'output_text' || block.type === 'text'))
    .map((block) => String(block.text || ''))
    .join('')
}

function citationSources(payload) {
  const sources = []
  const seen = new Set()
  const visit = (value) => {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) { value.forEach(visit); return }
    for (const key of Object.keys(value)) {
      if (key !== 'content' && key !== 'annotations' && key !== 'citations') continue
      const nested = value[key]
      if (!Array.isArray(nested)) continue
      for (const item of nested) {
        if (item && typeof item === 'object') visit(item)
      }
    }
    const annotations = Array.isArray(value.annotations) ? value.annotations : []
    for (const annotation of annotations) {
      const url = String(annotation?.url || annotation?.link || '')
      if (!url || seen.has(url)) continue
      seen.add(url)
      sources.push({ url, ...(annotation.title ? { title: String(annotation.title) } : {}) })
    }
  }
  visit(payload?.output)
  visit(payload?.citations)
  return sources
}

// Codex inline citation markers: U+E200 ... U+E201 around an opaque reference.
const CITATION_MARKER = /\uE200[^\uE201]*\uE201/g

/** #28: map the standalone `/alpha/search` payload ({ output, results }). */
function normalizeAlphaSearch(payload, maxBytes) {
  const sources = []
  const seen = new Set()
  for (const item of Array.isArray(payload.results) ? payload.results : []) {
    const url = typeof item?.url === 'string' ? item.url : ''
    if (item?.type !== 'text_result' || !/^https?:\/\//.test(url) || seen.has(url)) continue
    seen.add(url)
    sources.push({
      url,
      ...(item.title ? { title: String(item.title) } : {}),
      ...(item.snippet ? { snippet: String(item.snippet) } : {}),
    })
  }
  return {
    content: payload.output.replace(CITATION_MARKER, '').slice(0, maxBytes),
    sources: sources.slice(0, 50),
    truncated: false,
  }
}

/** #815: map a Codex responses payload into the host WebSearchResult contract. */
export function normalizeCodexSearch(payload, maxBytes = MAX_BYTES) {
  // #28: /alpha/search answers with a plain string output plus a results table.
  if (typeof payload?.output === 'string') return normalizeAlphaSearch(payload, maxBytes)
  return {
    content: String(outputText(payload) || '').slice(0, maxBytes),
    sources: citationSources(payload).slice(0, 50),
    truncated: false,
  }
}

export class CodexWebSearchProvider {
  constructor({ available, search }) {
    this.id = 'subscriptions-codex'
    this._available = available
    this._search = search
  }

  available() {
    try { return !!this._available() } catch { return false }
  }

  async search(request, signal) {
    if (!this.available()) throw new Error('Codex web search is not available')
    return normalizeCodexSearch(await this._search(request, signal))
  }
}
