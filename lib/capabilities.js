// Subscription Capability Matrix & Context Limit Inspector (#556)
// Determines per-account tier capabilities (context window, thinking mode, vision, tools)
// and dynamically adapts outgoing requests to prevent HTTP 400 Bad Request rejections.
//
// #1097: context windows come from `context-window.js`, not from this table. The
// table used to carry its own numbers, which is how one account reported 128K here,
// 200k in the model catalogue and 150k upstream.
import { resolveContextWindow, PROVIDER_CONTEXT_WINDOWS } from './context-window.js'

export const PROVIDER_CAPABILITIES = {
  codex: {
    contextWindow: PROVIDER_CONTEXT_WINDOWS.codex.window,
    contextLabel: PROVIDER_CONTEXT_WINDOWS.codex.label,
    thinking: true,
    thinkingType: 'low_med_high',
    vision: true,
    tools: true,
    maxOutputTokens: 16384,
  },
  claude: {
    contextWindow: PROVIDER_CONTEXT_WINDOWS.claude.window,
    contextLabel: PROVIDER_CONTEXT_WINDOWS.claude.label,
    thinking: true,
    thinkingType: 'budget',
    vision: true,
    tools: true,
    maxOutputTokens: 8192,
  },
  grok: {
    contextWindow: PROVIDER_CONTEXT_WINDOWS.grok.window,
    contextLabel: PROVIDER_CONTEXT_WINDOWS.grok.label,
    thinking: true,
    thinkingType: 'low_med_high',
    vision: true,
    tools: true,
    maxOutputTokens: 8192,
  },
  antigravity: {
    contextWindow: PROVIDER_CONTEXT_WINDOWS.antigravity.window,
    contextLabel: PROVIDER_CONTEXT_WINDOWS.antigravity.label,
    thinking: true,
    thinkingType: 'tiered',
    vision: true,
    tools: true,
    maxOutputTokens: 8192,
  },
  copilot: {
    contextWindow: PROVIDER_CONTEXT_WINDOWS.copilot.window,
    contextLabel: PROVIDER_CONTEXT_WINDOWS.copilot.label,
    thinking: false,
    thinkingType: null,
    vision: true,
    tools: true,
    maxOutputTokens: 4096,
  },
  kimi: {
    contextWindow: PROVIDER_CONTEXT_WINDOWS.kimi.window,
    contextLabel: PROVIDER_CONTEXT_WINDOWS.kimi.label,
    thinking: true,
    thinkingType: 'budget',
    vision: false,
    tools: true,
    maxOutputTokens: 4096,
  },
  glm: {
    contextWindow: PROVIDER_CONTEXT_WINDOWS.glm.window,
    contextLabel: PROVIDER_CONTEXT_WINDOWS.glm.label,
    thinking: false,
    thinkingType: null,
    vision: true,
    tools: true,
    maxOutputTokens: 4096,
  },
  cursor: {
    contextWindow: PROVIDER_CONTEXT_WINDOWS.cursor.window,
    contextLabel: PROVIDER_CONTEXT_WINDOWS.cursor.label,
    thinking: true,
    thinkingType: 'budget',
    vision: true,
    tools: true,
    maxOutputTokens: 8192,
  },
  kiro: {
    contextWindow: PROVIDER_CONTEXT_WINDOWS.kiro.window,
    contextLabel: PROVIDER_CONTEXT_WINDOWS.kiro.label,
    thinking: false,
    thinkingType: null,
    vision: false,
    tools: true,
    maxOutputTokens: 4096,
  },
  perplexity: {
    contextWindow: PROVIDER_CONTEXT_WINDOWS.perplexity.window,
    contextLabel: PROVIDER_CONTEXT_WINDOWS.perplexity.label,
    thinking: true,
    thinkingType: 'low_med_high',
    vision: false,
    tools: true,
    maxOutputTokens: 8192,
  },
  jetbrains: {
    contextWindow: PROVIDER_CONTEXT_WINDOWS.jetbrains.window,
    contextLabel: PROVIDER_CONTEXT_WINDOWS.jetbrains.label,
    thinking: true,
    thinkingType: 'budget',
    vision: true,
    tools: true,
    maxOutputTokens: 8192,
  },
  default: {
    contextWindow: PROVIDER_CONTEXT_WINDOWS.default.window,
    contextLabel: PROVIDER_CONTEXT_WINDOWS.default.label,
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

  // #1097: the plan upgrade and the provider default come from one resolver, so an
  // account view and the model catalogue can never report different windows again.
  const resolved = resolveContextWindow(p, null, plan)
  let contextWindow = resolved.window
  let contextLabel = resolved.label
  let thinking = base.thinking
  let thinkingType = base.thinkingType
  let vision = base.vision
  let tools = base.tools
  let maxOutputTokens = base.maxOutputTokens

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
