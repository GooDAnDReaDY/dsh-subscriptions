export {
  BUILTIN_PROVIDERS,
  PROVIDERS,
  registerCustomProviderIds,
  listProviders,
  registerDisplayName,
  displayName,
  isProvider,
} from './providers.js'

/**
 * @param {string} provider
 * @param {number} index
 * @returns {string} provider-scoped credential ref, e.g. CODEX_OAUTH_1
 */
export function oauthRef(provider, index) {
  const n = Number(index)
  if (!Number.isInteger(n) || n < 1) throw new Error('account index must be an integer >= 1')
  return `${String(provider).toUpperCase()}_OAUTH_${n}`
}

export function parseOauthRef(ref) {
  if (typeof ref !== 'string') return null
  const match = /^([A-Z][A-Z0-9_]*)_OAUTH_([1-9][0-9]*)$/.exec(ref)
  if (!match) return null
  return { provider: match[1].toLowerCase(), index: Number(match[2]) }
}

export function droppedCredentialRefs(previousSlots, nextSlots) {
  const keep = new Set()
  for (const slot of nextSlots || []) {
    if (!slot || !slot.provider) continue
    const index = Number(slot.index)
    if (!Number.isInteger(index) || index < 1) continue
    keep.add(oauthRef(slot.provider, index))
  }
  const out = []
  const seen = new Set()
  for (const slot of previousSlots || []) {
    if (!slot || !slot.provider) continue
    const index = Number(slot.index)
    if (!Number.isInteger(index) || index < 1) continue
    const ref = oauthRef(slot.provider, index)
    if (seen.has(ref) || keep.has(ref)) continue
    seen.add(ref)
    out.push(ref)
  }
  return out
}
