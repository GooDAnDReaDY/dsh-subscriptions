// Subscription Capability Matrix & Context Limit Inspector (#556)
// Determines per-account tier capabilities (context window, thinking mode, vision, tools)
// and dynamically adapts outgoing requests to prevent HTTP 400 Bad Request rejections.

export const PROVIDER_CAPABILITIES = {
  codex: {
    contextWindow: 128000,
    contextLabel: '128K',
    thinking: true,
    thinkingType: 'low_med_high',
    vision: true,
    tools: true,
    maxOutputTokens: 16384,
  },
  claude: {
    contextWindow: 200000,
    contextLabel: '200K',
    thinking: true,
    thinkingType: 'budget',
    vision: true,
    tools: true,
    maxOutputTokens: 8192,
  },
  grok: {
    contextWindow: 128000,
    contextLabel: '128K',
    thinking: true,
    thinkingType: 'low_med_high',
    vision: true,
    tools: true,
    maxOutputTokens: 8192,
  },
  antigravity: {
    contextWindow: 1000000,
    contextLabel: '1M',
    thinking: true,
    thinkingType: 'tiered',
    vision: true,
    tools: true,
    maxOutputTokens: 8192,
  },
  copilot: {
    contextWindow: 128000,
    contextLabel: '128K',
    thinking: false,
    thinkingType: null,
    vision: true,
    tools: true,
    maxOutputTokens: 4096,
  },
  kimi: {
    contextWindow: 200000,
    contextLabel: '200K',
    thinking: true,
    thinkingType: 'budget',
    vision: false,
    tools: true,
    maxOutputTokens: 4096,
  },
  glm: {
    contextWindow: 128000,
    contextLabel: '128K',
    thinking: false,
    thinkingType: null,
    vision: true,
    tools: true,
    maxOutputTokens: 4096,
  },
  cursor: {
    contextWindow: 128000,
    contextLabel: '128K',
    thinking: true,
    thinkingType: 'budget',
    vision: true,
    tools: true,
    maxOutputTokens: 8192,
  },
  kiro: {
    contextWindow: 128000,
    contextLabel: '128K',
    thinking: false,
    thinkingType: null,
    vision: false,
    tools: true,
    maxOutputTokens: 4096,
  },
  perplexity: {
    contextWindow: 200000,
    contextLabel: '200K',
    thinking: true,
    thinkingType: 'low_med_high',
    vision: false,
    tools: true,
    maxOutputTokens: 8192,
  },
  jetbrains: {
    contextWindow: 200000,
    contextLabel: '200K',
    thinking: true,
    thinkingType: 'budget',
    vision: true,
    tools: true,
    maxOutputTokens: 8192,
  },
  default: {
    contextWindow: 128000,
    contextLabel: '128K',
    thinking: false,
    thinkingType: null,
    vision: true,
    tools: true,
    maxOutputTokens: 4096,
  },
}

/**
 * Inspects account capabilities based on provider, token blob metadata and plan.
 * @param {string} provider
 * @param {any} [blob]
 * @param {any} [info]
 * @returns {object}
 */
export function inspectAccountCapabilities(provider, blob = {}, info = {}) {
  const p = String(provider || '').toLowerCase()
  const base = PROVIDER_CAPABILITIES[p] || PROVIDER_CAPABILITIES.default
  const plan = String(blob?.plan || blob?.paidTierName || info?.plan || info?.paidTierName || '').toLowerCase()

  let contextWindow = base.contextWindow
  let contextLabel = base.contextLabel
  let thinking = base.thinking
  let thinkingType = base.thinkingType
  let vision = base.vision
  let tools = base.tools
  let maxOutputTokens = base.maxOutputTokens

  // Tier upgrades for Team / Enterprise / Ultra subscriptions
  if (p === 'claude') {
    if (plan.includes('team') || plan.includes('enterprise') || plan.includes('500k')) {
      contextWindow = 500000
      contextLabel = '500K'
    }
  } else if (p === 'antigravity') {
    if (plan.includes('ultra') || plan.includes('enterprise') || plan.includes('2m')) {
      contextWindow = 2000000
      contextLabel = '2M'
    }
  } else if (p === 'grok') {
    if (plan.includes('pro') || plan.includes('team') || plan.includes('1m')) {
      contextWindow = 1000000
      contextLabel = '1M'
    }
  }

  const tags = []
  tags.push(`${contextLabel} Context`)
  if (thinking) {
    tags.push(thinkingType === 'budget' ? 'Extended Thinking' : (thinkingType === 'tiered' ? 'Tiered Thinking' : 'Adaptive Thinking'))
  }
  if (vision) tags.push('Vision')
  if (tools) tags.push('Tools')

  return {
    provider: p,
    contextWindow,
    contextLabel,
    thinking,
    thinkingType,
    vision,
    tools,
    maxOutputTokens,
    tags,
  }
}

/**
 * Normalizes an outgoing stream request according to account capabilities to avoid 400 errors.
 * @param {any} options
 * @param {any} capabilities
 * @returns {object}
 */
export function normalizeCapabilitiesRequest(options = {}, capabilities = {}) {
  if (!options || typeof options !== 'object') return options
  const out = { ...options }

  // If upstream does not support tools, strip tool parameters
  if (capabilities && capabilities.tools === false) {
    if (out.tools) delete out.tools
    if (out.tool_choice) delete out.tool_choice
  }

  // If upstream does not support reasoning/thinking, strip reasoning_effort
  if (capabilities && capabilities.thinking === false) {
    if (out.reasoning_effort) delete out.reasoning_effort
    if (out.thinking) delete out.thinking
  }

  // Clamp maxTokens if exceeding maximum supported output tokens
  if (capabilities && typeof capabilities.maxOutputTokens === 'number' && capabilities.maxOutputTokens > 0) {
    if (typeof out.max_tokens === 'number' && out.max_tokens > capabilities.maxOutputTokens) {
      out.max_tokens = capabilities.maxOutputTokens
    }
    if (typeof out.maxTokens === 'number' && out.maxTokens > capabilities.maxOutputTokens) {
      out.maxTokens = capabilities.maxOutputTokens
    }
  }

  return out
}
