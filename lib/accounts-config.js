import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { oauthRef, isProvider } from './refs.js'
import { getVendor } from './vendors/index.js'
import { versionForProvider } from './client-version-service.js'

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

export function saveQuarantinesToFile(map) {
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

export const sharedQuarantines = new Map()
loadQuarantinesFromFile(sharedQuarantines)

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
