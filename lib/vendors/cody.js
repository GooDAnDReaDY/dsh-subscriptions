// Sourcegraph Cody — OpenAI-compatible chat vendor, described as data (#629).
//
// Cody is the one profile in this family whose model ids need translating: the
// catalog carries `cody-` prefixes and dotted versions, the Sourcegraph API wants
// the bare dashed name. The mapping lives here as data instead of inline code.
import { createChatVendor } from './chat-vendor.js'

const MODELS = [
  {
    id: 'cody-claude-3.5-sonnet',
    name: 'Claude 3.5 Sonnet (Sourcegraph Cody)',
    contextWindow: 200000,
    maxTokens: 8192,
    inputModalities: ['text'],
  },
]

const ALIASES = {
  'cody-claude-3.5-sonnet': 'claude-3-5-sonnet',
}

const vendor = createChatVendor({
  id: 'cody',
  name: 'Sourcegraph Cody',
  apiBase: 'https://sourcegraph.com/.api',
  authorizeUrl: 'https://sourcegraph.com/user/settings/tokens',
  models: MODELS,
  modelAliases: ALIASES,
  // Cody stores its credential under `token`, not `apiKey`.
  authFields: ['accessToken', 'token'],
  // Cody authenticates with a bare `token <t>` header, not `Bearer`.
  authStyle: 'token',
  missingAuth: 'Sourcegraph Cody not authenticated',
  // The catalog id carries a `cody-` prefix and dotted versions; the upstream
  // expects the bare dashed name, so the fallback mapping is part of the profile.
  mapModel: (requested) => {
    const wanted = String(requested || '').trim()
    if (!wanted) return 'claude-3-5-sonnet'
    return ALIASES[wanted]
      || wanted.replace(/^cody-/, '').replace(/\./g, '-')
      || 'claude-3-5-sonnet'
  },
})

export const {
  providerInfo,
  defaults,
  authorizeUrl,
  listModels,
  usage,
  streamOnce,
} = vendor
