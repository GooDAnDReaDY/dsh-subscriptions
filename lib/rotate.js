import { computePacingRisk, calculateBurnRatePerHour, calculateBurnUrgency } from "./forecast.js"
import { isQuarantined } from './quarantine.js'
import { getPinnedAccountRef, pinSession, touchSessionPin, unpinSession, isCacheAwareProvider } from './session-pin.js'
import { accountCatalogHasModel, proactiveQuotaDecision, promptCacheAffinity } from './routing-reliability.js'
import { matchModelAccountRule } from './routing-rules.js'

const roundRobinCursor = new Map()

export function resetRoundRobinState() {
  roundRobinCursor.clear()
}

const SWITCH_CODES = new Set([
  'RATE_LIMIT',
  'QUOTA',
  'QUOTA_EXCEEDED',
  'LICENSE_REQUIRED',
  'SOFT_FAILURE',
])

export function isRegionError(err) {
  if (!err || typeof err !== 'object') return false
  const status = Number(err.status || err.statusCode) || 0
  const msg = String(err.message || '')
  return status === 400 && (/FAILED_PRECONDITION/i.test(msg) || /User location is not supported/i.test(msg))
}

export function isAuthError(err) {
  if (!err || typeof err !== "object") return false
  const status = Number(err.status || err.statusCode) || 0
  if (status === 401) return true
  const code = String(err.code || (err.failure && err.failure.code) || "").toUpperCase()
  if (code === "AUTH" || code === "TOKEN_REVOKED" || code === "UNAUTHORIZED" || code === "INVALID_TOKEN" || code === "SESSION_EXPIRED") return true
  const msg = String(err.message || "")
  if (/invalid_grant/i.test(msg)) return true
  if (/token (?:has been )?revoked/i.test(msg)) return true
  if (/session (?:expired|revoked|invalid)/i.test(msg)) return true
  if (/unauthorized/i.test(msg) && (status === 0 || status === 400 || status === 401)) return true
  return false
}

export function isSwitchableError(err) {
  if (!err || typeof err !== "object") return false
  if (err.name === "TimeoutError" || err.code === "TIMEOUT" || err.code === "EMPTY_RESPONSE" || err.code === "SOFT_FAILURE" || err.isSoftFailure) return true
  if (err.name === "AbortError" || err.code === "ABORT_ERR" || err.code === "ERR_ABORTED" || (err.message && /aborted/i.test(err.message))) return false
  const code = err.code || (err.failure && err.failure.code)
  if (SWITCH_CODES.has(code)) return true
  if (isRegionError(err)) return true
  const status = Number(err.status || err.statusCode) || 0
  return status === 401 || status === 403 || status === 429 || status === 500 || status === 502 || status === 503
}

export function modelFamily(provider, model) {
  const id = String(model || '')
  if (provider === 'claude') return /thinking/i.test(id) ? 'reasoning' : 'standard'
  if (provider === 'grok') return /reasoning/i.test(id) ? 'reasoning' : 'standard'
  if (provider === 'codex') return 'reasoning'
  return 'standard'
}

export function cooldownBlocks(acc, family, model, nowMs = Date.now()) {
  const modelUntil = acc && model && acc.cooldownModels && acc.cooldownModels[model]
  if (modelUntil && Number(modelUntil) > Number(nowMs)) return true
  if (model && acc && acc.cooldownModels && !acc.cooldownUntil) return false
  const fams = acc && acc.cooldownFamilies
  if (!Array.isArray(fams) || !fams.length) return true
  if (!family) return true
  return fams.includes(family)
}


