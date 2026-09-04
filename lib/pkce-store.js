const pkceStates = new Map()
const STATE_TTL_MS = 10 * 60 * 1000 // 10 minutes

export function storePkceState(state, verifier) {
  if (!state || !verifier) return
  pkceStates.set(state, {
    verifier,
    createdAt: Date.now()
  })
}

export function consumePkceState(state) {
  if (!state) return null
  const entry = pkceStates.get(state)
  if (!entry) return null

  // Single-use consumption (prevent INVALID_REPLAY_STATE)
  pkceStates.delete(state)

  if (Date.now() - entry.createdAt > STATE_TTL_MS) {
    return null // expired
  }
  return entry.verifier
}

export function clearPkceStates() {
  pkceStates.clear()
}
