/**
 * Single source of truth for context-window sizes (#1097).
 *
 * Before this module the number lived in two places and disagreed: the model
 * catalogue (`models-catalog.inferModelCapabilities`) reported 200 000 for every
 * codex model, while the account capability matrix (`capabilities.PROVIDER_CAPABILITIES`)
 * reported 128 000, and the vendor itself rejected a request at 150 000:
 *
 *     vendor http 400: context ~538891 tokens exceeds the model window 150000
 *
 * Everything that needs a window now calls `resolveContextWindow()`. The result
 * carries its provenance (`source`), so a UI badge can say whether the number came
 * from a model rule, a plan upgrade, or the provider default.
 */

/**
 * Provider defaults. `codex` is 150 000 because the upstream Codex backend rejects
 * above that: the report behind #1097 quoted the vendor's own message, and all
 * eight codex models behaved the same way. Review this entry when Codex changes
 * its window — it is a single, greppable constant on purpose.
 */
export const PROVIDER_CONTEXT_WINDOWS = Object.freeze({
  codex: { window: 150000, label: '150K' },
  claude: { window: 200000, label: '200K' },
  grok: { window: 128000, label: '128K' },
  antigravity: { window: 1000000, label: '1M' },
  copilot: { window: 128000, label: '128K' },
  kimi: { window: 262144, label: '256K' },
  glm: { window: 131072, label: '128K' },
  cursor: { window: 200000, label: '200K' },
  kiro: { window: 200000, label: '200K' },
  perplexity: { window: 200000, label: '200K' },
  jetbrains: { window: 200000, label: '200K' },
  replit: { window: 128000, label: '128K' },
  cody: { window: 200000, label: '200K' },
  qwen: { window: 131072, label: '128K' },
  ernie: { window: 131072, label: '128K' },
  spark: { window: 32768, label: '32K' },
  ollama: { window: 128000, label: '128K' },
  default: { window: 128000, label: '128K' },
})

/** Model-id rules, checked before the provider default. First match wins. */
const MODEL_RULES = [
  {
    test: (provider, id) => provider === 'antigravity' && (id.includes('gemini-2.5') || id.includes('gemini-3')),
    window: (provider, id) => (id.includes('pro') ? 2000000 : 1000000),
    label: (provider, id) => (id.includes('pro') ? '2M' : '1M'),
  },
  {
    test: (provider, id) => id.includes('grok-3') || id.includes('1m'),
    window: () => 1000000,
    label: () => '1M',
  },
  {
    test: (provider, id) => id.includes('claude-') && (id.includes('opus') || id.includes('sonnet')),
    window: () => 200000,
    label: () => '200K',
  },
  {
    test: (provider, id) => id.includes('200k'),
    window: () => 200000,
    label: () => '200K',
  },
]

/**
 * Plan-based upgrades: a Team or Enterprise tier can raise the window above the
 * provider default. Kept separate from model rules because the same model has a
 * different window depending on what the account paid for.
 */
const PLAN_RULES = [
  {
    provider: 'claude',
    matches: (plan) => plan.includes('team') || plan.includes('enterprise') || plan.includes('500k'),
    window: 500000,
    label: '500K',
  },
  {
    provider: 'antigravity',
    matches: (plan) => plan.includes('ultra') || plan.includes('enterprise') || plan.includes('2m'),
    window: 2000000,
    label: '2M',
  },
  {
    provider: 'grok',
    matches: (plan) => plan.includes('pro') || plan.includes('team') || plan.includes('1m'),
    window: 1000000,
    label: '1M',
  },
]

function normalizePlan(plan) {
  return String(plan || '').toLowerCase()
}

/**
 * Resolve the effective context window for a provider, optionally narrowed to a
 * model and a subscription plan.
 *
 * Precedence: model rule → plan upgrade → provider default.
 *
 * @param {string} provider
 * @param {string} [modelId]
 * @param {string} [plan]
 * @returns {{window: number, label: string, source: 'model'|'plan'|'provider', model: string|null}}
 */
export function resolveContextWindow(provider, modelId, plan) {
  const p = String(provider || '').toLowerCase() || 'default'
  const id = String(modelId || '').toLowerCase()
  const tier = normalizePlan(plan)

  if (id) {
    for (const rule of MODEL_RULES) {
      if (rule.test(p, id)) {
        return { window: rule.window(p, id), label: rule.label(p, id), source: 'model', model: modelId }
      }
    }
  }

  if (tier) {
    for (const rule of PLAN_RULES) {
      if (rule.provider === p && rule.matches(tier)) {
        return { window: rule.window, label: rule.label, source: 'plan', model: modelId || null }
      }
    }
  }

  const base = PROVIDER_CONTEXT_WINDOWS[p] || PROVIDER_CONTEXT_WINDOWS.default
  return { window: base.window, label: base.label, source: 'provider', model: modelId || null }
}

/** Convenience: just the number. */
export function contextWindowFor(provider, modelId, plan) {
  return resolveContextWindow(provider, modelId, plan).window
}
