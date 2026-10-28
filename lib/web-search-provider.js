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

/** #815: map a Codex responses payload into the host WebSearchResult contract. */
export function normalizeCodexSearch(payload, maxBytes = MAX_BYTES) {
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
