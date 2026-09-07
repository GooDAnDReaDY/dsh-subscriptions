import z from '@deepseek-ai/schemastery'
import { PROVIDERS } from './refs.js'

export const Slot = z.object({
  provider: z.string().default('codex')
    .description('One of: codex, claude, grok, antigravity.'),
  index: z.number().default(1)
    .description('Account slot number. Credential ref is <PROVIDER>_OAUTH_<index>.'),
  label: z.string().default('')
    .description('Optional display label. Empty uses the account email after login.'),
  expiresAt: z.number().default(0)
    .description('#67 Optional subscription expiry timestamp (ms). When set and within expiryNotifyDays, the header chip shows the account and expiry date.'),
  proxyUrl: z.string().default('')
    .description('#88 Per-account proxy URL (http://, https://, socks5://). All requests for this account route through it. Empty = direct connection.'),
})

export const defaultSlots = PROVIDERS.map((provider) => ({ provider, index: 1, label: '' }))

export const Config = z.object({
  cooldownMs: z.number().default(30 * 60 * 1000)
    .description('After RATE_LIMIT/QUOTA/429, skip that account for this many milliseconds.'),
  switchAtRemaining: z.number().default(0.01)
    .description('If remaining <= this (absolute or <1 fraction), treat as exhausted before request. 0 disables.'),
  refreshAheadMs: z.number().default(5 * 60 * 1000)
    .description('Background refresh when expiry within this many ms.'),
  refreshRetryMs: z.number().default(10 * 60 * 1000)
    .description('Do not retry background refresh more often than this after failure.'),
  probeIntervalMin: z.number().default(15)
    .description('Background health-check interval in minutes. 0 disables.'),
  notifyLimits: z.boolean().default(true)
    .description('Emit log notices when usage crosses 70/90/100% of a window.'),
  expiryNotifyDays: z.number().default(7)
    .description('#67 Warn in the header chip this many days before a subscription expiry (expiresAt). 0 disables.'),
  privacyMask: z.boolean().default(false)
    .description('#98 Hide personal data in the UI: emails show as j***n@example.com.'),
  slots: z.array(Slot).default(defaultSlots)
    .description('Account slots. Secrets are not stored here; only the credential ref names.'),
  useWebCallback: z.boolean().default(false)
    .description('When on, redirect_uri is this Web UI origin + /dsh-subscriptions/oauth/callback. When off, the vendor CLI registered redirect is used and you paste the redirected URL.'),
  autoLoopback: z.boolean().default(true)
    .description('#89 When on and the vendor redirect_uri is a loopback address (codex :1455, grok :56121), a temporary local server catches the OAuth callback automatically - no paste needed. Paste fallback stays available.'),
  ollamaBaseUrl: z.string().default('http://127.0.0.1:11434')
    .description('#91 Local Ollama base URL. Served as the ollama provider in the native model picker when reachable.'),
  ollamaFallback: z.boolean().default(true)
    .description('#91 When every account of a provider is exhausted, continue the chat on local Ollama instead of failing.'),
  ollamaFallbackModel: z.string().default('')
    .description('#91 Ollama model used for the fallback (for example qwen2.5-coder). Empty = first model from /api/tags.'),
  hideDeprecatedModels: z.boolean().default(false)
    .description('#94 Hide test/preview/beta/legacy model ids from the native model picker.'),
  codexClientId: z.string().default(''),
  codexVerbosity: z.string().default('')
    .description('#93 Response verbosity for Codex reasoning models: low, medium or high. Empty = protocol default.'),
  codexFastMode: z.boolean().default(false)
    .description('#92 Fast Mode for Codex: sends service_tier priority (1.5x speed billing tier) with every request.'),
  composerQuota: z.string().default('off')
    .description('#84 Composer quota indicator mode: off, percent, bar or forecast (predictive runway from a sliding window).'),
  codexRedirectUri: z.string().default(''),
  codexBaseUrl: z.string().default(''),
  claudeClientId: z.string().default(''),
  claudeRedirectUri: z.string().default(''),
  grokClientId: z.string().default(''),
  grokRedirectUri: z.string().default(''),
  grokBaseUrl: z.string().default(''),
  grokClientVersion: z.string().default('')
    .description('Grok CLI identity version header. Empty uses the built-in default.'),
  antigravityClientId: z.string().default(''),
  antigravityRedirectUri: z.string().default(''),
  customVendors: z.array(z.any()).default([])
    .description('Declarative OpenAI-Responses-compatible providers. See README.'),
})

export function publicConfig(cfg) {
  const clone = structuredClone(cfg)
  // #242: redact all *ClientSecret fields before exposing config via GET /config.
  // Secrets must never leave the server; the UI does not need them.
  for (const key of Object.keys(clone)) {
    if (key.endsWith('ClientSecret')) clone[key] = clone[key] ? '••••••' : ''
  }
  return clone
}
