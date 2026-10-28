import { createHash } from 'node:crypto'

export const DEFAULT_PROMPT_CACHE_TTL_MS = 5 * 60 * 1000
export const MIN_CONNECT_ATTEMPT_TIMEOUT_MS = 1500

function text(value) {
  return value == null ? '' : String(value).trim()
}

/** #810: cache usefulness score for an account (higher = warmer cache). */
export function promptCacheAffinity(account, nowMs = Date.now(), ttlMs = DEFAULT_PROMPT_CACHE_TTL_MS) {
  if (!account) return { score: 0, state: 'cache_expired' }
  const at = Number(account.lastUsedAt || account.cacheAt || 0)
  if (!at) return { score: 0, state: 'cache_expired' }
  const ttl = Number(ttlMs) > 0 ? Number(ttlMs) : 0
  if (!ttl) return { score: 0, state: 'cache_off' }
  const age = Math.max(0, Number(nowMs) - at)
  if (age >= ttl) return { score: 0, state: 'cache_expired', ageMs: age }
  return { score: 1 - age / ttl, state: 'cache_affinity', ageMs: age }
}

/** #813: a model may only route to accounts whose catalog contains it. */
export function accountCatalogHasModel(account, model) {
  if (!Array.isArray(account?.availableModels) || !account.availableModels.length) return true
  const wanted = text(model).toLowerCase()
  if (!wanted) return true
  return account.availableModels.some((entry) => {
    const id = typeof entry === 'string' ? entry : (entry && (entry.id || entry.slug || entry.name))
    return text(id).toLowerCase() === wanted
  })
}

/** #820: never lower a larger host value; raise tiny per-address attempts. */
export function effectiveConnectAttemptTimeout(hostValue, minimum = MIN_CONNECT_ATTEMPT_TIMEOUT_MS) {
  const host = Number(hostValue)
  const min = Number(minimum) > 0 ? Number(minimum) : MIN_CONNECT_ATTEMPT_TIMEOUT_MS
  if (!Number.isFinite(host) || host <= 0) return min
  return Math.max(host, min)
}

/** #824: bind opaque provider replay state to provider/account/model. */
export function replayStateKey(provider, accountRef, model) {
  return createHash('sha256')
    .update(`${text(provider).toLowerCase()}|${text(accountRef)}|${text(model)}`)
    .digest('hex')
    .slice(0, 24)
}

export function wrapReplayState(state, key, version = 1) {
  if (state == null || !key) return state
  return { kind: 'dsh-subscriptions.replay', version, key, state }
}

export function unwrapReplayState(envelope, key) {
  if (!envelope || typeof envelope !== 'object' || envelope.kind !== 'dsh-subscriptions.replay') {
    return { state: envelope, legacy: true, matched: true }
  }
  return { state: envelope.key === key ? envelope.state : undefined, legacy: false, matched: envelope.key === key }
}

/** #792: proactive guard for near-zero remaining quota. */
export function proactiveQuotaDecision(quota, nowMs = Date.now(), minRemaining = 1) {
  if (!quota) return { block: false, reason: null }
  const resetAt = Number(quota.resetAt || 0)
  if (resetAt && resetAt <= nowMs) return { block: false, reason: null }
  const remaining = quota.remaining != null ? Number(quota.remaining) : null
  const remainingPercent = quota.remainingPercent != null ? Number(quota.remainingPercent) : null
  if (remaining != null && remaining <= Number(minRemaining)) return { block: true, reason: 'remaining_low', until: resetAt || null }
  if (remainingPercent != null && remainingPercent <= 0) return { block: true, reason: 'remaining_zero', until: resetAt || null }
  return { block: false, reason: null }
}
