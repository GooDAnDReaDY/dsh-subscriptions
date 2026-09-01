import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { oauthRef, isProvider } from './refs.js'
import { parseBlob, serializeBlob } from './blob.js'
import { getVendor } from './vendors/index.js'

const SKEW_MS = 60 * 1000
const USAGE_TTL_MS = 2 * 60 * 1000

export function normalizeSlots(slots) {
  const out = []
  const seen = new Set()
  for (const slot of Array.isArray(slots) ? slots : []) {
    if (!isProvider(slot.provider)) continue
    const index = Number(slot.index)
    if (!Number.isInteger(index) || index < 1) continue
    const ref = oauthRef(slot.provider, index)
    if (seen.has(ref)) continue
    seen.add(ref)
    out.push({
      provider: slot.provider,
      index,
      label: String(slot.label || ''),
      ref,
    })
  }
  return out
}

export function vendorConfig(provider, cfg) {
  const d = getVendor(provider).defaults()
  const pick = (suffix, fallback) => {
    const value = cfg && cfg[`${provider}${suffix}`]
    if (value == null || String(value).trim() === '') return fallback
    return String(value).trim()
  }
  const modelsKey = `${provider}Models`
  return {
    clientId: pick('ClientId', d.clientId),
    clientSecret: pick('ClientSecret', d.clientSecret || ''),
    redirectUri: pick('RedirectUri', d.redirectUri),
    baseUrl: pick('BaseUrl', d.baseUrl || ''),
    originator: pick('Originator', d.originator || ''),
    systemPrefix: pick('SystemPrefix', d.systemPrefix || ''),
    clientVersion: pick('ClientVersion', d.clientVersion || ''),
    // #93/#92: per-vendor request shaping (codex only consumes these today).
    verbosity: pick('Verbosity', ''),
    fastMode: !!(cfg && cfg[`${provider}FastMode`]),
    models: Array.isArray(cfg && cfg[modelsKey]) && cfg[modelsKey].length
      ? cfg[modelsKey]
      : (d.models || []),
  }
}

