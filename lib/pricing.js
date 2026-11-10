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
  'qwen': { prompt: 0.8, completion: 2.0, cacheRead: 0.2 },
  'kimi': { prompt: 1.0, completion: 3.0, cacheRead: 0.2 },
  'moonshot': { prompt: 1.0, completion: 3.0, cacheRead: 0.2 },
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
  subscriptionCost,
} = {}) {
  const equivalentCost = calculateEquivalentCost(promptTokens, completionTokens, cacheReadTokens, modelId)
  // #932: an explicit 0 means "no subscription cost", not "unknown". Only a
  // missing or invalid value falls back to the standard fee.
  const known = subscriptionCost !== undefined && subscriptionCost !== null && subscriptionCost !== ''
  const numeric = known ? Number(subscriptionCost) : NaN
  const subCost = Number.isFinite(numeric) && numeric >= 0 ? numeric : DEFAULT_SUBSCRIPTION_MONTHLY_COST
  const hasCostBasis = subCost > 0
  const roiMultiplier = hasCostBasis ? Math.round((equivalentCost / subCost) * 10) / 10 : null
  const roiLabel = hasCostBasis ? `${roiMultiplier}x` : 'n/a'

  return {
    equivalentCost,
    formattedCost: `$${equivalentCost.toFixed(2)}`,
    subscriptionCost: subCost,
    subscriptionCostKnown: known && Number.isFinite(numeric),
    formattedSubscriptionCost: `$${subCost.toFixed(2)}`,
    roiMultiplier,
    roiLabel,
    promptTokens: Number(promptTokens) || 0,
    completionTokens: Number(completionTokens) || 0,
    cacheReadTokens: Number(cacheReadTokens) || 0,
  }
}

/**
 * Calculates aggregated dollar savings, cache savings, and ROI across timeframes (#1029).
 * @param {Array<object>} [historyRows]
 * @param {Array<object>} [slots]
 * @param {object} [options]
 * @param {number} [options.nowMs]
 * @returns {object}
 */
export function calculateSavingsReport(historyRows = [], slots = [], { nowMs = Date.now() } = {}) {
  const ONE_DAY = 24 * 3600 * 1000
  const cutoffs = {
    '24h': nowMs - ONE_DAY,
    '7d': nowMs - 7 * ONE_DAY,
    '30d': nowMs - 30 * ONE_DAY,
    'all': 0,
  }

  const activeSlots = (slots || []).filter((s) => s && s.provider)
  const totalSubCost = activeSlots.length > 0
    ? activeSlots.reduce((acc, s) => acc + (typeof s.monthlyCost === 'number' && s.monthlyCost >= 0 ? s.monthlyCost : DEFAULT_SUBSCRIPTION_MONTHLY_COST), 0)
    : DEFAULT_SUBSCRIPTION_MONTHLY_COST

  function summarizeRows(rows) {
    let promptTokens = 0
    let completionTokens = 0
    let cacheReadTokens = 0
    let equivalentCost = 0
    let cacheSavingsCost = 0
    let requests = 0

    for (const r of rows) {
      if (!r) continue
      const p = Number(r.inputTokens || (r.tokens && r.tokens.prompt) || 0)
      const c = Number(r.outputTokens || (r.tokens && r.tokens.completion) || 0)
      const cr = Number(r.cacheReadTokens || (r.tokens && r.tokens.cacheRead) || 0)
      const model = r.model || 'default'

      promptTokens += p
      completionTokens += c
      cacheReadTokens += cr
      requests++

      const rates = lookupTokenRate(model)
      const rowCost = (p * rates.prompt + c * rates.completion + cr * rates.cacheRead) / 1_000_000
      equivalentCost += rowCost

      if (cr > 0) {
        const discountPerToken = Math.max(0, rates.prompt - rates.cacheRead) / 1_000_000
        cacheSavingsCost += cr * discountPerToken
      }
    }

    const netSavings = Math.max(0, equivalentCost - totalSubCost)
    const roiMultiplier = totalSubCost > 0 ? Math.round((equivalentCost / totalSubCost) * 10) / 10 : null

    return {
      requests,
      promptTokens,
      completionTokens,
      cacheReadTokens,
      equivalentCost: Math.round(equivalentCost * 100) / 100,
      cacheSavingsCost: Math.round(cacheSavingsCost * 100) / 100,
      subscriptionCost: Math.round(totalSubCost * 100) / 100,
      netSavings: Math.round(netSavings * 100) / 100,
      roiMultiplier,
      roiLabel: roiMultiplier !== null ? `${roiMultiplier}x` : 'n/a',
    }
  }

  const timeframes = {}
  for (const [key, cutoff] of Object.entries(cutoffs)) {
    const filtered = (historyRows || []).filter((r) => r && (!r.ts || r.ts >= cutoff))
    timeframes[key] = summarizeRows(filtered)
  }

  const byProvider = {}
  const byAccount = {}

  for (const r of (historyRows || [])) {
    if (!r) continue
    const prov = r.provider || 'unknown'
    const ref = r.ref || r.accountRef || prov

    if (!byProvider[prov]) byProvider[prov] = []
    byProvider[prov].push(r)

    if (!byAccount[ref]) byAccount[ref] = { provider: prov, rows: [] }
    byAccount[ref].rows.push(r)
  }

  const byProviderSummary = {}
  for (const [prov, rows] of Object.entries(byProvider)) {
    byProviderSummary[prov] = summarizeRows(rows)
  }

  const byAccountSummary = {}
  for (const [ref, item] of Object.entries(byAccount)) {
    byAccountSummary[ref] = {
      provider: item.provider,
      ...summarizeRows(item.rows),
    }
  }

  return {
    ...timeframes['30d'],
    timeframes,
    byProvider: byProviderSummary,
    byAccount: byAccountSummary,
    activeSlotCount: activeSlots.length,
  }
}
