import { calculateBurnRatePerHour } from "./forecast.js"
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

function resolveQuarantineFilePath() {
  const base = process.env.DSH_HOME || join(homedir(), '.dsh')
  return join(base, 'subscriptions', 'quarantines.json')
}

function loadQuarantinesFromFile(map) {
  try {
    const p = resolveQuarantineFilePath()
    const content = readFileSync(p, 'utf8')
    const json = JSON.parse(content)
    if (json && typeof json === 'object') {
      for (const [k, v] of Object.entries(json)) {
        if (v && typeof v === 'object' && v.until) {
          map.set(k, v)
        }
      }
    }
  } catch { /* best-effort */ }
}

function saveQuarantinesToFile(map) {
  try {
    const p = resolveQuarantineFilePath()
    mkdirSync(join(p, '..'), { recursive: true })
    const obj = {}
    for (const [k, v] of map.entries()) {
      if (v && typeof v === 'object' && v.until) {
        obj[k] = v
      }
    }
    writeFileSync(p, JSON.stringify(obj), 'utf8')
  } catch { /* best-effort */ }
}

const sharedQuarantines = new Map()
loadQuarantinesFromFile(sharedQuarantines)

import { needsWarmupProbe, enterProbing, resolveWarmupSuccess, resolveWarmupFailure, STATUS_QUARANTINE, STATUS_PROBING } from "./quarantine.js"
import { fetchWithTimeout, isTimeoutError } from "./http.js"
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { oauthRef, isProvider } from './refs.js'
import { parseBlob, serializeBlob } from './blob.js'
import { encryptWithPassphrase, decryptWithPassphrase } from './crypto.js'
import { accountIdentityKey, credentialState } from './account-reliability.js'
import { recordSwitch, recordExhaust, recordBroken, computeHealthScore, healthBadge } from './health.js'
import { executeWithRetry } from './backoff.js'
import { getVendor } from './vendors/index.js'
import { versionForProvider } from './client-version-service.js'

const SKEW_MS = 60 * 1000
const USAGE_TTL_MS = 2 * 60 * 1000

export function normalizeSlots(slots) {
  const out = []
  const seen = new Set()
  for (const slot of Array.isArray(slots) ? slots : []) {
    if (!slot || typeof slot !== 'object') continue
    if (!isProvider(slot.provider)) continue
    const index = Number(slot.index)
    if (!Number.isInteger(index) || index < 1) continue
    const ref = oauthRef(slot.provider, index)
    if (seen.has(ref)) continue
    seen.add(ref)
    out.push({
      ...slot,
      provider: slot.provider,
      index,
      label: String(slot.label || ''),
      ref,
      ...(slot.proxyUrl ? { proxyUrl: String(slot.proxyUrl) } : {}),
      ...(slot.expiresAt ? { expiresAt: Number(slot.expiresAt) } : {}),
      ...(slot.maxConcurrency !== undefined ? { maxConcurrency: Number(slot.maxConcurrency) } : {}),
      ...(Array.isArray(slot.proxyBypass) ? { proxyBypass: slot.proxyBypass.map((host) => String(host).trim()).filter(Boolean) } : {}),
      ...(slot.independentEntry === true ? { independentEntry: true } : {}),
      ...(slot.independentAlias ? { independentAlias: String(slot.independentAlias).trim() } : {}),
      ...(slot.poolEnabled === false ? { poolEnabled: false } : {}),
      ...(slot.isDefault ? { isDefault: true } : {}),
      ...(Array.isArray(slot.poolModels)
        ? { poolModels: [...new Set(slot.poolModels.map((id) => String(id).trim()).filter(Boolean))] }
        : {}),
    })
  }
  return out
}

export function defaultAccountRef(slots, provider) {
  const list = normalizeSlots(slots).filter((slot) => slot.provider === provider)
  const marked = list.find((slot) => slot.isDefault)
  return (marked || list[0] || null)?.ref || null
}

