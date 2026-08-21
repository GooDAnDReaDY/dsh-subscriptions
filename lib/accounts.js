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
    models: Array.isArray(cfg && cfg[modelsKey]) && cfg[modelsKey].length
      ? cfg[modelsKey]
      : (d.models || []),
  }
}

export function createAccountStore({ credentials, getConfig, fetchImpl }) {
  const cooldowns = new Map()
  const usage = new Map()
  const usageFetched = new Map()
  const doFetch = fetchImpl || fetch

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
        if (blob.validationUrl) base.validationUrl = blob.validationUrl
        if (blob.validationMessage) base.validationMessage = blob.validationMessage
        if (blob.accountNotice) base.accountNotice = blob.accountNotice
        if (blob.paidTierName) base.paidTierName = blob.paidTierName
      } catch { /* ignore parse */ }
    }
    return {
      ...base,
      cooldownUntil: cooldowns.get(ref) || 0,
      usagePercent: usage.has(ref) ? usage.get(ref) : null,
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
    const cfg = vendorConfig(provider, getConfig())
    const next = await getVendor(provider).refresh(cfg, blob, doFetch)
    const merged = {
      ...blob,
      ...next,
      refreshToken: next.refreshToken || blob.refreshToken,
      projectId: next.projectId || blob.projectId,
      accountId: next.accountId || blob.accountId,
    }
    if (ref) await saveBlob(ref, merged)
    return merged
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
        const snap = await vendor.usage(blob, cfg, doFetch)
        usageFetched.set(slot.ref, Date.now())
        if (snap && Number.isFinite(Number(snap.usedPercent))) {
          usage.set(slot.ref, Number(snap.usedPercent))
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
    rememberUsage(ref, percent) { usage.set(ref, percent) },
  }
}