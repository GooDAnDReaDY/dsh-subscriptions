const SWITCH_CODES = new Set([
  "RATE_LIMIT",
  "QUOTA",
  "QUOTA_EXCEEDED",
])

export function isSwitchableError(err) {
  if (!err || typeof err !== "object") return false
  const code = err.code || (err.failure && err.failure.code)
  if (SWITCH_CODES.has(code)) return true
  const status = err.status || err.statusCode
  return status === 429
}

export function pickAccount(accounts, nowMs, opts) {
  const list = Array.isArray(accounts) ? accounts : []
  const now = Number(nowMs) || 0
  const thrRaw = opts && opts.switchAtRemaining != null ? Number(opts.switchAtRemaining) : 0
  const thr = Number.isFinite(thrRaw) ? thrRaw : 0
  function isQuotaExhausted(acc) {
    if (!thr || thr <= 0) return false
    const q = acc.quota
    if (!q) return false
    if (q.resetAt && Number(q.resetAt) <= now) return false
    if (q.remaining == null) return false
    if (q.limit != null && q.limit > 0 && thr > 0 && thr < 1) {
      const frac = q.remaining / q.limit
      return frac <= thr
    }
    return q.remaining <= thr
  }
  function isUsageExhausted(acc) {
    if (acc.usagePercent == null || Number(acc.usagePercent) < 100) return false
    const q = acc.quota
    if (q && q.resetAt && Number(q.resetAt) <= now) return false
    return true
  }
  const tiers = [[], [], []]
  const fallback = []
  for (const acc of list) {
    if (!acc || !acc.hasToken) continue
    const isCooldown = acc.cooldownUntil && Number(acc.cooldownUntil) > now
    const exhausted = isQuotaExhausted(acc) || isUsageExhausted(acc)
    if (isCooldown || exhausted) {
      tiers[2].push(acc)
      fallback.push(acc)
      continue
    }
    if (!acc.quota) tiers[1].push(acc)
    else tiers[0].push(acc)
  }
  for (const tier of tiers) if (tier.length) return tier[0]
  if (fallback.length) return fallback[0]
  return null
}

export function markCooldown(account, nowMs, cooldownMs) {
  const wait = Number(cooldownMs)
  const ms = Number.isFinite(wait) && wait > 0 ? wait : 30 * 60 * 1000
  return { ...account, cooldownUntil: (Number(nowMs) || 0) + ms }
}
