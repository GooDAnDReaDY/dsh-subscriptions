// #1046: time-of-day routing rules. A rule scopes one account (or a whole
// provider) to a weekly time window; outside the window that account is skipped.
// Timezone is explicit per rule so behaviour never depends on the host TZ.
const DAYS = 7

function parseHm(value, fallback) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || '').trim())
  if (!match) return fallback
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isInteger(hours) || hours < 0 || hours > 23) return fallback
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 59) return fallback
  return hours * 60 + minutes
}

/** @param {any} input */
export function normalizeScheduleRule(input = {}) {
  const from = parseHm(input.from, 9 * 60)
  const to = parseHm(input.to, 18 * 60)
  const tzOffsetMinutes = Number.isFinite(Number(input.tzOffsetMinutes)) ? Number(input.tzOffsetMinutes) : 0
  const days = Array.isArray(input.days)
    ? input.days.map((day) => Number(day)).filter((day) => Number.isInteger(day) && day >= 0 && day < DAYS)
    : []
  const account = String(input.account || '').trim()
  const provider = String(input.provider || '').trim()
  if (!account && !provider) return null
  return { provider, account, from, to, days, tzOffsetMinutes, label: String(input.label || '').trim() }
}

/**
 * Whether the window is open at `now` (epoch ms).
 * Overnight windows (from > to) span midnight.
 * @param {any} rule
 * @param {number} now
 */
export function isScheduleActive(rule, now = Date.now()) {
  if (!rule) return true
  const shifted = Number(now) + Number(rule.tzOffsetMinutes || 0) * 60000
  const date = new Date(shifted)
  const minutes = date.getUTCHours() * 60 + date.getUTCMinutes()
  const dayIndex = date.getUTCDay()
  if (Array.isArray(rule.days) && rule.days.length && !rule.days.includes(dayIndex)) return false
  const from = Number(rule.from)
  const to = Number(rule.to)
  if (!Number.isFinite(from) || !Number.isFinite(to)) return true
  if (from === to) return true
  if (from < to) return minutes >= from && minutes < to
  return minutes >= from || minutes < to
}

/**
 * Drop accounts whose scoped window is closed. Never returns an empty pool:
 * if every account is outside its window the original list is returned.
 * @param {any[]} accounts
 * @param {any[]} rules
 * @param {number} now
 */
export function filterBySchedule(accounts, rules, now = Date.now()) {
  const list = Array.isArray(accounts) ? accounts : []
  const active = (Array.isArray(rules) ? rules : []).filter(Boolean)
  if (!list.length || !active.length) return list
  const blocked = new Set()
  for (const rule of active) {
    if (isScheduleActive(rule, now)) continue
    for (const account of list) {
      if (!account) continue
      const ref = account.ref || account.id
      if (rule.account && rule.account !== ref) continue
      if (rule.provider && account.provider !== rule.provider) continue
      blocked.add(ref)
    }
  }
  if (!blocked.size) return list
  const allowed = list.filter((account) => account && !blocked.has(account.ref || account.id))
  return allowed.length ? allowed : list
}
