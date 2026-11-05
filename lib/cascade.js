// #349: Cascading Cross-Vendor Fallback Engine
// When a primary vendor's accounts are all exhausted (or return 429/503),
// route seamlessly to a compatible alternative vendor.

import { getVendor } from './vendors/index.js'

export const DEFAULT_CASCADE_CHAINS = {
  claude: ['copilot', 'cursor', 'antigravity'],
  codex: ['copilot', 'cursor'],
  grok: ['copilot', 'antigravity'],
  copilot: ['cursor', 'codex'],
  cursor: ['copilot', 'claude'],
  antigravity: ['copilot', 'claude'],
  kimi: ['qwen', 'glm', 'spark'],
  glm: ['kimi', 'qwen', 'spark'],
  qwen: ['kimi', 'glm', 'spark'],
  spark: ['qwen', 'kimi', 'glm'],
  jetbrains: ['copilot', 'cursor'],
  perplexity: ['copilot', 'cursor'],
  replit: ['copilot', 'cursor'],
  cody: ['copilot', 'cursor'],
  kiro: ['copilot', 'cursor'],
  ernie: ['qwen', 'glm'],
}

/**
 * Resolves the next candidate fallback provider from the cascade chain.
 * @param {string} currentProvider - currently failing provider
 * @param {Set<string>|Array<string>} availableProviders - providers that currently have logged-in accounts
 * @param {Record<string, string[]>} [customChains] - user-configured custom chains
 * @param {Set<string>} [visited] - set of already attempted providers in this request cascade
 * @returns {string|null} - the next candidate provider or null if none available
 */
/**
 * Resolves the next candidate fallback provider from the cascade chain.
 * @param {string} currentProvider - currently failing provider
 * @param {Set<string>|Array<string>} availableProviders - providers that currently have logged-in accounts
 * @param {Record<string, string[]>} [customChains] - user-configured custom chains
 * @param {Set<string>} [visited] - set of already attempted providers in this request cascade
 * @param {string[]} [globalOrder] - configured global fallback priority sequence
 * @returns {string|null} - the next candidate provider or null if none available
 */
export function resolveFallbackVendor(currentProvider, availableProviders, customChains = {}, visited = new Set(), globalOrder = []) {
  const availSet = new Set(availableProviders || [])
  const custom = customChains && customChains[currentProvider]
  if (Array.isArray(custom) && custom.length > 0) {
    for (const candidate of custom) {
      if (candidate !== currentProvider && !visited.has(candidate) && availSet.has(candidate)) {
        return candidate
      }
    }
  }

  if (Array.isArray(globalOrder) && globalOrder.length > 0) {
    for (const candidate of globalOrder) {
      if (candidate !== currentProvider && !visited.has(candidate) && availSet.has(candidate)) {
        return candidate
      }
    }
  }

  const chain = DEFAULT_CASCADE_CHAINS[currentProvider] || []
  for (const candidate of chain) {
    if (candidate !== currentProvider && !visited.has(candidate) && availSet.has(candidate)) {
      return candidate
    }
  }
  return null
}

/**
 * Maps a model identifier across vendors if needed.
 * @param {string} sourceProvider
 * @param {string} sourceModel
 * @param {string} targetProvider
 * @returns {string} target model name
 */
export function mapFallbackModel(sourceProvider, sourceModel, targetProvider) {
  const model = String(sourceModel || '').toLowerCase()
  const wantsClaude = model.includes('claude')
  const wantsGpt = model.includes('gpt') || model.includes('o1') || model.includes('o3')
  // #966: known cross-vendor families keep a sensible target model instead of
  // sending the source id (which produces 400/404 and hides the original error).
  if (wantsClaude) {
    if (targetProvider === 'copilot' || targetProvider === 'cursor') return 'claude-3-5-sonnet'
    if (targetProvider === 'codex') return 'gpt-4o'
    return targetDefaultModel(targetProvider) || sourceModel
  }
  if (wantsGpt && targetProvider === 'claude') {
    return 'claude-3-5-sonnet'
  }
  return sourceModel
}

function targetDefaultModel(targetProvider) {
  try {
    const defaults = getVendor(targetProvider).defaults()
    return (defaults && defaults.models || []).map((entry) => (
      typeof entry === 'string' ? entry : (entry && (entry.id || entry.name))
    )).find(Boolean) || null
  } catch { return null }
}
