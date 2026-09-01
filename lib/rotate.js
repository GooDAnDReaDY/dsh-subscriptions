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

// #87: family classification. Cooldowns are scoped to the model family that
// hit the limit, so a reasoning 429 does not block standard models.
export function modelFamily(provider, model) {
  const id = String(model || '')
  if (provider === 'claude') return /thinking/i.test(id) ? 'reasoning' : 'standard'
  if (provider === 'grok') return /reasoning/i.test(id) ? 'reasoning' : 'standard'
  if (provider === 'codex') return 'reasoning'
  return 'standard'
}

// Legacy cooldowns (no family list) block everything; scoped ones block only
// their own family. An unknown family never blocks a differently-scoped cooldown.
export function cooldownBlocks(acc, family) {
  const fams = acc && acc.cooldownFamilies
  if (!Array.isArray(fams) || !fams.length) return true
  if (!family) return true
  return fams.includes(family)
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
    // Если до сброса меньше минуты — переключаемся, не тратя остаток,
    // независимо от порога (аккаунт всё равно скоро обнулится).
    if (q.resetAt && Number(q.resetAt) - now < 60000) return true
    // Если остаток меньше порога — считаем исчерпанным, чтобы не тратить
    // последние проценты перед отказом.
    let below = false
    if (q.limit != null && q.limit > 0 && thr > 0 && thr < 1) {
      const frac = q.remaining / q.limit
      below = frac <= thr
    } else {
      below = q.remaining <= thr
    }
    return below
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
    const isCooldown = acc.cooldownUntil && Number(acc.cooldownUntil) > now && cooldownBlocks(acc, opts && opts.family)
    const exhausted = isQuotaExhausted(acc) || isUsageExhausted(acc)
    if (isCooldown || exhausted) {
      tiers[2].push(acc)
      fallback.push(acc)
      continue
    }
    if (!acc.quota) tiers[1].push(acc)
    else tiers[0].push(acc)
  }
  // Внутри здоровых тиров предпочитаем аккаунт с более высоким health-счётом
  for (const tier of tiers) {
    if (tier.length) {
      tier.sort((a, b) => (b.healthScore || 100) - (a.healthScore || 100))
      return tier[0]
    }
  }
  if (fallback.length) return fallback[0]
  return null
}

export function markCooldown(account, nowMs, cooldownMs, family) {
  const wait = Number(cooldownMs)
  const ms = Number.isFinite(wait) && wait > 0 ? wait : 30 * 60 * 1000
  const prev = Array.isArray(account.cooldownFamilies) ? account.cooldownFamilies.slice() : []
  const fams = family ? (prev.includes(family) ? prev : prev.concat(family)) : prev
  return {
    ...account,
    cooldownUntil: (Number(nowMs) || 0) + ms,
    ...(fams.length ? { cooldownFamilies: fams } : {}),
  }
}
