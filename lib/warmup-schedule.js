/**
 * Morning warm-up schedule.
 *
 * `warmupAt` is a local-time "HH:MM" string. Empty or malformed values disable
 * the schedule; a value that already passed today targets tomorrow, so the
 * timer always lands on the next occurrence instead of firing twice.
 */

export function parseWarmupAt(value) {
  const text = String(value == null ? '' : value).trim()
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(text)
  if (!match) return null
  return { hour: Number(match[1]), minute: Number(match[2]) }
}

export function msUntilNextWarmup(value, nowMs = Date.now()) {
  const at = parseWarmupAt(value)
  if (!at) return null
  const now = new Date(Number(nowMs) || Date.now())
  const next = new Date(now.getTime())
  next.setHours(at.hour, at.minute, 0, 0)
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1)
  return next.getTime() - now.getTime()
}
