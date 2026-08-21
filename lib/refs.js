export const PROVIDERS = Object.freeze([
  'codex',
  'claude',
  'grok',
  'antigravity',
])

const KNOWN = new Set(PROVIDERS)

const DISPLAY = {
  codex: 'ChatGPT Codex',
  claude: 'Claude',
  grok: 'Grok',
  antigravity: 'Antigravity',
}

export function isProvider(value) {
  return KNOWN.has(value)
}

export function displayName(provider) {
  return DISPLAY[provider] || provider
}

export function oauthRef(provider, index) {
  if (!KNOWN.has(provider)) throw new Error(`unknown provider: ${provider}`)
  const n = Number(index)
  if (!Number.isInteger(n) || n < 1) throw new Error('account index must be an integer >= 1')
  return `${provider.toUpperCase()}_OAUTH_${n}`
}

export function parseOauthRef(ref) {
  if (typeof ref !== 'string') return null
  const match = /^(CODEX|CLAUDE|GROK|ANTIGRAVITY)_OAUTH_([1-9][0-9]*)$/.exec(ref)
  if (!match) return null
  return { provider: match[1].toLowerCase(), index: Number(match[2]) }
}

export function droppedCredentialRefs(previousSlots, nextSlots) {
  const keep = new Set()
  for (const slot of nextSlots || []) {
    if (!isProvider(slot.provider)) continue
    const index = Number(slot.index)
    if (!Number.isInteger(index) || index < 1) continue
    keep.add(oauthRef(slot.provider, index))
  }
  const out = []
  const seen = new Set()
  for (const slot of previousSlots || []) {
    if (!isProvider(slot.provider)) continue
    const index = Number(slot.index)
    if (!Number.isInteger(index) || index < 1) continue
    const ref = oauthRef(slot.provider, index)
    if (seen.has(ref) || keep.has(ref)) continue
    seen.add(ref)
    out.push(ref)
  }
  return out
}
