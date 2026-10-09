// Cache-aware session affinity and pinning with lifecycle management (#170, #517, #520).
// Enforces 0 Cyrillic characters.

export const CACHE_AWARE_PROVIDERS = new Set(['claude', 'codex', 'antigravity', 'grok'])

/**
 * Check if a provider supports prompt/prefix caching where pinning benefits cache hit rates.
 * @param {string|undefined} provider
 * @returns {boolean}
 */
export function isCacheAwareProvider(provider) {
  if (!provider || typeof provider !== 'string') return false
  return CACHE_AWARE_PROVIDERS.has(provider.toLowerCase().trim())
}

const DEFAULT_TTL_MS = 30 * 60 * 1000 // 30 minutes
const MAX_PINS = 200

/**
 * @typedef {Object} SessionPinEntry
 * @property {string} accountRef
 * @property {string} [provider]
 * @property {string} [model]
 * @property {number} pinnedAt
 * @property {number} lastHitAt
 * @property {number} expiresAt
 * @property {number} hits
 * @property {boolean} cacheAware
 * @property {number} cacheHits
 * @property {number} cacheTokensSaved
 */

/** @type {Map<string, SessionPinEntry>} */
const sessionPins = new Map()

const stats = {
  totalPins: 0,
  retainedHits: 0,
  cacheAwareHits: 0,
  releasedCount: 0,
  cacheTokensSaved: 0,
  releasesByReason: {},
}

/**
 * Record a release reason in statistics.
 * @param {string} reason
 */
function recordReleaseReason(reason) {
  const r = String(reason || 'manual')
  stats.releasedCount++
  stats.releasesByReason[r] = (stats.releasesByReason[r] || 0) + 1
}

/**
 * Prune expired session pin entries.
 * @param {number} [now]
 * @returns {number} count of pruned pins
 */
export function pruneSessionPins(now = Date.now()) {
  let pruned = 0
  for (const [id, entry] of sessionPins.entries()) {
    if (now > entry.expiresAt) {
      sessionPins.delete(id)
      recordReleaseReason('pin_released_expired')
      pruned++
    }
  }
  return pruned
}

/**
 * Bind a session id to an account ref with cache awareness and metadata.
 * @param {string|undefined} sessionId
 * @param {string|undefined} accountRef
 * @param {Object} [options]
 * @param {string} [options.provider]
 * @param {string} [options.model]
 * @param {number} [options.ttlMs]
 * @param {boolean} [options.cacheAware]
 * @returns {void}
 */
export function pinSession(sessionId, accountRef, options = {}) {
  if (!sessionId || !accountRef) return
  if (sessionPins.size >= MAX_PINS) {
    pruneSessionPins()
  }

  const now = Date.now()
  const ttl = typeof options === 'number'
    ? options
    : (options && typeof options.ttlMs === 'number' ? options.ttlMs : DEFAULT_TTL_MS)
  const provider = options.provider || undefined
  const cacheAware = options.cacheAware !== undefined ? Boolean(options.cacheAware) : isCacheAwareProvider(provider)

  const existing = sessionPins.get(sessionId)
  if (existing && existing.accountRef === accountRef) {
    // Sliding TTL on re-pinning same account
    existing.lastHitAt = now
    existing.expiresAt = now + ttl
    if (options.model) existing.model = options.model
    return
  }

  sessionPins.set(sessionId, {
    accountRef,
    provider,
    model: options.model || undefined,
    pinnedAt: now,
    lastHitAt: now,
    expiresAt: now + ttl,
    hits: 0,
    cacheAware,
    cacheHits: 0,
    cacheTokensSaved: 0,
  })
  stats.totalPins++
}

/**
 * Retrieve bound account ref or null if missing/expired.
 * @param {string|undefined} sessionId
 * @param {number} [now]
 * @returns {string|null}
 */
