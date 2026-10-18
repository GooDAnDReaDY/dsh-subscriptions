// Subscription Value Delivered & API Cost Equivalent Counter (#561)
// Translates raw prompt, completion and cache tokens into equivalent official API pricing,
// comparing delivered value against monthly subscription fee ($20/mo standard).

export const DEFAULT_SUBSCRIPTION_MONTHLY_COST = 20.0

export const TOKEN_RATES = {
  'claude-3-7-sonnet': { prompt: 3.0, completion: 15.0, cacheRead: 0.3 },
  'claude-3-5-sonnet': { prompt: 3.0, completion: 15.0, cacheRead: 0.3 },
  'claude-3-5-haiku': { prompt: 0.8, completion: 4.0, cacheRead: 0.08 },
  'claude-3-opus': { prompt: 15.0, completion: 75.0, cacheRead: 1.5 },
  'gpt-4o': { prompt: 2.5, completion: 10.0, cacheRead: 1.25 },
  'gpt-4o-mini': { prompt: 0.15, completion: 0.6, cacheRead: 0.075 },
  'o1': { prompt: 15.0, completion: 60.0, cacheRead: 7.5 },
  'o3-mini': { prompt: 1.1, completion: 4.4, cacheRead: 0.55 },
  'grok-2': { prompt: 2.0, completion: 10.0, cacheRead: 0.2 },
  'sonar-reasoning': { prompt: 5.0, completion: 25.0, cacheRead: 0.5 },
  'sonar-pro': { prompt: 3.0, completion: 15.0, cacheRead: 0.3 },
  'sonar': { prompt: 1.0, completion: 5.0, cacheRead: 0.1 },
  'gemini-1.5-pro': { prompt: 1.25, completion: 5.0, cacheRead: 0.3 },
  'gemini-2.0-flash': { prompt: 0.1, completion: 0.4, cacheRead: 0.025 },
  'default': { prompt: 2.5, completion: 10.0, cacheRead: 0.5 },
}

/**
 * Resolves standard token rates per 1M tokens for a given model identifier.
 * @param {string} [modelId]
 * @returns {{ prompt: number, completion: number, cacheRead: number }}
 */
export function lookupTokenRate(modelId = '') {
  const m = String(modelId || '').toLowerCase()
  for (const [key, rates] of Object.entries(TOKEN_RATES)) {
    if (key !== 'default' && m.includes(key)) {
      return rates
    }
  }
  return TOKEN_RATES.default
}

/**
 * Calculates dollar cost equivalent for the given token quantities.
 * @param {number} promptTokens
 * @param {number} completionTokens
 * @param {number} [cacheReadTokens]
 * @param {string} [modelId]
 * @returns {number}
 */
export function calculateEquivalentCost(promptTokens = 0, completionTokens = 0, cacheReadTokens = 0, modelId = 'default') {
  const rates = lookupTokenRate(modelId)
  const p = (Number(promptTokens) || 0) * (rates.prompt / 1_000_000)
  const c = (Number(completionTokens) || 0) * (rates.completion / 1_000_000)
  const cr = (Number(cacheReadTokens) || 0) * (rates.cacheRead / 1_000_000)
  return Math.round((p + c + cr) * 100) / 100
}

/**
 * Computes value delivered metrics and ROI ratio for an account.
 * @param {object} params
 * @param {number} [params.promptTokens]
 * @param {number} [params.completionTokens]
 * @param {number} [params.cacheReadTokens]
 * @param {string} [params.modelId]
 * @param {number} [params.subscriptionCost]
 * @returns {object}
 */
export function calculateValueDelivered({
  promptTokens = 0,
  completionTokens = 0,
  cacheReadTokens = 0,
  modelId = 'default',
  subscriptionCost = DEFAULT_SUBSCRIPTION_MONTHLY_COST,
} = {}) {
  const equivalentCost = calculateEquivalentCost(promptTokens, completionTokens, cacheReadTokens, modelId)
  const subCost = Number(subscriptionCost) > 0 ? Number(subscriptionCost) : DEFAULT_SUBSCRIPTION_MONTHLY_COST
  const roiMultiplier = Math.round((equivalentCost / subCost) * 10) / 10
  const roiLabel = `${roiMultiplier}x`

  return {
    equivalentCost,
    formattedCost: `$${equivalentCost.toFixed(2)}`,
    subscriptionCost: subCost,
    formattedSubscriptionCost: `$${subCost.toFixed(2)}`,
    roiMultiplier,
    roiLabel,
    promptTokens: Number(promptTokens) || 0,
    completionTokens: Number(completionTokens) || 0,
    cacheReadTokens: Number(cacheReadTokens) || 0,
  }
}
