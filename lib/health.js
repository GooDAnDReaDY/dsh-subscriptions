// Per-account health score for smart rotation.
// Numbers mirror dsh-key-rotation pool.js: switch 5, exhaustion 10, bad key 15.
const PENALTY = { switch: 5, exhaust: 10, broken: 15 }

export function emptyHealth() {
  return { switches: 0, exhaustions: 0, broken: 0 }
}

export function recordSwitch(h) {
  const cur = h || emptyHealth()
  return { ...cur, switches: (cur.switches || 0) + 1 }
}

export function recordExhaust(h) {
  const cur = h || emptyHealth()
  return { ...cur, exhaustions: (cur.exhaustions || 0) + 1 }
}

export function recordBroken(h) {
  const cur = h || emptyHealth()
  return { ...cur, broken: (cur.broken || 0) + 1 }
}

/** True when nothing has ever been observed for this account. */
export function isUnprobed(h) {
  if (!h || typeof h !== 'object') return true
  return !(Number(h.switches) || 0) && !(Number(h.exhaustions) || 0) && !(Number(h.broken) || 0)
}

/**
 * Score for an account with a measured history.
 *
 * #1098: `null` used to return 100, so "we have never tried this account" rendered
 * identically to "this account works perfectly". Callers cannot tell the two apart
 * from a number, so the honest answer for no measurement is `null` — the UI then
 * shows "not probed" instead of a green badge nobody earned.
 *
 * @param {object|null|undefined} h
 * @returns {number|null}
 */
export function computeHealthScore(h) {
  if (isUnprobed(h)) return null
  const H = /** @type {{switches?: number, exhaustions?: number, broken?: number}} */ (h || emptyHealth())
  const score = 100
    - (H.switches || 0) * PENALTY.switch
    - (H.exhaustions || 0) * PENALTY.exhaust
    - (H.broken || 0) * PENALTY.broken
  return Math.max(0, Math.min(100, score))
}

export function healthBadge(score) {
  // A score of null means "not measured yet", not "unknown quantity": the UI needs
  // a distinct state to avoid showing a healthy badge for an unprobed account.
  if (score == null) return 'unprobed'
  if (score >= 80) return 'healthy'
  if (score >= 50) return 'tired'
  return 'broken'
}
