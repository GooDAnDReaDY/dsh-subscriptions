import { isQuarantined } from './quarantine.js'
import { getPinnedAccountRef, pinSession } from './session-pin.js'

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
  return status === 429 || status === 500 || status === 502 || status === 503
}

export function modelFamily(provider, model) {
  const id = String(model || '')
  if (provider === 'claude') return /thinking/i.test(id) ? 'reasoning' : 'standard'
  if (provider === 'grok') return /reasoning/i.test(id) ? 'reasoning' : 'standard'
  if (provider === 'codex') return 'reasoning'
  return 'standard'
}

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
  const isVipRequest = Boolean(opts && opts.vip)
  const targetTag = opts && opts.tag
  const targetSession = opts && opts.sessionId

  function isQuotaExhausted(acc) {
    if (!thr || thr <= 0) return false
    const q = acc.quota
    if (!q) return false
    if (q.resetAt && Number(q.resetAt) <= now) return false
    if (q.remaining == null) return false
    if (q.resetAt && Number(q.resetAt) - now < 60000) return true
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

  // Sticky Session Pinning (#170)
  if (targetSession) {
    const pinnedRef = getPinnedAccountRef(targetSession)
    if (pinnedRef) {
      const pinned = list.find((a) => (a.ref || a.id) === pinnedRef)
      if (pinned && pinned.hasToken && !isQuarantined(pinned, now)) {
        const isCooldown = pinned.cooldownUntil && Number(pinned.cooldownUntil) > now && cooldownBlocks(pinned, opts && opts.family)
        if (!isCooldown && !isQuotaExhausted(pinned) && !isUsageExhausted(pinned)) {
          return pinned
        }
      }
    }
  }

  // 3-Tier priority:
  // Tier 0: Has known quota & healthy
  // Tier 1: Quota unknown (null) & healthy
  // Tier 2: Cooldown, quarantine or exhausted
  const tiers = [[], [], []]
  const fallback = []

  for (const acc of list) {
    if (!acc || !acc.hasToken) continue

    // VIP Slot Reservation (#175)
    if (acc.vipOnly && !isVipRequest) continue

    // Tag-based filtering (#173)
    if (targetTag && Array.isArray(acc.tags) && !acc.tags.includes(targetTag)) continue

    const isCooldown = acc.cooldownUntil && Number(acc.cooldownUntil) > now && cooldownBlocks(acc, opts && opts.family)
    const inQuarantine = isQuarantined(acc, now)
    const exhausted = isQuotaExhausted(acc) || isUsageExhausted(acc)

    if (isCooldown || inQuarantine || exhausted) {
      tiers[2].push(acc)
      fallback.push(acc)
      continue
    }

    if (!acc.quota) tiers[1].push(acc)
    else tiers[0].push(acc)
  }

  for (const tier of tiers) {
    if (tier.length) {
      tier.sort((a, b) => {
        // 1. Least Remaining Window (#167)
        if (a.quota && b.quota && a.quota.resetAt && b.quota.resetAt) {
          const aReset = Number(a.quota.resetAt)
          const bReset = Number(b.quota.resetAt)
          if (Math.abs(aReset - bReset) > 300000) {
            return aReset - bReset
          }
        }

        // 2. Weighted Round Robin: Pro/Team weight (#171)
        const aWeight = a.weight || (a.isPro ? 5 : 1)
        const bWeight = b.weight || (b.isPro ? 5 : 1)
        if (aWeight !== bWeight) return bWeight - aWeight

        // 3. Health Score
        return (b.healthScore || 100) - (a.healthScore || 100)
      })

      const chosen = tier[0]
      if (targetSession && chosen) {
        pinSession(targetSession, chosen.ref || chosen.id)
      }
      return chosen
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
