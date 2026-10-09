import { PROVIDERS, displayName } from './refs.js'

export function isDeprecatedId(id) {
  return /(^|[-_:])(test|preview|dev|alpha|beta|snapshot|experimental|legacy|deprecated)([-_:]|$)/i.test(String(id || ''))
}
import { getVendor } from './vendors/index.js'
import { getAccountRemainingPercent } from './rotate.js'

export const CAPABILITY_TAGS = {
  VISION: 'vision',
  TOOLS: 'tools',
  REASONING: 'reasoning',
  CODING: 'coding',
  FAST: 'fast',
  MATH: 'math',
}

/**
 * Infer context window and capability tags for a given provider and model.
 * @param {string} provider
 * @param {string} modelId
 * @returns {{ contextWindow: number, contextLabel: string, capabilities: string[] }}
 */
export function inferModelCapabilities(provider, modelId) {
  const id = String(modelId || '').toLowerCase()
  const p = String(provider || '').toLowerCase()
  const caps = new Set([CAPABILITY_TAGS.TOOLS])
  let contextWindow = 128000
  let contextLabel = '128k'

  // Vision detection
  if (
    id.includes('vision') ||
    id.includes('gpt-4o') ||
    id.includes('gpt-5') ||
    id.includes('gpt-6') ||
    id.includes('claude') ||
    id.includes('gemini') ||
    id.includes('grok-2') ||
    id.includes('grok-3')
  ) {
    caps.add(CAPABILITY_TAGS.VISION)
  }

  // Reasoning detection
  if (
    id.includes('thinking') ||
    id.includes('reasoning') ||
    id.includes('o1') ||
    id.includes('o3') ||
    id.includes('gpt-5') ||
    id.includes('gpt-6') ||
    id.includes('claude-opus') ||
    id.includes('claude-sonnet-5') ||
    id.includes('claude-fable') ||
    id.includes('claude-3-7') ||
    id.includes('k1.5') ||
    id.includes('r1')
  ) {
    caps.add(CAPABILITY_TAGS.REASONING)
  }

  // Coding detection
  if (
    id.includes('codex') ||
    id.includes('coder') ||
    id.includes('coding') ||
    id.includes('sonnet') ||
    id.includes('gpt-5') ||
    id.includes('gpt-6') ||
    id.includes('sol') ||
    id.includes('terra') ||
    id.includes('luna') ||
    p === 'codex' ||
    p === 'copilot' ||
    p === 'cursor'
  ) {
    caps.add(CAPABILITY_TAGS.CODING)
  }

  // Fast / Speed detection
  if (id.includes('flash') || id.includes('mini') || id.includes('haiku') || id.includes('small') || id.includes('fast')) {
    caps.add(CAPABILITY_TAGS.FAST)
  }

  // Context window mapping
  if (p === 'antigravity' && (id.includes('gemini-2.5') || id.includes('gemini-3'))) {
    contextWindow = id.includes('pro') ? 2000000 : 1000000
    contextLabel = id.includes('pro') ? '2M' : '1M'
  } else if (id.includes('grok-3') || id.includes('1m')) {
    contextWindow = 1000000
    contextLabel = '1M'
  } else if (
    id.includes('claude-') ||
    id.includes('o1') ||
    id.includes('o3') ||
    id.includes('gpt-5') ||
    id.includes('gpt-6') ||
    id.includes('kimi') ||
    id.includes('200k')
  ) {
    contextWindow = 200000
    contextLabel = '200k'
  }

  return {
    contextWindow,
    contextLabel,
    capabilities: Array.from(caps),
  }
}

/**
 * Calculates pool-wide status and quota for a provider from the account list.
 * @param {string} provider
 * @param {Array<object>} accounts
 * @param {number} [nowMs]
 * @returns {object}
 */
