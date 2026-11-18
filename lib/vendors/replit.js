// Replit Core — OpenAI-compatible chat vendor, described as data (#629).
import { createChatVendor } from './chat-vendor.js'

const MODELS = [
  {
    id: 'replit-code-v2',
    name: 'Replit Code Agent V2',
    contextWindow: 128000,
    maxTokens: 8192,
    inputModalities: ['text'],
  },
]

const vendor = createChatVendor({
  id: 'replit',
  name: 'Replit Core',
  apiBase: 'https://replit.com/api/v1/ai',
  authorizeUrl: 'https://replit.com/account',
  models: MODELS,
  // Replit stores its credential under `token`, not `apiKey`.
  authFields: ['accessToken', 'token'],
  missingAuth: 'Replit Core not authenticated',
})

export const {
  providerInfo,
  defaults,
  authorizeUrl,
  listModels,
  usage,
  streamOnce,
} = vendor
