// #709: read-only bridge to @goodandready/dsh-key-rotation.
// This module never writes cooldown, never rotates a key and never exposes a
// key value. It only summarises the sanitized status route so the source chain
// can show which pool would be used next.
export const KEY_ROTATION_STATUS_PATH = '/dsh-key-rotation/status'

export function summarizeKeyRotationStatus(raw) {
  if (!raw || !Array.isArray(raw.providers)) return { available: false, reason: 'invalid status', providers: [], totalKeys: 0, healthyKeys: 0 }
  let totalKeys = 0
  let healthyKeys = 0
  const providers = raw.providers.map((p) => {
    const keys = (Array.isArray(p && p.keys) ? p.keys : [])
      .filter((k) => k && k.present)
      .map((k) => {
        const cooldownMsLeft = Math.max(0, Number(k.cooldownMsLeft) || 0)
        const paused = Boolean(k.paused)
        const revoked = Boolean(k.revoked)
        const broken = Boolean(k.broken)
        const healthy = !paused && !revoked && !broken && cooldownMsLeft === 0
        return {
          ref: String(k.ref || ''),
          active: Boolean(k.active),
          cooldownMsLeft,
          paused,
          revoked,
          broken,
          healthy,
          expiresAt: k.expiresAt == null ? null : Number(k.expiresAt),
        }
      })
    totalKeys += keys.length
    healthyKeys += keys.filter((k) => k.healthy).length
    return {
      provider: String((p && (p.providerName || p.provider)) || ''),
      base: String((p && p.provider) || ''),
      healthyKeys: keys.filter((k) => k.healthy).length,
      totalKeys: keys.length,
      keys,
    }
  }).filter((p) => p.provider)
  return { available: true, providers, totalKeys, healthyKeys }
}

// #726: a short TTL keeps the widget, settings panel and doctor from
// multiplying key-rotation status reads. Errors are cached for the same TTL.
let statusCache = { key: '', at: 0, value: null }
let inFlight = null

export function clearKeyRotationCache() {
  statusCache = { key: '', at: 0, value: null }
  inFlight = null
}

export async function readKeyRotationStatus({ baseUrl, path = KEY_ROTATION_STATUS_PATH, fetchImpl = fetch, timeoutMs = 2000, cacheTtlMs = 10000, bypassCache = false } = {}) {
  if (!baseUrl) return { available: false, reason: 'missing base url', providers: [], totalKeys: 0, healthyKeys: 0 }
  const url = String(baseUrl).replace(/\/$/, '') + path
  if (!bypassCache && statusCache.key === url && (Date.now() - statusCache.at) < Number(cacheTtlMs)) {
    return statusCache.value
  }
  if (!bypassCache && inFlight && inFlight.key === url) return inFlight.promise
  const promise = (async () => {
  try {
    const init = { method: 'GET', headers: { accept: 'application/json' } }
    if (timeoutMs > 0 && typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
      init.signal = AbortSignal.timeout(timeoutMs)
    }
    const res = await fetchImpl(url, init)
    if (!res || !res.ok) {
      const value = { available: false, reason: 'HTTP ' + (res && res.status), providers: [], totalKeys: 0, healthyKeys: 0 }
      statusCache = { key: url, at: Date.now(), value }
      return value
    }
    const raw = await res.json()
    const value = summarizeKeyRotationStatus(raw)
    statusCache = { key: url, at: Date.now(), value }
    return value
  } catch (err) {
    const value = { available: false, reason: String(err && err.message || err), providers: [], totalKeys: 0, healthyKeys: 0 }
    statusCache = { key: url, at: Date.now(), value }
    return value
  }
  })()
  inFlight = { key: url, promise }
  try {
    return await promise
  } finally {
    if (inFlight && inFlight.promise === promise) inFlight = null
  }
}

export function subscriptionCandidate(row) {
  const value = row && typeof row === 'object' ? row : {}
  return {
    provider: value.provider,
    index: value.index,
    label: value.label || null,
    loggedIn: Boolean(value.configured ?? value.hasToken),
    usagePercent: value.usagePercent == null ? null : Number(value.usagePercent),
    cooldownUntil: value.cooldownUntil == null ? null : Number(value.cooldownUntil),
  }
}

const SOURCE_ORDER = ['oauth', 'api-key', 'ollama']

export function buildSourceChain({ subscriptions = [], keyRotation = null, ollama = { available: false } } = {}) {
  const providers = new Map()
  const entry = (provider) => {
    const key = String(provider || '')
    if (!providers.has(key)) providers.set(key, { provider: key, candidates: [] })
    return providers.get(key)
  }
  for (const sub of (Array.isArray(subscriptions) ? subscriptions : [])) {
    if (!sub || !sub.provider) continue
    entry(sub.provider).candidates.push({
      source: 'oauth',
      available: Boolean(sub.loggedIn) && !(Number(sub.cooldownUntil) > Date.now()),
      detail: {
        index: sub.index == null ? null : Number(sub.index),
        label: sub.label || null,
        usagePercent: sub.usagePercent == null ? null : Number(sub.usagePercent),
        cooldownUntil: sub.cooldownUntil == null ? null : Number(sub.cooldownUntil),
      },
    })
  }
  if (keyRotation && keyRotation.available) {
    for (const pool of (keyRotation.providers || [])) {
      if (!pool || !pool.provider) continue
      entry(pool.provider).candidates.push({
        source: 'api-key',
        available: Number(pool.healthyKeys) > 0,
        detail: { healthyKeys: Number(pool.healthyKeys) || 0, totalKeys: Number(pool.totalKeys) || 0, keys: pool.keys || [] },
      })
    }
  }
  if (ollama && ollama.available) {
    const target = entry('ollama')
    target.candidates.push({ source: 'ollama', available: true, detail: { model: ollama.model || null } })
  }
  const rows = [...providers.values()].map((row) => {
    row.candidates.sort((a, b) => SOURCE_ORDER.indexOf(a.source) - SOURCE_ORDER.indexOf(b.source))
    const selected = row.candidates.find((c) => c.available) || null
    return { ...row, selected: selected ? selected.source : null }
  })
  return { order: SOURCE_ORDER.slice(), noDoubleRotation: true, providers: rows }
}