export function getAccountRemainingPercent(acc) {
  if (!acc) return null
  if (acc.quota?.remainingPercent != null) {
    const val = Number(acc.quota.remainingPercent)
    return Number.isFinite(val) ? val : null
  }
  if (acc.quota?.usedPercent != null) {
    const val = 100 - Number(acc.quota.usedPercent)
    return Number.isFinite(val) ? val : null
  }
  if (acc.usagePercent != null) {
    const val = 100 - Number(acc.usagePercent)
    return Number.isFinite(val) ? val : null
  }
  if (acc.quota?.remaining != null && acc.quota?.limit != null && Number(acc.quota.limit) > 0) {
    const val = (Number(acc.quota.remaining) / Number(acc.quota.limit)) * 100
    return Number.isFinite(val) ? val : null
  }
  return null
}

export function earliestRecovery(accounts, nowMs = Date.now()) {
  const now = Number(nowMs) || 0
  let best = null
  for (const account of Array.isArray(accounts) ? accounts : []) {
    if (!account) continue
    const candidates = []
    if (account.cooldownUntil) candidates.push({ at: Number(account.cooldownUntil), reason: 'cooldown' })
    if (account.quarantineUntil) candidates.push({ at: Number(account.quarantineUntil), reason: account.quarantineReason || 'quarantine' })
    if (account.quota && account.quota.resetAt) candidates.push({ at: Number(account.quota.resetAt), reason: 'quota_reset' })
    for (const [model, until] of Object.entries(account.cooldownModels || {})) {
      if (Number(until) > now) candidates.push({ at: Number(until), reason: 'model_cooldown', model })
    }
    for (const item of candidates) {
      if (!Number.isFinite(item.at) || item.at <= now) continue
      if (!best || item.at < best.at) best = { ref: account.ref || account.id || 'unknown', ...item }
    }
  }
  return best
}

export function poolBlockReason(account, opts) {
  if (!account) return null
  if (account.poolEnabled === false) return 'pool_disabled'
  if (Array.isArray(account.poolModels)) {
    const model = String(opts && opts.model || '').trim().toLowerCase()
    if (model) {
      const allowed = account.poolModels.some((id) => String(id).trim().toLowerCase() === model)
      if (!allowed) return 'model_not_allowed'
    }
  }
  return null
}

