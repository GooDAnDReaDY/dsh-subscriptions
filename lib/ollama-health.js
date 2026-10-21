// #755: health must probe the actual Ollama endpoint, not the fallback flag.
let cache = { base: '', at: 0, value: false }

export function clearOllamaHealthCache() {
  cache = { base: '', at: 0, value: false }
}

export async function probeOllama(baseUrl, { fetchImpl = fetch, timeoutMs = 800, ttlMs = 10000, now = Date.now } = {}) {
  if (!baseUrl) return false
  const base = String(baseUrl).replace(/\/$/, '')
  if (cache.base === base && (now() - cache.at) < ttlMs) return cache.value
  let value = false
  try {
    const init = { method: 'GET' }
    if (timeoutMs > 0 && typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
      init.signal = AbortSignal.timeout(timeoutMs)
    }
    const res = await fetchImpl(base + '/api/tags', init)
    value = Boolean(res && res.ok)
  } catch {
    value = false
  }
  cache = { base, at: now(), value }
  return value
}
