// #720: digest scheduling is a pure decision so it can be tested without timers.
export function isDigestDue({ lastDigestAt = 0, nowMs = Date.now(), intervalHours = 0, alertCount = 0 } = {}) {
  if (!(Number(intervalHours) > 0)) return false
  if (!(Number(alertCount) > 0)) return false
  if (!lastDigestAt) return true
  return Number(nowMs) - Number(lastDigestAt) >= Number(intervalHours) * 60 * 60 * 1000
}
