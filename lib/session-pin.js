const sessionPins = new Map()
const DEFAULT_TTL_MS = 30 * 60 * 1000 // 30 mins

/**
 * Bind a session id to an account ref for ttlMs (default 30 minutes).
 * @param {string|undefined} sessionId
 * @param {string|undefined} accountRef
 * @param {number} [ttlMs]
 * @returns {void}
 */
export function pinSession(sessionId, accountRef, ttlMs = DEFAULT_TTL_MS) {
  if (!sessionId || !accountRef) return
  sessionPins.set(sessionId, {
    accountRef,
    expiresAt: Date.now() + ttlMs
  })
}

/**
 * @param {string|undefined} sessionId
 * @returns {string|null} the bound account ref, or null when absent/expired
 */
export function getPinnedAccountRef(sessionId) {
  if (!sessionId) return null
  const entry = sessionPins.get(sessionId)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    sessionPins.delete(sessionId)
    return null
  }
  return entry.accountRef
}

export function unpinSession(sessionId) {
  if (sessionId) sessionPins.delete(sessionId)
}

export function clearSessionPins() {
  sessionPins.clear()
}
