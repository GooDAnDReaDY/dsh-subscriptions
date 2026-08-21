const SWITCH_CODES = new Set([
  'RATE_LIMIT',
  'QUOTA',
  'QUOTA_EXCEEDED',
])

export function isSwitchableError(err) {
  if (!err || typeof err !== 'object') return false
  const code = err.code || (err.failure && err.failure.code)
  if (SWITCH_CODES.has(code)) return true
  const status = err.status || err.statusCode
  return status === 429
}

export function pickAccount(accounts, nowMs) {
  const list = Array.isArray(accounts) ? accounts : []
  const now = Number(nowMs) || 0
  for (const account of list) {
    if (!account || !account.hasToken) continue
    if (account.usagePercent != null && Number(account.usagePercent) >= 100) continue
    if (account.cooldownUntil && Number(account.cooldownUntil) > now) continue
    return account
  }
  return null
}

export function markCooldown(account, nowMs, cooldownMs) {
  const wait = Number(cooldownMs)
  const ms = Number.isFinite(wait) && wait > 0 ? wait : 30 * 60 * 1000
  return { ...account, cooldownUntil: (Number(nowMs) || 0) + ms }
}