export function getPinnedAccountRef(sessionId, now = Date.now()) {
  if (!sessionId) return null
  const entry = sessionPins.get(sessionId)
  if (!entry) return null
  if (now > entry.expiresAt) {
    sessionPins.delete(sessionId)
    recordReleaseReason('pin_released_expired')
    return null
  }
  return entry.accountRef
}

/**
 * Retrieve full session pin details.
 * @param {string|undefined} sessionId
 * @param {number} [now]
 * @returns {SessionPinEntry|null}
 */
export function getPinnedSessionDetails(sessionId, now = Date.now()) {
  if (!sessionId) return null
  const entry = sessionPins.get(sessionId)
  if (!entry) return null
  if (now > entry.expiresAt) {
    sessionPins.delete(sessionId)
    recordReleaseReason('pin_released_expired')
    return null
  }
  return { ...entry }
}

/**
 * Touch an active session pin (record hit, sliding TTL extension).
 * @param {string|undefined} sessionId
 * @param {Object} [options]
 * @param {number} [options.ttlMs]
 * @param {string} [options.model]
 * @param {string} [options.provider]
 * @returns {boolean} true if pin existed and was updated
 */
export function touchSessionPin(sessionId, options = {}) {
  if (!sessionId) return false
  const entry = sessionPins.get(sessionId)
  if (!entry) return false

  const now = Date.now()
  if (now > entry.expiresAt) {
    sessionPins.delete(sessionId)
    recordReleaseReason('pin_released_expired')
    return false
  }

  const ttl = typeof options === 'number'
    ? options
    : (options && typeof options.ttlMs === 'number' ? options.ttlMs : DEFAULT_TTL_MS)
  entry.lastHitAt = now
  entry.expiresAt = now + ttl
  entry.hits++
  if (options.provider) entry.provider = options.provider
  if (options.model) entry.model = options.model

  stats.retainedHits++
  if (entry.cacheAware) {
    stats.cacheAwareHits++
  }
  return true
}

/**
 * Explicitly release a session pin with a documented reason code.
 * @param {string|undefined} sessionId
 * @param {string} [reason] e.g. 'pinned_cooldown', 'pinned_quarantine', 'pinned_quota', 'manual'
 * @returns {boolean} true if a pin was removed
 */
export function unpinSession(sessionId, reason = 'manual') {
  if (!sessionId) return false
  const exists = sessionPins.has(sessionId)
  if (exists) {
    sessionPins.delete(sessionId)
    recordReleaseReason(reason)
    return true
  }
  return false
}

/**
 * Record actual token caching metrics for a pinned session.
 * @param {string|undefined} sessionId
 * @param {number} cacheReadTokens
 */
export function recordSessionCacheUsage(sessionId, cacheReadTokens = 0) {
  if (!sessionId || typeof cacheReadTokens !== 'number' || cacheReadTokens <= 0) return
  const entry = sessionPins.get(sessionId)
  if (!entry) return

  entry.cacheHits++
  entry.cacheTokensSaved += cacheReadTokens
  stats.cacheTokensSaved += cacheReadTokens
}

/**
 * Get cumulative statistics and current state of session pinning.
 * @returns {Object}
 */
export function getSessionPinStats() {
  let cacheAwareActive = 0
  for (const entry of sessionPins.values()) {
    if (entry.cacheAware) cacheAwareActive++
  }

  return {
    totalPins: stats.totalPins,
    activePins: sessionPins.size,
    cacheAwareActivePins: cacheAwareActive,
    retainedHits: stats.retainedHits,
    cacheAwareHits: stats.cacheAwareHits,
    releasedCount: stats.releasedCount,
    cacheTokensSaved: stats.cacheTokensSaved,
    releasesByReason: { ...stats.releasesByReason },
  }
}

/**
 * Reset all session pins and statistics (useful for tests and full resets).
 */
export function clearSessionPins() {
  sessionPins.clear()
  stats.totalPins = 0
  stats.retainedHits = 0
  stats.cacheAwareHits = 0
  stats.releasedCount = 0
  stats.cacheTokensSaved = 0
  stats.releasesByReason = {}
}
