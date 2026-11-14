import { parseProxyUrl } from './proxy.js'

// #1050: fallback proxy pool. A slot proxy always wins; when a slot has none,
// the pool supplies the next healthy proxy. Dead entries get a cooldown instead
// of being retried on every request.
export const DEFAULT_POOL_COOLDOWN_MS = 60_000

/** @returns {Map<string, { failures: number, blockedUntil: number }>} */
export function createPoolState() {
  return new Map()
}

/** @param {any[]} entries */
export function normalizePool(entries) {
  const list = Array.isArray(entries) ? entries : []
  const out = []
  const seen = new Set()
  for (const entry of list) {
    const raw = String(entry || '').trim()
    if (!raw || seen.has(raw)) continue
    if (!parseProxyUrl(raw)) continue
    seen.add(raw)
    out.push(raw)
  }
  return out
}

/**
 * Next proxy to use, skipping entries in cooldown. Returns null for an empty
 * (or fully blocked) pool so the caller can fall back to a direct connection.
 * @param {any[]} entries
 * @param {Map<string, any>} state
 * @param {number} now
 */
export function pickPoolProxy(entries, state = createPoolState(), now = Date.now()) {
  const pool = normalizePool(entries)
  if (!pool.length) return null
  for (const entry of pool) {
    const row = state.get(entry)
    if (row && Number(row.blockedUntil) > now) continue
    return entry
  }
  return null
}

/**
 * @param {Map<string, any>} state
 * @param {string} entry
 * @param {boolean} ok
 * @param {number} now
 * @param {number} cooldownMs
 */
export function recordPoolResult(state, entry, ok, now = Date.now(), cooldownMs = DEFAULT_POOL_COOLDOWN_MS) {
  const key = String(entry || '').trim()
  if (!state || !key) return null
  if (ok) {
    state.set(key, { failures: 0, blockedUntil: 0 })
    return state.get(key)
  }
  const prev = state.get(key) || { failures: 0, blockedUntil: 0 }
  const failures = Number(prev.failures || 0) + 1
  const backoff = Math.min(cooldownMs * failures, cooldownMs * 8)
  const row = { failures, blockedUntil: Number(now) + backoff }
  state.set(key, row)
  return row
}

/** @param {any[]} entries @param {Map<string, any>} state @param {number} now */
export function snapshotPool(entries, state = createPoolState(), now = Date.now()) {
  return normalizePool(entries).map((entry) => {
    const row = state.get(entry) || { failures: 0, blockedUntil: 0 }
    return {
      entry,
      failures: Number(row.failures) || 0,
      blockedUntil: Number(row.blockedUntil) || 0,
      healthy: !(Number(row.blockedUntil) > now),
    }
  })
}

const sharedState = createPoolState()

/** Shared state used by the host wiring. */
export function sharedPoolState() {
  return sharedState
}
