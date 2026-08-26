// Встроенные провайдеры. Кастомные из Config добавляются динамически через
// registerCustomProviderIds и попадают в тот же список.
export const BUILTIN_PROVIDERS = Object.freeze([
  'codex',
  'claude',
  'grok',
  'antigravity',
])

const dynamic = new Set()

export function registerCustomProviderIds(ids) {
  for (const id of ids || []) {
    if (typeof id === 'string' && /^[a-z][a-z0-9_]*$/.test(id)) dynamic.add(id)
  }
}

export function listProviders() {
  return [...BUILTIN_PROVIDERS, ...dynamic]
}

// Обратно-совместимый доступ: массив читается на момент вызова.
export const PROVIDERS = new Proxy([], {
  get(_t, prop) {
    if (prop === 'length') return listProviders().length
    if (prop === Symbol.iterator) return listProviders()[Symbol.iterator]
    const i = Number(prop)
    return Number.isInteger(i) ? listProviders()[i] : undefined
  },
  has() { return true },
})

const DISPLAY_EXTRA = {}

export function registerDisplayName(id, name) {
  if (id && name) DISPLAY_EXTRA[id] = name
}

const KNOWN_CACHE = new Map()

export function isProvider(value) {
  if (KNOWN_CACHE.has(value)) return KNOWN_CACHE.get(value)
  let result
  try {
    const { isProvider: check } = require('./vendors/index.js')
    result = Boolean(check(value))
  } catch {
    // require недоступен в этом контексте — используем списки
    result = BUILTIN_PROVIDERS.includes(value) || dynamic.has(value)
  }
  KNOWN_CACHE.set(value, result)
  return result
}

const DISPLAY = {
  codex: 'ChatGPT Codex',
  claude: 'Claude',
  grok: 'Grok',
  antigravity: 'Antigravity',
}

export function displayName(provider) {
  return DISPLAY[provider] || DISPLAY_EXTRA[provider] || provider
}

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