export function vendorConfig(provider, cfg) {
  const d = getVendor(provider).defaults()
  const pick = (suffix, fallback) => {
    const value = cfg && cfg[`${provider}${suffix}`]
    if (value == null || String(value).trim() === '') return fallback
    return String(value).trim()
  }
  const modelsKey = `${provider}Models`
  const manualVersion = provider === 'claude' ? pick('CcVersion', '') : pick('ClientVersion', '')
  const resolvedVersion = versionForProvider(provider, manualVersion, d.clientVersion || d.claudeCcVersion || '')
  return {
    clientId: pick('ClientId', d.clientId),
    clientSecret: pick('ClientSecret', d.clientSecret || ''),
    redirectUri: pick('RedirectUri', d.redirectUri),
    baseUrl: pick('BaseUrl', d.baseUrl || ''),
    originator: pick('Originator', d.originator || ''),
    systemPrefix: pick('SystemPrefix', d.systemPrefix || ''),
    clientVersion: resolvedVersion.version,
    ...(provider === 'claude' ? { claudeCcVersion: resolvedVersion.version } : {}),
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
  const quotaSamples = new Map()
  const quarantines = sharedQuarantines
  const writeQueues = new Map()
  const credentialVersions = new Map()
  const clearedRefs = new Set()
  const latestBlobs = new Map()
  const refreshLocks = new Map()
  const refreshFailures = new Map()
  const usage = new Map()
  const notifyThresholds = new Map()
  const health = new Map()
  const requestCounts = new Map()
  const lastUsedAt = new Map()
  const windows = new Map()
  const usageFetched = new Map()
  const pings = new Map()
  const doctorVerdicts = new Map()
  const dynamicModels = new Map()
  const doFetch = fetchImpl || fetch
  const clockDrifts = new Map()

  function getClockSkew(provider) {
    if (!provider) return 0
    return clockDrifts.get(String(provider).toLowerCase()) || 0
  }

  function recordClockSkew(provider, vendorDateMsOrHeader) {
    if (!provider) return
    const key = String(provider).toLowerCase()
    if (typeof vendorDateMsOrHeader === 'number') {
      clockDrifts.set(key, vendorDateMsOrHeader - Date.now())
    } else if (typeof vendorDateMsOrHeader === 'string') {
      const parsed = Date.parse(vendorDateMsOrHeader)
      if (!isNaN(parsed)) {
        clockDrifts.set(key, parsed - Date.now())
      }
    }
  }

  // #88: per-account proxy fetch for token refresh / usage (falls back to doFetch).
  const rawFetchFor = (ref) => (typeof fetchForRef === 'function' && fetchForRef(ref)) || doFetch
  const fetchFor = (ref, defaultTimeoutMs = 25000, providerHint = null) => async (url, init, opts) => {
    const res = await fetchWithTimeout(rawFetchFor(ref), url, init, { timeoutMs: defaultTimeoutMs, ...(opts || {}) })
    try {
      const dateHeader = res && res.headers && typeof res.headers.get === 'function' ? res.headers.get('date') : null
      if (dateHeader) {
        const prov = providerHint || (ref ? String(ref).split('_')[0].toLowerCase() : null)
        if (prov) recordClockSkew(prov, dateHeader)
      }
    } catch { /* best-effort drift extraction */ }
    return res
  }

  function resolveMasterKey(passedCfg = null) {
    const envKey = process.env.DSH_SUBSCRIPTIONS_MASTER_KEY
    if (typeof envKey === 'string' && envKey.trim()) return envKey.trim()
    if (passedCfg && typeof passedCfg.masterKey === 'string' && passedCfg.masterKey.trim()) {
      return passedCfg.masterKey.trim()
    }
    return ''
  }

  function currentMasterKey() {
    let cfg = null
    try {
      cfg = typeof getConfig === 'function' ? getConfig() : null
    } catch { /* keep env-only fallback */ }
    return resolveMasterKey(cfg)
  }

  async function resolveRaw(ref) {
    try {
      const resolved = await credentials.resolve(credentialRef(ref))
      const raw = resolved && resolved.value ? String(resolved.value) : ''
      if (!raw) return ''
      if (raw.startsWith('DSHE1:') || raw.startsWith('DSHE2:') || raw.startsWith('DSHE3:')) {
        const masterKey = currentMasterKey()
        if (!masterKey) {
          const err = /** @type {Error & { code?: string }} */ (new Error(`Credentials for ${ref} are encrypted at rest. Configure masterKey in the plugin settings or DSH_SUBSCRIPTIONS_MASTER_KEY to decrypt.`))
          err.code = 'ENCRYPTED_AT_REST'
          throw err
        }
        return decryptWithPassphrase(raw, masterKey)
      }
      return raw
    } catch (err) {
      if (err && err.code === 'ENCRYPTED_AT_REST') throw err
      return ''
    }
  }

  async function loadBlob(ref) {
    const raw = await resolveRaw(ref)
    if (!raw) {
      const err = /** @type {Error & { code?: string }} */ (new Error(`no token for ${ref}`))
      err.code = 'AUTH'
      throw err
    }
    return parseBlob(raw)
  }

  async function saveBlob(ref, blob) {
    if (!ref || typeof ref !== "string") throw new Error("invalid ref for saveBlob")
    clearedRefs.delete(ref)
    latestBlobs.set(ref, blob)
    const version = (credentialVersions.get(ref) || 0) + 1
    credentialVersions.set(ref, version)

    const prev = writeQueues.get(ref) || Promise.resolve()
    const next = prev.catch(() => {}).then(async () => {
      if (clearedRefs.has(ref) || credentialVersions.get(ref) !== version) {
        return
      }
      try {
        const serialized = serializeBlob(blob)
        const masterKey = currentMasterKey()
        const toStore = masterKey ? encryptWithPassphrase(serialized, masterKey) : serialized
        await credentials.set(credentialRef(ref), toStore)
        if (clearedRefs.has(ref)) {
          try { await credentials.unset(credentialRef(ref)) } catch { /* best-effort */ }
        } else if (credentialVersions.get(ref) > version && latestBlobs.has(ref)) {
          const nextSerialized = serializeBlob(latestBlobs.get(ref))
          const nextStore = masterKey ? encryptWithPassphrase(nextSerialized, masterKey) : nextSerialized
          try { await credentials.set(credentialRef(ref), nextStore) } catch { /* best-effort */ }
        }
      } catch (err) {
        if (clearedRefs.has(ref) || credentialVersions.get(ref) !== version) {
          return
        }
        const wrapErr = /** @type {Error & { code?: string, cause?: any }} */ (new Error(`failed to persist credentials for ${ref}: ${err && err.message || err}`))
        wrapErr.code = "CREDENTIAL_SAVE_FAILED"
        wrapErr.cause = err
        throw wrapErr
      }
    })
    writeQueues.set(ref, next)
    await next
  }

  async function clearRef(ref) {
    if (!ref || typeof ref !== "string") return
    clearedRefs.add(ref)
    latestBlobs.delete(ref)
    const version = (credentialVersions.get(ref) || 0) + 1
    credentialVersions.set(ref, version)
    try {
      await credentials.unset(credentialRef(ref))
    } catch { /* best-effort unset */ }
    cooldowns.delete(ref)
    quotas.delete(ref)
    quotaSamples.delete(ref)
    quarantines.delete(ref)
    saveQuarantinesToFile(quarantines)
    writeQueues.delete(ref)
    for (const k of [...notifyThresholds.keys()]) { if (k.startsWith(ref + ':')) notifyThresholds.delete(k) }
    refreshFailures.delete(ref)
    usage.delete(ref)
    usageFetched.delete(ref)
    // Counters and health must not outlive the account, otherwise a
    // re-added slot inherits stale rotation statistics.
    requestCounts.delete(ref)
    lastUsedAt.delete(ref)
    health.delete(ref)
    windows.delete(ref)
  }

  async function describeRef(ref, cfg = null) {
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
    let isEncryptedAtRest = false
    try {
      const resolved = await credentials.resolve(credentialRef(ref))
      const raw = resolved && resolved.value ? String(resolved.value) : ''
      if (raw.startsWith('DSHE1:') || raw.startsWith('DSHE2:') || raw.startsWith('DSHE3:')) {
        isEncryptedAtRest = true
      } else if (Boolean(resolveMasterKey(cfg))) {
        isEncryptedAtRest = true
      }
    } catch { /* best-effort */ }

    if (base.configured) {
      try {
        const blob = parseBlob(await resolveRaw(ref))
        const state = credentialState(blob)
        if (!state.usable) {
          base.configured = false
          base.credentialError = state.reason
          base.label = blob.label || blob.email || ''
          return {
            ...base,
            cooldownUntil: 0,
            quarantineUntil: 0,
            cooldownFamilies: null,
            cooldownModels: null,
            quota: null,
            isRevoked: false,
            authWarning: '',
            validationUrl: '',
            validationMessage: '',
            accountNotice: '',
            paidTierName: '',
          }
        }
        base.label = blob.label || blob.email || ''
        base.email = blob.email || ''
        base.plan = blob.plan || blob.paidTierName || ''
        base.avatarUrl = blob.avatarUrl || ''
        base.scopes = Array.isArray(blob.scopes) ? blob.scopes : []
        base.scopeWarning = blob.scopeWarning || ''
        if (Array.isArray(blob.usage)) { base.usage = blob.usage; base.usageAt = blob.usageAt || 0 }
        if (blob.validationUrl) base.validationUrl = blob.validationUrl
        if (blob.validationMessage) base.validationMessage = blob.validationMessage
        if (blob.accountNotice) base.accountNotice = blob.accountNotice
        if (blob.paidTierName) base.paidTierName = blob.paidTierName
        base.selectedOrgId = blob.selectedOrgId || blob.accountId || blob.projectId || ''
        base.selectedOrgName = blob.selectedOrgName || base.selectedOrgId || ''
        base.organizations = Array.isArray(blob.organizations) ? blob.organizations : []
      } catch { /* ignore parse */ }
    }
    return {
      ...base,
      cooldownUntil: cooldowns.get(ref) ? cooldowns.get(ref).until : 0,
      quarantineUntil: quarantines.get(ref) ? quarantines.get(ref).until : 0,
      quarantineReason: quarantines.get(ref) ? quarantines.get(ref).reason : null,
      cooldownFamilies: cooldowns.get(ref) && cooldowns.get(ref).families ? cooldowns.get(ref).families : null,
      cooldownModels: cooldowns.get(ref) && cooldowns.get(ref).models ? cooldowns.get(ref).models : null,
      quota: quotas.get(ref) || null,
      pacePerHour: quotas.get(ref)?.pacePerHour || calculateBurnRatePerHour(quotaSamples.get(ref) || [], Date.now()),
      samples: quotaSamples.get(ref) || [],
      usage: windows.get(ref) || base.usage || null,
      health: health.get(ref) || null,
      healthScore: computeHealthScore(health.get(ref) || null),
      healthBadge: healthBadge(computeHealthScore(health.get(ref) || null)),
      usagePercent: usage.has(ref) ? usage.get(ref) : null,
      refreshError: refreshFailures.get(ref)?.error || '',
      isTimeout: !!refreshFailures.get(ref)?.isTimeout,
      plan: base.plan || '',
      avatarUrl: base.avatarUrl || '',
      scopes: base.scopes || [],
      scopeWarning: base.scopeWarning || '',
      selectedOrgId: base.selectedOrgId || '',
      selectedOrgName: base.selectedOrgName || '',
      organizations: base.organizations || [],
      isEncryptedAtRest,
      isRevoked: Boolean(
        (quarantines.get(ref)?.reason === 'REVOKED' || quarantines.get(ref)?.reason === 'SESSION_REVOKED') ||
        (doctorVerdicts.get(ref)?.code === 'TOKEN_EXPIRED' || doctorVerdicts.get(ref)?.code === 'TOKEN_REVOKED') ||
        (/invalid_grant|token_revoked|revoked|session expired/i.test(refreshFailures.get(ref)?.error || ''))
      ),
      authWarning: (
        (quarantines.get(ref)?.reason === 'REVOKED' || quarantines.get(ref)?.reason === 'SESSION_REVOKED') ||
        (doctorVerdicts.get(ref)?.code === 'TOKEN_EXPIRED' || doctorVerdicts.get(ref)?.code === 'TOKEN_REVOKED') ||
        (/invalid_grant|token_revoked|revoked|session expired/i.test(refreshFailures.get(ref)?.error || ''))
      ) ? 'Session expired / revoked — re-authorization required' : '',
      validationUrl: base.validationUrl || '',
      validationMessage: base.validationMessage || '',
      accountNotice: base.accountNotice || '',
      paidTierName: base.paidTierName || '',
      lastPingMs: pings.get(ref)?.latencyMs ?? null,
      latencyGrade: pings.get(ref)?.latencyGrade ?? null,
      lastDoctorVerdict: doctorVerdicts.get(ref) || null,
      availableModels: dynamicModels.get(ref)?.models || null,
      credentialError: base.credentialError || null,
    }
  }

  async function listAccounts(provider) {
    const curConfig = getConfig()
    const slots = normalizeSlots(curConfig.slots).filter((s) => s.provider === provider)
    const out = []
    const identities = new Map()
    for (const slot of slots) {
      const info = await describeRef(slot.ref, curConfig)
      const identity = accountIdentityKey(provider, { email: info.email, accountId: info.accountId })
      const duplicateOf = identity ? (identities.get(identity) || null) : null
      if (identity && !duplicateOf) identities.set(identity, slot.ref)
      const q = quarantines.get(slot.ref)
      out.push({
        ref: slot.ref,
        hasToken: !!info.configured,
        usagePercent: info.usagePercent,
        cooldownUntil: info.cooldownUntil,
        cooldownFamilies: info.cooldownFamilies || null,
        cooldownModels: info.cooldownModels || null,
        quota: info.quota || null,
        healthScore: computeHealthScore(info.health),
        healthBadge: healthBadge(computeHealthScore(info.health)),
        quarantineUntil: q ? q.until : 0,
        quarantineReason: q ? q.reason : null,
        label: slot.label || info.label,
        pacePerHour: info.pacePerHour || 0,
        maxConcurrency: slot.maxConcurrency !== undefined ? slot.maxConcurrency : (curConfig.accountMaxConcurrency || 1),
        maxQueueSize: slot.maxQueueSize > 0 ? Number(slot.maxQueueSize) : (curConfig.maxQueueSize || 20),
        vipOnly: !!slot.vipOnly,
        tags: Array.isArray(slot.tags) ? slot.tags : [],
        weight: Number(slot.weight) || 0,
        isPro: !!slot.isPro,
        poolEnabled: slot.poolEnabled !== false,
        isDefault: !!slot.isDefault,
        proxyBypass: Array.isArray(slot.proxyBypass) ? slot.proxyBypass : [],
        independentEntry: slot.independentEntry === true,
        independentAlias: slot.independentAlias || '',
        ...(Array.isArray(slot.poolModels) ? { poolModels: slot.poolModels } : {}),
        credentialError: info.credentialError || null,
        lastUsedAt: lastUsedAt.get(slot.ref) || 0,
        duplicateOf,
      })
    }
    return out
  }

  async function loggedInProviders() {
    const curConfig = getConfig()
    const slots = normalizeSlots(curConfig.slots)
    const found = new Set()
    for (const slot of slots) {
      const info = await describeRef(slot.ref, curConfig)
      if (info.configured) found.add(slot.provider)
    }
    return [...found]
  }

  async function ensureFresh(provider, blob, ref) {
    if (!blob || typeof blob !== 'object') return blob
    if (blob.apiKeyOnly || (blob.apiKey && (!blob.refreshToken || blob.refreshToken === blob.apiKey))) return blob
    if (!blob.refreshToken) return blob

    const curConfig = getConfig()
    const safetyMargin = Math.max(SKEW_MS, Number(curConfig?.refreshAheadMs) || (5 * 60 * 1000))
    const clockSkew = getClockSkew(provider)
    const adjustedNow = Date.now() + clockSkew

    if (blob.expiresAt && blob.expiresAt - safetyMargin > adjustedNow) return blob

    if (ref && refreshFailures.has(ref)) {
      const failInfo = refreshFailures.get(ref)
      const retryMs = Math.min(Number(curConfig?.refreshRetryMs) || 10000, 60000)
      if (Date.now() - (failInfo.at || 0) < retryMs) {
        if (blob.expiresAt && blob.expiresAt > adjustedNow && blob.accessToken) {
          return blob
        }
        const err = /** @type {Error & { code?: string }} */ (new Error(`Token refresh in backoff window after failure: ${failInfo.error || 'transient failure'}`))
        err.code = 'TOKEN'
        throw err
      }
    }

    const lockKey = ref || (provider + ":" + (blob.accountId || blob.email || (blob.refreshToken && blob.refreshToken.slice(-16)) || "anon"))
    if (refreshLocks.has(lockKey)) return refreshLocks.get(lockKey)
    const promise = (async () => {
      try {
        const cfg = vendorConfig(provider, curConfig)
        const next = await executeWithRetry(
          () => getVendor(provider).refresh(cfg, blob, fetchFor(ref, 30000, provider)),
          {
            maxRetries: 2,
            initialDelayMs: 300,
            maxDelayMs: 2000,
            isRetryable: (err) => {
              const status = Number(err && (err.status || err.statusCode) || 0)
              if (status === 400 || status === 401 || status === 403) return false
              return true
            },
          }
        )
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
        const isTimeout = isTimeoutError(e)
        const errMsg = isTimeout
          ? `Network timeout refreshing token: ${e.message || 'timed out'}`
          : String(e && e.message || e)
        if (ref) refreshFailures.set(ref, { at: Date.now(), error: errMsg, isTimeout })
        throw e
      } finally {
        refreshLocks.delete(lockKey)
      }
    })()
    refreshLocks.set(lockKey, promise)
    return promise
  }

  const providerUsageLocks = new Map()
  const slotUsageLocks = new Map()

  async function refreshUsage(provider) {
    if (providerUsageLocks.has(provider)) {
      return providerUsageLocks.get(provider)
    }
    const flight = (async () => {
      const curConfig = getConfig()
      const cfg = vendorConfig(provider, curConfig)
      const vendor = getVendor(provider)
      const slots = normalizeSlots(curConfig.slots).filter((s) => s.provider === provider)
      for (const slot of slots) {
        if (slotUsageLocks.has(slot.ref)) {
          await slotUsageLocks.get(slot.ref).catch(() => {})
          continue
        }
        const last = usageFetched.get(slot.ref) || 0
        if (Date.now() - last < USAGE_TTL_MS) continue
        let raw = ''
        try { raw = await resolveRaw(slot.ref) } catch { continue }
        if (!raw) continue

        const slotFlight = (async () => {
          try {
            usageFetched.set(slot.ref, Date.now())
            const blob = await ensureFresh(provider, parseBlob(raw), slot.ref)
            const usageTimeout = Number(curConfig?.usageTimeoutMs) || 15000
            const snap = await vendor.usage(blob, cfg, fetchFor(slot.ref, usageTimeout))
            if (!snap) return
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
                    try { onLimitNotice && onLimitNotice(slot.provider, slot.ref, win, th) } catch { /* ignore notification failure */ }
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
                if (clearedRefs.has(slot.ref)) return
                let currentBlob = null
                try {
                  const currentRaw = await resolveRaw(slot.ref)
                  if (currentRaw) currentBlob = parseBlob(currentRaw)
                } catch { /* best-effort */ }
                if (!currentBlob || clearedRefs.has(slot.ref)) return
                if (latestBlobs.has(slot.ref)) {
                  currentBlob = { ...currentBlob, ...latestBlobs.get(slot.ref) }
                }
                const prev = Array.isArray(currentBlob.usage) ? JSON.stringify(currentBlob.usage) : ''
                if (prev !== JSON.stringify(list)) {
                  await saveBlob(slot.ref, { ...currentBlob, usage: list, usageAt: Date.now() })
                } else if (!currentBlob.usageAt) {
                  await saveBlob(slot.ref, { ...currentBlob, usageAt: Date.now() })
                }
              } catch { /* persistence best-effort */ }
            }
          } catch (err) {
            usageFetched.set(slot.ref, Date.now())
            const isTimeout = isTimeoutError(err)
            if (isTimeout && !refreshFailures.has(slot.ref)) {
              refreshFailures.set(slot.ref, { at: Date.now(), error: `Network timeout fetching usage: ${err.message || 'timed out'}`, isTimeout: true })
            }
          } finally {
            slotUsageLocks.delete(slot.ref)
          }
        })()

        slotUsageLocks.set(slot.ref, slotFlight)
        await slotFlight.catch(() => {})
      }
    })().finally(() => {
      providerUsageLocks.delete(provider)
    })

    providerUsageLocks.set(provider, flight)
    return flight
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
    getClockSkew,
    recordClockSkew,
    // #87: family-scoped cooldowns. families=null blocks the whole account
    // (legacy behavior); a list blocks only those model families.
    rememberCooldown(ref, until, families, models = null) {
      if (models && typeof models === 'object') {
        const prev = cooldowns.get(ref)
        cooldowns.set(ref, {
          until: prev ? prev.until : 0,
          families: prev ? prev.families : null,
          models: { ...(prev && prev.models ? prev.models : {}), ...models },
        })
        return
      }
      if (!families || !families.length) { cooldowns.set(ref, { until: Number(until) || 0, families: null }); return }
      const prev = cooldowns.get(ref)
      const merged = new Set(families)
      if (prev && Array.isArray(prev.families)) for (const f of prev.families) merged.add(f)
      cooldowns.set(ref, { until: Math.max(Number(until) || 0, prev ? prev.until : 0), families: Array.from(merged) })
    },
    rememberQuota(ref, snap) {
      if (snap) {
        const prevSnap = quotas.get(ref)
        quotas.set(ref, snap)
        if (snap.usedPercent != null) {
          const now = snap.measuredAt || Date.now()
          let samples = (quotaSamples.get(ref) || []).slice()
          const remainingPercent = snap.remainingPercent ?? (100 - Number(snap.usedPercent))
          const lastSample = samples[samples.length - 1]

          const prevReset = prevSnap?.resetAt ?? lastSample?.resetAt ?? null
          const currReset = snap.resetAt ?? null
          const resetChanged = (prevReset !== null && currReset !== null && Math.abs(Number(prevReset) - Number(currReset)) > 300) ||
                               (prevSnap !== undefined && (prevReset === null) !== (currReset === null))
          const increased = lastSample !== undefined && remainingPercent > lastSample.pct + 0.5

          if (resetChanged || increased) {
            samples = []
          }

          samples.push({ at: now, pct: remainingPercent, resetAt: currReset })
          while (samples.length > 20) samples.shift()
          quotaSamples.set(ref, samples)
          snap.samples = [...samples]
          snap.pacePerHour = calculateBurnRatePerHour(samples, now)
        }
      } else {
        quotas.delete(ref)
        quotaSamples.delete(ref)
      }
    },
    clearRefreshFailure(ref) { if (ref) refreshFailures.delete(ref) },
    clearCooldown(ref) { if (ref) cooldowns.delete(ref) },
    shouldSkipRefresh(ref, now, retryMs) { const f = refreshFailures.get(ref); if (!f) return false; return (Number(f.at) + Number(retryMs)) > Number(now) },
    getQuota(ref) { return quotas.get(ref) || null },
    rememberUsage(ref, percent) { usage.set(ref, percent) },
    getHealth(ref) { return health.get(ref) || null },
    setHealth(ref, h) { health.set(ref, h) },
    recordSwitch(ref) { health.set(ref, recordSwitch(health.get(ref))) },
    recordExhaust(ref) { health.set(ref, recordExhaust(health.get(ref))) },
    recordBroken(ref) { health.set(ref, recordBroken(health.get(ref))) },
    recordSuccess(ref) {
      if (ref) lastUsedAt.set(ref, Date.now())
      // successful request clears the cooldown and puts the account back in rotation
      cooldowns.delete(ref)
      quarantines.delete(ref)
      saveQuarantinesToFile(quarantines)
      if (health.has(ref)) health.set(ref, null)
    },
    rememberQuarantine(ref, reason, until, attempts) {
      if (!ref) return
      const existing = quarantines.get(ref)
      const finalAttempts = attempts !== undefined ? Number(attempts) : (existing?.attempts ? existing.attempts + 1 : 1)
      quarantines.set(ref, {
        reason: reason || existing?.reason || 'RATE_LIMIT',
        until: Number(until) || existing?.until || (Date.now() + 3600000),
        attempts: Number(finalAttempts) || 1,
        status: STATUS_QUARANTINE,
      })
      saveQuarantinesToFile(quarantines)
    },
    getQuarantine(ref, now = Date.now()) {
      const q = quarantines.get(ref)
      if (!q) return null
      if (Number(q.until) <= Number(now)) {
        if (q.status === STATUS_PROBING) return q
        return null
      }
      return q
    },
    async probeWarmup(ref, probeFn, force = false) {
      const q = quarantines.get(ref)
      if (!q) return { success: true }
      const acc = { quarantineReason: q.reason, quarantineUntil: q.until, quarantineAttempts: q.attempts || 1, status: q.status }
      if (!force && !needsWarmupProbe(acc)) {
        return { success: false, reason: 'NOT_EXPIRED' }
      }
      quarantines.set(ref, enterProbing(acc))
      saveQuarantinesToFile(quarantines)
      try {
        if (typeof probeFn === 'function') {
          await probeFn(ref)
        }
        resolveWarmupSuccess(acc)
        quarantines.delete(ref)
        saveQuarantinesToFile(quarantines)
        return { success: true }
      } catch (err) {
        const updated = resolveWarmupFailure(acc, err?.message || q.reason)
        quarantines.set(ref, {
          reason: updated.quarantineReason,
          until: updated.quarantineUntil,
          attempts: updated.quarantineAttempts,
          status: updated.status,
        })
        saveQuarantinesToFile(quarantines)
        return { success: false, account: updated, error: err }
      }
    },
    releaseQuarantine(ref) {
      quarantines.delete(ref)
      saveQuarantinesToFile(quarantines)
    },
    rememberRequest(ref) {
      requestCounts.set(ref, (requestCounts.get(ref) || 0) + 1)
      if (ref) lastUsedAt.set(ref, Date.now())
    },
    getRequestCount(ref) { return requestCounts.get(ref) || 0 },
    rememberPing(ref, { latencyMs, latencyGrade }) { pings.set(ref, { latencyMs, latencyGrade, at: Date.now() }) },
    getPing(ref) { return pings.get(ref) || null },
    rememberDoctorVerdict(ref, verdict) { if (verdict) doctorVerdicts.set(ref, { ...verdict, at: Date.now() }); else doctorVerdicts.delete(ref); },
    getDoctorVerdict(ref) { return doctorVerdicts.get(ref) || null },
    rememberDynamicModels(ref, models) { if (Array.isArray(models)) dynamicModels.set(ref, { models, at: Date.now() }) },
    getDynamicModels(ref) { return dynamicModels.get(ref)?.models || null },
  }
}