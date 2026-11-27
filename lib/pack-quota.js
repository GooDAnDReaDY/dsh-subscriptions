import { creditsAvailable, deepestUsedPercent, asUsageSnapshot, usageWindows, grokBillingPercent } from './usage.js'
import { readJson } from './wire.js'
import { fetchWithTimeout } from './http.js'
import { ignoreError } from './catch-log.js'

/**
 * #1128: a pack could describe endpoints and models but not where its quota
 * comes from — so every vendor with a quota implemented the same pipeline by
 * hand, and a wrong assumption about someone's response shape shipped as a
 * release instead of failing a test. This declares that pipeline as data.
 *
 * The contract is deliberately small: where to read, how to read it, what the
 * numbers mean. Everything the four availability gates need is computed from it.
 */

/** Extractors a pack may name. Each takes the parsed response body. */
const EXTRACTORS = {
  // The common case: walk the body and take the deepest used percentage.
  deepest: (json) => asUsageSnapshot(deepestUsedPercent(json)),
  // A billing document with used/limit credits rather than windows.
  billing: (json) => asUsageSnapshot(grokBillingPercent(json)),
  // An explicit field, e.g. copilot's `used_percent` at the top level.
  field: null,
}

const DEFAULT_PATH = ''
const ALLOWED_METHODS = new Set(['GET', 'POST'])

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== ''
}

/**
 * Validates the quota block of a pack. Returns a normalized declaration or
 * throws with the reason, so `provider-packs/validate` can answer before the
 * pack is saved.
 */
export function normalizeQuotaDeclaration(raw, packId = '?') {
  if (raw == null) return null
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`providerPacks[${packId}]: quota must be an object`)
  }
  const where = `providerPacks[${packId}].quota`

  const path = raw.path == null ? DEFAULT_PATH : raw.path
  if (typeof path !== 'string') throw new Error(`${where}.path must be a string`)
  // A pack declares a path on its own baseUrl; it must not be able to point the
  // credential at another host.
  if (/^[a-z]+:\/\//i.test(path)) throw new Error(`${where}.path must be relative to the pack baseUrl`)
  if (path.startsWith('//')) throw new Error(`${where}.path must not be protocol-relative`)

  const method = String(raw.method || 'GET').toUpperCase()
  if (!ALLOWED_METHODS.has(method)) throw new Error(`${where}.method must be GET or POST`)

  const extractor = raw.extract == null ? 'deepest' : String(raw.extract)
  if (!(extractor in EXTRACTORS)) {
    throw new Error(`${where}.extract must be one of: ${Object.keys(EXTRACTORS).join(', ')}`)
  }
  if (extractor === 'field' && !nonEmptyString(raw.field)) {
    throw new Error(`${where}.field is required when extract is "field"`)
  }

  // Semantics, not just the number: a spent window with purchased balance left is
  // usable. Naming it per pack keeps that decision next to the shape it describes.
  const credits = raw.credits == null
    ? 'auto'
    : String(raw.credits)
  if (!['auto', 'none', 'bool'].includes(credits)) {
    throw new Error(`${where}.credits must be auto|none|bool`)
  }

  const resetField = raw.resetField == null ? '' : String(raw.resetField)
  const timeoutMs = raw.timeoutMs == null ? 0 : Number(raw.timeoutMs)
  if (raw.timeoutMs != null && (!Number.isFinite(timeoutMs) || timeoutMs < 0)) {
    throw new Error(`${where}.timeoutMs must be a non-negative number`)
  }

  return {
    path,
    method,
    extract: extractor,
    field: raw.field == null ? '' : String(raw.field),
    credits,
    resetField,
    timeoutMs,
  }
}

function pickField(json, dotted) {
  let node = json
  for (const part of String(dotted).split('.')) {
    if (!node || typeof node !== 'object') return null
    node = node[part]
  }
  return node
}

/**
 * Builds the `usage()` a pack-backed vendor exposes. Kept here rather than in
 * the factory so the same implementation serves declarative packs, custom
 * vendors and any future protocol.
 */
export function createQuotaReader(declaration, { baseUrl, headers }) {
  if (!declaration) return null
  const base = String(baseUrl || '').replace(/\/$/, '')

  return async function usage(blob, _cfg, fetchImpl) {
    const url = base + declaration.path
    try {
      const res = await fetchWithTimeout(fetchImpl || fetch, url, {
        method: declaration.method,
        headers: {
          ...(headers ? headers(blob) : { Authorization: `Bearer ${blob && blob.accessToken}` }),
          Accept: 'application/json',
        },
      }, declaration.timeoutMs ? { timeoutMs: declaration.timeoutMs } : {})
      if (!res || !res.ok) return null
      const json = await readJson(res)

      let snap
      if (declaration.extract === 'field') {
        const raw = pickField(json, declaration.field)
        snap = asUsageSnapshot(Number.isFinite(Number(raw)) ? Number(raw) : null)
      } else {
        snap = EXTRACTORS[declaration.extract](json)
      }
      if (!snap) return null
      snap.windows = usageWindows(json)

      if (declaration.credits === 'auto') snap.creditsAvailable = creditsAvailable(json)
      else if (declaration.credits === 'bool') {
        const value = declaration.field ? pickField(json, declaration.field) : null
        snap.creditsAvailable = value === true
      } else snap.creditsAvailable = false

      if (declaration.resetField) snap.resetAt = pickField(json, declaration.resetField) || null
      return snap
    } catch (err) {
      ignoreError('vendor-pack: quota read failed', err)
      return null
    }
  }
}
