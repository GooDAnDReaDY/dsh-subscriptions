// Reasoning effort management and model capability mapping (#505).
// Enforces 0 Cyrillic characters.

/**
 * Known default effort levels per vendor.
 * @type {Record<string, string[]>}
 */
export const DEFAULT_VENDOR_EFFORTS = {
  codex: ['low', 'medium', 'high'],
  claude: ['low', 'medium', 'high'],
  antigravity: ['low', 'medium', 'high'],
  grok: ['low', 'medium', 'high'],
  kimi: ['low', 'medium', 'high', 'max'],
  cursor: ['low', 'medium', 'high', 'max'],
}

/**
 * Inspect model and catalog to determine supported reasoning levels.
 * @param {string} provider
 * @param {string} modelId
 * @param {Array<any>} [catalog]
 * @returns {{ supported: boolean, levels: string[], defaultEffort?: string }}
 */
export function getModelReasoningCapabilities(provider, modelId, catalog = []) {
  const p = String(provider || '').toLowerCase().trim()
  const id = String(modelId || '').toLowerCase().trim()

  // 1. Check catalog entry if provided
  if (Array.isArray(catalog) && catalog.length) {
    const entry = catalog.find((m) => m && (m.id === id || m.slug === id || m.name === id))
    if (entry && entry.reasoning && Array.isArray(entry.reasoning.efforts) && entry.reasoning.efforts.length) {
      const levels = entry.reasoning.efforts.map((row) => (typeof row === 'string' ? row : row.id)).filter(Boolean)
      if (levels.length) {
        return {
          supported: true,
          levels,
          defaultEffort: entry.reasoning.defaultEffort || 'medium',
        }
      }
    }
  }

  // 2. Vendor-specific heuristics
  if (p === 'claude') {
    // Claude 3.7+ Sonnet (both hybrid thinking and adaptive)
    if (/claude-(?:3[.-]7|37)-sonnet/.test(id)) {
      return { supported: true, levels: ['low', 'medium', 'high'], defaultEffort: 'medium' }
    }
    // Claude 4.6+ Sonnet / Opus
    const m = /^claude-(opus|sonnet|haiku|fable)(?:-(\d+))?(?:-(\d+))?/.exec(id)
    if (m) {
      const [, family, maj, min] = m
      const major = maj ? Number(maj) : null
      const minor = min ? Number(min) : null
      const atLeast = (wantMaj, wantMin) => (
        major === null || major > wantMaj || (major === wantMaj && (minor === null || minor >= wantMin))
      )
      if ((family === 'sonnet' || family === 'opus') && atLeast(4, 6)) {
        const levels = ['low', 'medium', 'high']
        if (family === 'opus') {
          if (atLeast(4, 7)) levels.push('xhigh')
          levels.push('max')
        }
        return { supported: true, levels, defaultEffort: 'medium' }
      }
    }
    return { supported: false, levels: [] }
  }

  if (p === 'codex') {
    // OpenAI reasoning models: o1, o3, gpt-5.1-codex, or models containing 'reasoning'
    if (
      id.startsWith('o1') ||
      id.startsWith('o3') ||
      id.includes('reasoning') ||
      id.includes('codex')
    ) {
      return { supported: true, levels: ['low', 'medium', 'high'], defaultEffort: 'medium' }
    }
    return { supported: false, levels: [] }
  }

  if (p === 'antigravity') {
    if (
      id.includes('thinking') ||
      id.includes('gemini-3.1-pro') ||
      id.includes('gemini-3.6-flash') ||
      id.includes('gemini-3.7-flash') ||
      id.includes('gemini-3.8-flash')
    ) {
      return { supported: true, levels: ['low', 'medium', 'high'], defaultEffort: 'medium' }
    }
    return { supported: false, levels: [] }
  }

  if (p === 'grok') {
    if (id.includes('reasoning') || id === 'grok-3-mini') {
      return { supported: true, levels: ['low', 'medium', 'high'], defaultEffort: 'medium' }
    }
    // #27: grok-4.x supports reasoning effort even when the best-effort CLI
    // metadata endpoint is temporarily unreachable.
    if (/^grok-4(?:[.-]|$)/i.test(id)) {
      return { supported: true, levels: ['low', 'medium', 'high'], defaultEffort: 'high' }
    }
    return { supported: false, levels: [] }
  }

  if (p === 'kimi') {
    if (id.includes('k1.5') || id.includes('reasoning')) {
      return { supported: true, levels: ['low', 'medium', 'high', 'max'], defaultEffort: 'medium' }
    }
    return { supported: false, levels: [] }
  }

  return { supported: false, levels: [] }
}

/**
 * Extract raw effort and budget from incoming request options.
 * @param {any} options
 * @returns {{ effort?: string, budgetTokens?: number }}
 */
export function extractReasoningOptions(options) {
  if (!options || typeof options !== 'object') return {}
  let effort = options.reasoningEffort
  if (!effort && options.reasoning && typeof options.reasoning.effort === 'string') {
    effort = options.reasoning.effort
  }
  if (!effort && options.thinking && typeof options.thinking.effort === 'string') {
    effort = options.thinking.effort
  }
  if (!effort && typeof options.effort === 'string') {
    effort = options.effort
  }

  let budgetTokens = options.thinkingBudget ?? options.budgetTokens
  if (budgetTokens == null && options.thinking && options.thinking.budget_tokens != null) {
    budgetTokens = options.thinking.budget_tokens
  }

  const normalizedEffort = typeof effort === 'string' ? effort.toLowerCase().trim() : undefined
  const normalizedBudget = typeof budgetTokens === 'number' && !Number.isNaN(budgetTokens) ? budgetTokens : undefined

  return {
    ...(normalizedEffort ? { effort: normalizedEffort } : {}),
    ...(normalizedBudget != null ? { budgetTokens: normalizedBudget } : {}),
  }
}