export function calculatePoolStatus(provider, accounts = [], nowMs = Date.now()) {
  const p = String(provider || '').toLowerCase()
  const matching = (accounts || []).filter((a) => a && String(a.provider).toLowerCase() === p)

  if (!matching.length) {
    return {
      status: 'unconfigured',
      totalAccounts: 0,
      healthyAccounts: 0,
      quarantinedAccounts: 0,
      cooldownAccounts: 0,
      remainingPercent: null,
      resetAt: null,
    }
  }

  let healthyCount = 0
  let quarantinedCount = 0
  let cooldownCount = 0
  let maxRemainingPercent = null
  let nearestResetAt = null

  for (const acc of matching) {
    const isQuarantined = Boolean(acc.quarantineUntil && Number(acc.quarantineUntil) > nowMs)
    const isCooldown = Boolean(acc.cooldownUntil && Number(acc.cooldownUntil) > nowMs)
    const rem = getAccountRemainingPercent(acc)
    const isExhausted = (rem !== null && rem <= 0) || (acc.usagePercent != null && Number(acc.usagePercent) >= 100)
    const hasToken = Boolean(acc.configured && acc.writable !== false)

    if (isQuarantined) quarantinedCount++
    if (isCooldown) cooldownCount++

    if (hasToken && !isQuarantined && !isCooldown && !isExhausted) {
      healthyCount++
      if (rem !== null) {
        maxRemainingPercent = maxRemainingPercent === null ? rem : Math.max(maxRemainingPercent, rem)
      }
    }

    const resetAt = acc.quota?.resetAt ? Number(acc.quota.resetAt) : null
    if (resetAt && resetAt > nowMs) {
      if (!nearestResetAt || resetAt < nearestResetAt) {
        nearestResetAt = resetAt
      }
    }
  }

  let status = 'available'
  if (healthyCount === 0) {
    if (quarantinedCount === matching.length) {
      status = 'quarantined'
    } else if (cooldownCount === matching.length) {
      status = 'cooldown'
    } else {
      status = 'exhausted'
    }
  } else if (healthyCount < matching.length) {
    status = 'degraded'
  }

  return {
    status,
    totalAccounts: matching.length,
    healthyAccounts: healthyCount,
    quarantinedAccounts: quarantinedCount,
    cooldownAccounts: cooldownCount,
    remainingPercent: maxRemainingPercent !== null ? Math.round(maxRemainingPercent) : null,
    resetAt: nearestResetAt,
  }
}

/**
 * Builds the enriched model catalog across all supported subscription vendors.
 * @param {object} options
 * @param {Array<object>} options.accounts
 * @param {object} [options.liveConfig]
 * @param {boolean} [options.hideDeprecated]
 * @param {number} [options.nowMs]
 * @returns {Array<object>}
 */
export function buildEnrichedCatalog({
  accounts = [],
  liveConfig = {},
  hideDeprecated = false,
  nowMs = Date.now(),
} = {}) {
  const result = []

  for (const provId of PROVIDERS) {
    const vendor = getVendor(provId)
    const pool = calculatePoolStatus(provId, accounts, nowMs)
    const modelsKey = `${provId}Models`
    let rawList = liveConfig && Array.isArray(liveConfig[modelsKey]) && liveConfig[modelsKey].length
      ? liveConfig[modelsKey]
      : (vendor.defaults ? vendor.defaults().models : [])

    if (!Array.isArray(rawList)) rawList = []

    for (const item of rawList) {
      const modelId = typeof item === 'string' ? item : (item.id || item.slug || item.name)
      if (!modelId) continue
      if (hideDeprecated && isDeprecatedId(modelId)) continue

      const modelName = (typeof item === 'object' && (item.name || item.display_name)) ? (item.name || item.display_name) : modelId
      const caps = inferModelCapabilities(provId, modelId)

      result.push({
        id: modelId,
        name: modelName,
        provider: provId,
        providerName: displayName(provId),
        contextWindow: caps.contextWindow,
        contextLabel: caps.contextLabel,
        capabilities: caps.capabilities,
        pool,
      })
    }
  }

  return result
}
