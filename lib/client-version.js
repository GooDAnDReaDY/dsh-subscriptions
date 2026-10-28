/** #798: choose a client version with deterministic source precedence.
 * @param {{ configValue?: string, npmVersion?: string, localVersion?: string, fallback?: string }} [options]
 */
export function resolveClientVersion({ configValue, npmVersion, localVersion, fallback } = {}) {
  const values = [
    ['config', configValue],
    ['npm', npmVersion],
    ['local', localVersion],
    ['fallback', fallback],
  ]
  for (const [source, value] of values) {
    const text = String(value || '').trim()
    if (text) return { version: text, source }
  }
  return { version: '', source: 'none' }
}

export function parseNpmVersion(json) {
  if (!json || typeof json !== 'object') return ''
  return String(json.version || '').trim()
}

export function createVersionCache(ttlMs = 6 * 60 * 60 * 1000) {
  const cache = new Map()
  return {
    get(key, now = Date.now()) {
      const hit = cache.get(key)
      if (!hit) return null
      if (Number(now) - hit.at >= ttlMs) return null
      return hit.value
    },
    set(key, value, now = Date.now()) {
      cache.set(key, { at: Number(now), value })
    },
    clear() { cache.clear() },
  }
}