export function createAccountStore({ credentials, getConfig, fetchImpl, fetchForRef, onLimitNotice }) {
  const cooldowns = new Map()
  const quotas = new Map()
  const refreshLocks = new Map()
  const refreshFailures = new Map()
  const usage = new Map()
  const notifyThresholds = new Map()
  const health = new Map()
  const requestCounts = new Map()
  const windows = new Map()
  const usageFetched = new Map()
  const doFetch = fetchImpl || fetch
  // #88: per-account proxy fetch for token refresh / usage (falls back to doFetch).
  const fetchFor = (ref) => (typeof fetchForRef === 'function' && fetchForRef(ref)) || doFetch

  async function resolveRaw(ref) {
    try {
      const resolved = await credentials.resolve(credentialRef(ref))
      return resolved && resolved.value ? String(resolved.value) : ''
    } catch {
      return ''
    }
  }

  async function loadBlob(ref) {
    const raw = await resolveRaw(ref)
    if (!raw) {
      const err = new Error(`no token for ${ref}`)
      err.code = 'AUTH'
      throw err
    }
    return parseBlob(raw)
  }

  async function saveBlob(ref, blob) {
    await credentials.set(credentialRef(ref), serializeBlob(blob))
  }

  async function clearRef(ref) {
    await credentials.unset(credentialRef(ref))
    cooldowns.delete(ref)
    quotas.delete(ref)
    for (const k of [...notifyThresholds.keys()]) { if (k.startsWith(ref + ':')) notifyThresholds.delete(k) }
    for (const k of [...notifyThresholds.keys()]) { if (k.startsWith(ref + ':')) notifyThresholds.delete(k) }
    refreshFailures.delete(ref)
    usage.delete(ref)
    usageFetched.delete(ref)
  }

  async function describeRef(ref) {
    const base = { ref, configured: false, writable: true, label: '', email: '' }
    try {
      if (typeof credentials.describe === 'function') {
        const d = await credentials.describe(credentialRef(ref))
        base.configured = !!(d && d.configured)
        base.writable = d && d.writable === false ? false : true
      } else {
        base.configured = !!(await resolveRaw(ref))
      }
    } catch {
      return base
    }
    if (base.configured) {
      try {
        const blob = parseBlob(await resolveRaw(ref))
        base.label = blob.label || blob.email || ''
        base.email = blob.email || ''
        if (Array.isArray(blob.usage)) { base.usage = blob.usage; base.usageAt = blob.usageAt || 0 }
        if (blob.validationUrl) base.validationUrl = blob.validationUrl
        if (blob.validationMessage) base.validationMessage = blob.validationMessage
        if (blob.accountNotice) base.accountNotice = blob.accountNotice
        if (blob.paidTierName) base.paidTierName = blob.paidTierName
      } catch { /* ignore parse */ }
    }
    return {
      ...base,
      cooldownUntil: cooldowns.get(ref) || 0,
      quota: quotas.get(ref) || null,
      usage: windows.get(ref) || base.usage || null,
      health: health.get(ref) || null,
      usagePercent: usage.has(ref) ? usage.get(ref) : null,
      refreshError: refreshFailures.get(ref)?.error || '',
      validationUrl: base.validationUrl || '',
      validationMessage: base.validationMessage || '',
      accountNotice: base.accountNotice || '',
      paidTierName: base.paidTierName || '',
    }
  }

  async function listAccounts(provider) {
    const slots = normalizeSlots(getConfig().slots).filter((s) => s.provider === provider)
    const out = []
    for (const slot of slots) {
      const info = await describeRef(slot.ref)
      out.push({
        ref: slot.ref,
        hasToken: !!info.configured,
        usagePercent: info.usagePercent,
        cooldownUntil: info.cooldownUntil,
        quota: info.quota || null,
        label: slot.label || info.label,
      })
    }
    return out
  }

  async function loggedInProviders() {
    const found = new Set()
    for (const slot of normalizeSlots(getConfig().slots)) {
      const info = await describeRef(slot.ref)
      if (info.configured) found.add(slot.provider)
    }
    return [...found]
  }

  async function ensureFresh(provider, blob, ref) {
    if (!blob.refreshToken) return blob
    if (blob.expiresAt && blob.expiresAt - SKEW_MS > Date.now()) return blob
    if (ref && refreshLocks.has(ref)) return refreshLocks.get(ref)
    const promise = (async () => {
      try {
        const cfg = vendorConfig(provider, getConfig())
        const next = await getVendor(provider).refresh(cfg, blob, fetchFor(ref))
        const merged = {
          ...blob,
          ...next,
          refreshToken: next.refreshToken || blob.refreshToken,
          projectId: next.projectId || blob.projectId,
          accountId: next.accountId || blob.accountId,
        }
        if (ref) await saveBlob(ref, merged)
        if (ref) refreshFailures.delete(ref)
        return merged
      } catch (e) {
        if (ref) refreshFailures.set(ref, { at: Date.now(), error: String(e && e.message || e) })
        throw e
      } finally {
        if (ref) refreshLocks.delete(ref)
      }
    })()
    if (ref) refreshLocks.set(ref, promise)
    return promise
  }

  async function refreshUsage(provider) {
    const cfg = vendorConfig(provider, getConfig())
    const vendor = getVendor(provider)
    for (const slot of normalizeSlots(getConfig().slots).filter((s) => s.provider === provider)) {
      const last = usageFetched.get(slot.ref) || 0
      if (Date.now() - last < USAGE_TTL_MS) continue
      let raw = ''
      try { raw = await resolveRaw(slot.ref) } catch { continue }
      if (!raw) continue
      try {
        const blob = await ensureFresh(provider, parseBlob(raw), slot.ref)
        const snap = await vendor.usage(blob, cfg, fetchFor(slot.ref))
        usageFetched.set(slot.ref, Date.now())
        if (!snap) continue
        if (Number.isFinite(Number(snap.usedPercent))) {
          usage.set(slot.ref, Number(snap.usedPercent))
        }
        // Notification thresholds: 70/90/100% — fire once per window until reset.
        if (Array.isArray(snap.windows)) {
          for (const win of snap.windows) {
            if (!win || !Number.isFinite(Number(win.usedPercent))) continue
            const pct = Number(win.usedPercent)
            const key = slot.ref + ':' + win.id
            const prev = notifyThresholds.get(key) || 0
            const THRESHOLDS = [70, 90, 100]
            for (const th of THRESHOLDS) {
              if (pct >= th && prev < th) {
                notifyThresholds.set(key, th)
                try { onLimitNotice && onLimitNotice(slot.provider, slot.ref, win, th) } catch {}
                break
              }
            }
          }
        }
        // Notification thresholds: 70/90/100% — fire once per window until reset.
        if (Array.isArray(snap.windows)) {
          for (const win of snap.windows) {
            if (!win || !Number.isFinite(Number(win.usedPercent))) continue
            const pct = Number(win.usedPercent)
            const key = slot.ref + ':' + win.id
            const prev = notifyThresholds.get(key) || 0
            const THRESHOLDS = [70, 90, 100]
            for (const th of THRESHOLDS) {
              if (pct >= th && prev < th) {
                notifyThresholds.set(key, th)
                try { onLimitNotice && onLimitNotice(slot.provider, slot.ref, win, th) } catch {}
                break
              }
            }
          }
        }
        const list = Array.isArray(snap.windows) ? snap.windows : null
        if (list) {
          windows.set(slot.ref, list)
          // persist last known windows so the card survives restarts
          try {
            const prev = Array.isArray(blob.usage) ? JSON.stringify(blob.usage) : ''
            if (prev !== JSON.stringify(list)) {
              await saveBlob(slot.ref, { ...blob, usage: list, usageAt: Date.now() })
            } else if (!blob.usageAt) {
              await saveBlob(slot.ref, { ...blob, usageAt: Date.now() })
            }
          } catch { /* persistence best-effort */ }
        }
      } catch {
        usageFetched.set(slot.ref, Date.now())
      }
    }
  }

  return {
    loadBlob,
    saveBlob,
    clearRef,
    describeRef,
    listAccounts,
    loggedInProviders,
    resolveRaw,
    ensureFresh,
    refreshUsage,
    rememberCooldown(ref, until) { cooldowns.set(ref, until) },
    rememberQuota(ref, snap) { if (snap) quotas.set(ref, snap); else quotas.delete(ref) },
    shouldSkipRefresh(ref, now, retryMs) { const f = refreshFailures.get(ref); if (!f) return false; return (Number(f.at) + Number(retryMs)) > Number(now) },
    getQuota(ref) { return quotas.get(ref) || null },
    rememberUsage(ref, percent) { usage.set(ref, percent) },
    getHealth(ref) { return health.get(ref) || null },
    setHealth(ref, h) { health.set(ref, h) },
    recordSwitch(ref) { health.set(ref, recordSwitch(health.get(ref))) },
    recordExhaust(ref) { health.set(ref, recordExhaust(health.get(ref))) },
    recordBroken(ref) { health.set(ref, recordBroken(health.get(ref))) },
    recordSuccess(ref) {
      // успешный запрос сбрасывает кулдаун и возвращает аккаунт в строй
      cooldowns.delete(ref)
      if (health.has(ref)) health.set(ref, null)
    },
    rememberRequest(ref) { requestCounts.set(ref, (requestCounts.get(ref) || 0) + 1) },
    getRequestCount(ref) { return requestCounts.get(ref) || 0 },
  }
}