/**
 * Validate effort level against model capabilities.
 * @param {string} provider
 * @param {string} modelId
 * @param {string|undefined} effort
 * @param {Array<any>} [catalog]
 * @returns {{ valid: boolean, effort?: string, reason?: string }}
 */
export function validateReasoningEffort(provider, modelId, effort, catalog = []) {
  if (!effort) return { valid: true, effort: undefined }
  const eff = String(effort).toLowerCase().trim()
  if (eff === 'off' || eff === 'none') {
    return { valid: true, effort: 'off' }
  }

  const caps = getModelReasoningCapabilities(provider, modelId, catalog)
  if (!caps.supported) {
    return { valid: false, reason: 'model_not_reasoning' }
  }

  if (!caps.levels.includes(eff)) {
    return { valid: false, reason: 'unsupported_effort_level' }
  }

  return { valid: true, effort: eff }
}

const DEFAULT_TTL_MS = 60 * 60 * 1000 // 1 hour
const MAX_STORED_SESSIONS = 500

/**
 * @typedef {Object} SessionReasoningRecord
 * @property {string} provider
 * @property {string} model
 * @property {string} effort
 * @property {number} [budgetTokens]
 * @property {number} updatedAt
 * @property {number} expiresAt
 */

/** @type {Map<string, SessionReasoningRecord>} */
const sessionReasoningStore = new Map()

/**
 * Store session-scoped reasoning configuration.
 * @param {string} sessionId
 * @param {object} params
 * @param {string} params.provider
 * @param {string} params.model
 * @param {string} params.effort
 * @param {number} [params.budgetTokens]
 * @param {number} [params.ttlMs]
 * @param {Array<any>} [catalog]
 * @returns {{ ok: boolean, error?: string }}
 */
export function setSessionReasoning(sessionId, { provider, model, effort, budgetTokens, ttlMs = DEFAULT_TTL_MS }, catalog = []) {
  if (!sessionId || typeof sessionId !== 'string') {
    return { ok: false, error: 'invalid_session_id' }
  }

  const validation = validateReasoningEffort(provider, model, effort, catalog)
  if (!validation.valid) {
    return { ok: false, error: validation.reason }
  }

  if (sessionReasoningStore.size >= MAX_STORED_SESSIONS) {
    pruneSessionReasoning()
  }

  const now = Date.now()
  sessionReasoningStore.set(sessionId, {
    provider: String(provider || ''),
    model: String(model || ''),
    effort: validation.effort || 'off',
    budgetTokens: typeof budgetTokens === 'number' ? budgetTokens : undefined,
    updatedAt: now,
    expiresAt: now + ttlMs,
  })

  return { ok: true }
}

/**
 * Retrieve session-scoped reasoning configuration.
 * @param {string} sessionId
 * @param {number} [now]
 * @returns {SessionReasoningRecord|null}
 */
export function getSessionReasoning(sessionId, now = Date.now()) {
  if (!sessionId) return null
  const record = sessionReasoningStore.get(sessionId)
  if (!record) return null
  if (record.expiresAt <= now) {
    sessionReasoningStore.delete(sessionId)
    return null
  }
  // Sliding TTL extension
  record.expiresAt = now + DEFAULT_TTL_MS
  return record
}

/**
 * Clear session-scoped reasoning configuration.
 * @param {string} sessionId
 * @returns {boolean}
 */
export function clearSessionReasoning(sessionId) {
  if (!sessionId) return false
  return sessionReasoningStore.delete(sessionId)
}

/**
 * Prune expired session reasoning entries.
 * @param {number} [now]
 * @returns {number} count of pruned sessions
 */
export function pruneSessionReasoning(now = Date.now()) {
  let pruned = 0
  for (const [id, record] of sessionReasoningStore.entries()) {
    if (record.expiresAt <= now) {
      sessionReasoningStore.delete(id)
      pruned++
    }
  }
  return pruned
}

/**
 * Get internal store statistics.
 * @returns {{ activeSessions: number }}
 */
export function getSessionReasoningStats() {
  return { activeSessions: sessionReasoningStore.size }
}

/**
 * Resolve effective reasoning effort for a request turn.
 * Automatically guards against model switching: if the session has a stored
 * reasoning effort but the target model is non-reasoning, the parameter is suppressed.
 * @param {string|undefined} sessionId
 * @param {any} options
 * @param {Array<any>} [catalog]
 * @returns {{ effort?: string, budgetTokens?: number }}
 */
export function resolveEffectiveReasoning(sessionId, options, catalog = []) {
  const extracted = extractReasoningOptions(options)
  const provider = options && options.provider
  const targetModel = options && options.model

  // 1. Explicit request-level option takes precedence
  if (extracted.effort || extracted.budgetTokens) {
    const val = validateReasoningEffort(provider, targetModel, extracted.effort, catalog)
    if (val.valid) {
      return {
        effort: val.effort === 'off' ? 'off' : val.effort,
        budgetTokens: extracted.budgetTokens,
      }
    }
    // If invalid (e.g. non-reasoning model), suppress so request does not fail
    return { effort: undefined, budgetTokens: undefined }
  }

  // 2. Fall back to session-scoped configuration
  if (sessionId) {
    const record = getSessionReasoning(sessionId)
    if (record && record.effort) {
      // Validate that the target model currently being invoked supports reasoning
      const val = validateReasoningEffort(provider, targetModel, record.effort, catalog)
      if (val.valid && val.effort !== 'off') {
        return {
          effort: val.effort,
          budgetTokens: record.budgetTokens,
        }
      }
    }
  }

  return { effort: undefined, budgetTokens: undefined }
}