export function pickAccountWithTrace(accounts, nowMs, opts) {
  const allAccounts = Array.isArray(accounts) ? accounts : []
  const onlyRef = opts && opts.onlyRef
  const list = onlyRef
    ? allAccounts.filter((account) => account && (account.ref || account.id) === onlyRef)
    : allAccounts
  const now = Number(nowMs) || 0
  const thrRaw = opts && opts.switchAtRemaining != null ? Number(opts.switchAtRemaining) : 0
  const thr = Number.isFinite(thrRaw) ? thrRaw : 0
  const isVipRequest = Boolean(opts && opts.vip)
  const targetTag = opts && opts.tag
  const targetSession = opts && opts.sessionId
  const ruleRef = matchModelAccountRule(opts && opts.modelAccountRules, opts && opts.provider, opts && opts.model, list)

  const evaluations = []

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

  // Sticky & Cache-Aware Session Pinning (#170, #517, #520)
  if (targetSession && !ruleRef) {
    const pinnedRef = getPinnedAccountRef(targetSession, now)
    if (pinnedRef) {
      const pinned = list.find((a) => (a.ref || a.id) === pinnedRef)
      const pinnedBlock = pinned
        ? (poolBlockReason(pinned, opts) || (!accountCatalogHasModel(pinned, opts && opts.model) ? 'model_not_in_account_catalog' : null))
        : null
      if (pinned && pinnedBlock) {
        unpinSession(targetSession, pinnedBlock)
        evaluations.push({
          ref: pinnedRef,
          eligible: false,
          reason: pinnedBlock,
          pinned: true,
        })
      } else if (pinned && pinned.hasToken && !isQuarantined(pinned, now)) {
        const pinnedModelCooling = opts && opts.model && pinned.cooldownModels && Number(pinned.cooldownModels[opts.model] || 0) > now
        const isCooldown = pinnedModelCooling || (pinned.cooldownUntil && Number(pinned.cooldownUntil) > now && cooldownBlocks(pinned, opts && opts.family, opts && opts.model, now))
        const isPinnedZero = Boolean(pinned.quota && (
          (pinned.quota.remaining != null && Number(pinned.quota.remaining) <= 0) ||
          (pinned.quota.remainingPercent != null && Number(pinned.quota.remainingPercent) <= 0)
        ) && (!pinned.quota.resetAt || Number(pinned.quota.resetAt) > now))
        if (!isCooldown && !isPinnedZero && !isQuotaExhausted(pinned) && !isUsageExhausted(pinned)) {
          const cacheAware = isCacheAwareProvider(pinned.provider)
          const decisionReason = cacheAware ? 'cache_pinned' : 'session_pinned'
          touchSessionPin(targetSession, { provider: pinned.provider, model: opts && opts.model })
          evaluations.push({
            ref: pinnedRef,
            eligible: true,
            tier: 0,
            reason: decisionReason,
            pinned: true,
            cacheAware,
          })
          return {
            account: pinned,
            trace: {
              chosenRef: pinnedRef,
              decisionReason,
              tier: 0,
              evaluations,
              selectionMetrics: {
                pinned: true,
                cacheAware,
                remainingPercent: getAccountRemainingPercent(pinned),
                healthScore: pinned.healthScore ?? 100,
              },
            },
          }
        } else {
          const releaseReason = isCooldown ? 'pinned_cooldown' : isPinnedZero ? 'pinned_zero_quota' : 'pinned_exhausted'
          unpinSession(targetSession, releaseReason)
          evaluations.push({
            ref: pinnedRef,
            eligible: false,
            reason: releaseReason,
            pinned: true,
          })
        }
      } else if (pinned) {
        const releaseReason = !pinned.hasToken ? 'pinned_no_token' : 'pinned_quarantine'
        unpinSession(targetSession, releaseReason)
        evaluations.push({
          ref: pinnedRef,
          eligible: false,
          reason: releaseReason,
          pinned: true,
        })
      } else {
        unpinSession(targetSession, 'pinned_not_found')
      }
    }
  }

  // 3-Tier priority:
  // Tier 0: Has known quota & healthy
  // Tier 1: Quota unknown (null) & healthy
  // Tier 2: Cooldown, quarantine or exhausted
  const tiers = [[], [], []]

  for (const acc of list) {
    if (!acc) continue
    const ref = acc.ref || acc.id || 'unknown'
    if (!acc.hasToken) {
      evaluations.push({ ref, eligible: false, tier: null, reason: 'no_token' })
      continue
    }

    // #795: pool participation and per-account model allowlists are checked
    // before weighting, quota tiers and session pinning.
    const blockedByPool = poolBlockReason(acc, opts)
    if (blockedByPool) {
      evaluations.push({ ref, eligible: false, tier: null, reason: blockedByPool })
      continue
    }
    if (!accountCatalogHasModel(acc, opts && opts.model)) {
      evaluations.push({ ref, eligible: false, tier: null, reason: 'model_not_in_account_catalog', model: opts && opts.model })
      continue
    }
    if (opts && opts.proactiveGuard === true) {
      const proactive = proactiveQuotaDecision(acc.quota, now, opts.proactiveMinRemaining)
      if (proactive.block) {
        evaluations.push({ ref, eligible: false, tier: null, reason: proactive.reason, until: proactive.until })
        continue
      }
    }

    if (!opts || opts.autoPacing !== false) {
      if (acc.pacingRisk === undefined) {
        const rem = acc.quota?.remainingPercent ?? (acc.quota?.usedPercent != null ? (100 - Number(acc.quota.usedPercent)) : (acc.usagePercent != null ? (100 - Number(acc.usagePercent)) : null))
        const pace = acc.pacePerHour || (Array.isArray(acc.samples) ? calculateBurnRatePerHour(acc.samples, now) : 0)
        const resetAt = acc.quota?.resetAt || 0
        const riskInfo = computePacingRisk(rem, pace, resetAt, now)
        acc.pacingRisk = riskInfo.pacingRisk
      }
    }

    if (opts && opts.drainBeforeReset) {
      if (acc.burnUrgency === undefined) {
        const rem = getAccountRemainingPercent(acc)
        const resetAt = acc.quota?.resetAt || 0
        const safetyFloor = opts.drainSafetyPercent != null ? Number(opts.drainSafetyPercent) : 5
        acc.burnUrgency = calculateBurnUrgency(rem, resetAt, now, safetyFloor)
      }
    }

    // VIP Slot Reservation (#175)
    if (acc.vipOnly && !isVipRequest) {
      evaluations.push({ ref, eligible: false, tier: null, reason: 'vip_reserved' })
      continue
    }

    // Tag-based filtering (#173)
    if (targetTag && Array.isArray(acc.tags) && !acc.tags.includes(targetTag)) {
      evaluations.push({ ref, eligible: false, tier: null, reason: 'tag_mismatch' })
      continue
    }

    const modelCooling = opts && opts.model && acc.cooldownModels && Number(acc.cooldownModels[opts.model] || 0) > now
    const isCooldown = modelCooling || (acc.cooldownUntil && Number(acc.cooldownUntil) > now && cooldownBlocks(acc, opts && opts.family, opts && opts.model, now))
    if (isCooldown) {
      evaluations.push({
        ref,
        eligible: false,
        tier: null,
        reason: modelCooling ? 'model_cooldown' : 'cooldown',
        until: modelCooling ? acc.cooldownModels[opts.model] : acc.cooldownUntil,
        ...(modelCooling ? { model: opts.model } : {}),
      })
      continue
    }

    const inQuarantine = isQuarantined(acc, now)
    if (inQuarantine) {
      evaluations.push({ ref, eligible: false, tier: null, reason: 'quarantine', until: acc.quarantineUntil, quarantineReason: acc.quarantineReason })
      continue
    }

    const isHardExhausted = (acc.usagePercent != null && Number(acc.usagePercent) >= 100 && (!acc.quota || !acc.quota.resetAt || Number(acc.quota.resetAt) > now))
    if (isHardExhausted) {
      evaluations.push({ ref, eligible: false, tier: null, reason: 'hard_exhausted', usagePercent: acc.usagePercent })
      continue
    }

    const isZeroQuota = Boolean(acc.quota && (
      (acc.quota.remaining != null && Number(acc.quota.remaining) <= 0) ||
      (acc.quota.remainingPercent != null && Number(acc.quota.remainingPercent) <= 0)
    ) && (!acc.quota.resetAt || Number(acc.quota.resetAt) > now))
    if (isZeroQuota) {
      evaluations.push({ ref, eligible: false, tier: null, reason: 'zero_quota' })
      continue
    }

    const softExhausted = isQuotaExhausted(acc) || isUsageExhausted(acc)
    if (softExhausted) {
      tiers[2].push(acc)
      evaluations.push({ ref, eligible: true, tier: 2, reason: 'soft_exhausted', remainingPercent: getAccountRemainingPercent(acc) })
      continue
    }

    if (!acc.quota) {
      tiers[1].push(acc)
      evaluations.push({ ref, eligible: true, tier: 1, reason: 'healthy_unknown_quota' })
    } else {
      tiers[0].push(acc)
      evaluations.push({ ref, eligible: true, tier: 0, reason: 'healthy_known_quota', remainingPercent: getAccountRemainingPercent(acc) })
    }
  }

  for (let tierIdx = 0; tierIdx < tiers.length; tierIdx++) {
    const tier = tiers[tierIdx]
    if (tier.length) {
      tier.sort((a, b) => {
        // #485: Smart Quota Drainer - prioritize higher burn urgency first
        if (opts && opts.drainBeforeReset) {
          const aUrg = Number(a.burnUrgency) || 0
          const bUrg = Number(b.burnUrgency) || 0
          if (Math.abs(aUrg - bUrg) > 0.01) {
            return bUrg - aUrg
          }
        }

        const strategy = (opts && opts.rotationStrategy) || 'round-robin'
        if (strategy === 'least-loaded') {
          const aRem = getAccountRemainingPercent(a)
          const bRem = getAccountRemainingPercent(b)
          if (aRem != null && bRem != null) {
            if (Math.abs(aRem - bRem) >= 5) {
              return bRem - aRem
            }
          } else if (aRem != null && bRem == null) {
            return -1
          } else if (aRem == null && bRem != null) {
            return 1
          }
          if (a.usagePercent != null && b.usagePercent != null) {
            if (Math.abs(Number(a.usagePercent) - Number(b.usagePercent)) >= 5) {
              return Number(a.usagePercent) - Number(b.usagePercent)
            }
          }
        } else if (strategy === 'priority') {
          const aWeight = a.weight || (a.isPro ? 5 : 1)
          const bWeight = b.weight || (b.isPro ? 5 : 1)
          if (aWeight !== bWeight) return bWeight - aWeight
          const aIdx = list.indexOf(a)
          const bIdx = list.indexOf(b)
          if (aIdx !== -1 && bIdx !== -1 && aIdx !== bIdx) return aIdx - bIdx
        } else if (strategy === 'quota-aware') {
          const floor = opts && opts.drainSafetyPercent != null ? Number(opts.drainSafetyPercent) : 5
          const aUrgency = calculateBurnUrgency(getAccountRemainingPercent(a), a.quota && a.quota.resetAt, now, floor)
          const bUrgency = calculateBurnUrgency(getAccountRemainingPercent(b), b.quota && b.quota.resetAt, now, floor)
          if (Math.abs(aUrgency - bUrgency) > 0.01) return bUrgency - aUrgency
        } else if (strategy === 'lowest-latency') {
          const aLatency = Number(a.lastPingMs ?? a.latencyMs ?? Infinity)
          const bLatency = Number(b.lastPingMs ?? b.latencyMs ?? Infinity)
          if (Number.isFinite(aLatency) && Number.isFinite(bLatency) && Math.abs(aLatency - bLatency) > 1) return aLatency - bLatency
          if (Number.isFinite(aLatency) !== Number.isFinite(bLatency)) return Number.isFinite(aLatency) ? -1 : 1
        }

        // #810: keep session traffic on a warm prompt-cache account.
        if (opts && Number(opts.promptCacheTtlMs) > 0) {
          const aCache = promptCacheAffinity(a, now, opts.promptCacheTtlMs).score
          const bCache = promptCacheAffinity(b, now, opts.promptCacheTtlMs).score
          if (Math.abs(aCache - bCache) > 0.01) return bCache - aCache
        }

        // 0. Auto-Pacing: lower pacing risk preferred (#352)
        const aRisk = Number(a.pacingRisk) || 0
        const bRisk = Number(b.pacingRisk) || 0
        if (Math.abs(aRisk - bRisk) >= 20) return aRisk - bRisk

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
        return (b.healthScore ?? 100) - (a.healthScore ?? 100)
      })

      let chosen = tier[0]
      let decisionReason = tierIdx === 0 ? 'healthy_tier0' : tierIdx === 1 ? 'healthy_tier1' : 'tier2_fallback'
      const strategy = (opts && opts.rotationStrategy) || 'round-robin'
      if (ruleRef) {
        const ruled = tier.find((account) => (account.ref || account.id) === ruleRef)
        if (ruled) {
          chosen = ruled
          decisionReason = 'model_rule'
        }
      } else if (strategy === 'round-robin' && tier.length > 1) {
        const key = tier.map((account) => account.ref || account.id).join('|')
        const last = roundRobinCursor.get(key)
        const index = last ? tier.findIndex((account) => (account.ref || account.id) === last) : -1
        chosen = tier[(index + 1) % tier.length]
        roundRobinCursor.set(key, chosen.ref || chosen.id)
        if (index >= 0) decisionReason = 'round_robin'
      }
      if (!ruleRef && strategy === 'quota-aware' && opts && opts.defaultRef) {
        const byDefault = tier.find((account) => (account.ref || account.id) === opts.defaultRef)
        if (byDefault && byDefault !== chosen) {
          const floor = opts.drainSafetyPercent != null ? Number(opts.drainSafetyPercent) : 5
          const chosenUrgency = calculateBurnUrgency(getAccountRemainingPercent(chosen), chosen.quota && chosen.quota.resetAt, now, floor)
          const defaultUrgency = calculateBurnUrgency(getAccountRemainingPercent(byDefault), byDefault.quota && byDefault.quota.resetAt, now, floor)
          if (defaultUrgency >= chosenUrgency - 5) chosen = byDefault
        }
      }
      const chosenRef = chosen.ref || chosen.id
      if (targetSession && chosen) {
        pinSession(targetSession, chosenRef, {
          provider: chosen.provider,
          model: opts && opts.model,
          cacheAware: isCacheAwareProvider(chosen.provider),
        })
      }
      return {
        account: chosen,
        trace: {
          chosenRef,
          decisionReason,
          tier: tierIdx,
          evaluations,
          selectionMetrics: {
            tier: tierIdx,
            burnUrgency: chosen.burnUrgency != null ? Number(chosen.burnUrgency) : null,
            pacingRisk: chosen.pacingRisk != null ? Number(chosen.pacingRisk) : null,
            remainingPercent: getAccountRemainingPercent(chosen),
            resetAt: chosen.quota?.resetAt || null,
            weight: chosen.weight || (chosen.isPro ? 5 : 1),
            healthScore: chosen.healthScore ?? 100,
            urgency: calculateBurnUrgency(getAccountRemainingPercent(chosen), chosen.quota && chosen.quota.resetAt, now, opts && opts.drainSafetyPercent != null ? Number(opts.drainSafetyPercent) : 5),
            defaultAccount: Boolean(opts && opts.defaultRef && chosenRef === opts.defaultRef),
            cacheAffinity: opts && Number(opts.promptCacheTtlMs) > 0 ? promptCacheAffinity(chosen, now, opts.promptCacheTtlMs) : null,
          },
        },
      }
    }
  }

  return {
    account: null,
    trace: {
      chosenRef: null,
      decisionReason: 'no_usable_account',
      tier: null,
      evaluations,
      selectionMetrics: null,
    },
  }
}

export function pickAccount(accounts, nowMs, opts) {
  const res = pickAccountWithTrace(accounts, nowMs, opts)
  return res ? res.account : null
}

export function markCooldown(account, nowMs, cooldownMs, family, customUntil = null, model = null) {
  const wait = Number(cooldownMs)
  const ms = Number.isFinite(wait) && wait > 0 ? wait : 30 * 60 * 1000
  const until = (customUntil && Number(customUntil) > (Number(nowMs) || 0))
    ? Number(customUntil)
    : ((Number(nowMs) || 0) + ms)
  // #814: Claude/Antigravity quotas are model-specific. Auth/session errors
  // are handled elsewhere as account-wide; ordinary model quota failures stay
  // scoped to the failing model.
  if (model && (account.provider === 'claude' || account.provider === 'antigravity')) {
    return {
      ...account,
      cooldownModels: { ...(account.cooldownModels || {}), [model]: until },
    }
  }
  const prev = Array.isArray(account.cooldownFamilies) ? account.cooldownFamilies.slice() : []
  const fams = family ? (prev.includes(family) ? prev : prev.concat(family)) : prev
  return {
    ...account,
    cooldownUntil: until,
    ...(fams.length ? { cooldownFamilies: fams } : {}),
  }
}
