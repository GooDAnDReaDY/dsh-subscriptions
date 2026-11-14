// #1045: which preset a session is currently running. Kept in memory: a preset
// is a session-scoped choice, not a persisted credential.
const sessionPresets = new Map()

/** @param {string} sessionId @param {any} preset */
export function setSessionPreset(sessionId, preset) {
  const key = String(sessionId || '')
  if (!key) return false
  if (!preset) sessionPresets.delete(key)
  else sessionPresets.set(key, preset)
  return true
}

/** @param {string} sessionId */
export function getSessionPreset(sessionId) {
  const key = String(sessionId || '')
  return key ? sessionPresets.get(key) || null : null
}

/** @param {string} sessionId */
export function clearSessionPreset(sessionId) {
  return sessionPresets.delete(String(sessionId || ''))
}

export function resetSessionPresets() {
  sessionPresets.clear()
}
