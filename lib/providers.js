export const BUILTIN_PROVIDERS = Object.freeze([
  'codex',
  'claude',
  'grok',
  'antigravity',
  'kimi',
  'glm',
  'cursor',
  'kiro',
  'copilot',
  'qwen',
  'ernie',
  'spark',
  'jetbrains',
  'perplexity',
  'replit',
  'cody',
])

const DISPLAY = {
  codex: 'ChatGPT Codex',
  claude: 'Claude',
  grok: 'Grok',
  antigravity: 'Antigravity',
  kimi: 'Moonshot Kimi',
  glm: 'Zhipu GLM',
  cursor: 'Cursor',
  kiro: 'AWS Kiro',
  copilot: 'GitHub Copilot',
  perplexity: 'Perplexity Pro',
  jetbrains: 'JetBrains AI',
}

const dynamicIds = new Set()
const displayExtra = {}

export let PROVIDERS = [...BUILTIN_PROVIDERS]

export function registerCustomProviderIds(ids) {
  let changed = false
  for (const id of ids || []) {
    if (typeof id === 'string' && /^[a-z][a-z0-9_]*$/.test(id) && !dynamicIds.has(id)) {
      dynamicIds.add(id)
      changed = true
    }
  }
  if (changed) PROVIDERS = listProviders()
}

export function listProviders() {
  return [...BUILTIN_PROVIDERS, ...dynamicIds]
}

export function registerDisplayName(id, name) {
  if (id && name) displayExtra[id] = name
}

export function isProvider(value) {
  return BUILTIN_PROVIDERS.includes(value) || dynamicIds.has(value)
}

export function displayName(provider) {
  return DISPLAY[provider] || displayExtra[provider] || provider
}
