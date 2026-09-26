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
  codexClientVersion: z.string().default('')
    .description('Codex CLI identity version for /models catalog gating (e.g. 0.157.1). Empty uses the built-in default.'),
  claudeClientId: z.string().default(''),
  claudeRedirectUri: z.string().default(''),
  grokClientId: z.string().default(''),
  grokRedirectUri: z.string().default(''),
  grokBaseUrl: z.string().default(''),
  grokClientVersion: z.string().default('')
    .description('Grok CLI identity version header. Empty uses the built-in default.'),
  antigravityClientId: z.string().default(''),
  antigravityRedirectUri: z.string().default(''),
  cascadingFallback: z.boolean().default(false)
    .description('#349 Opt-in cross-vendor fallback when all accounts of a provider are exhausted or rate limited.'),
  cascadingChain: z.any().default({})
    .description('#349 Custom cross-vendor fallback chains (e.g. { claude: ["copilot", "cursor"] }).'),
  webhookUrl: z.string().default('')
    .description('#351 External webhook URL to receive quota and session alerts (JSON POST).'),
  alertThresholds: z.array(z.number()).default([80, 90, 95])
    .description('#351 Quota usage percentage thresholds for firing alerts.'),
  autoPacing: z.boolean().default(true)
    .description('#352 Predictive burn-rate load balancing between accounts.'),
  customVendors: z.array(z.any()).default([])
    .description('Declarative OpenAI-Responses-compatible providers. See README.'),
})

export function publicConfig(cfg) {
  if (!cfg || typeof cfg !== "object") return cfg
  const clone = { ...cfg }
  // #242, #252: redact secret fields before exposing config via GET /config.
  for (const key of Object.keys(clone)) {
    if (key.endsWith("ClientSecret") || key.endsWith("Secret")) {
      clone[key] = clone[key] ? "••••••" : ""
    }
  }

  // Redact credentials in slots (proxyUrl with user:pass)
  if (Array.isArray(clone.slots)) {
    clone.slots = clone.slots.map((s) => {
      if (!s || typeof s !== "object" || !s.proxyUrl) return s
      try {
        const u = new URL(s.proxyUrl)
        if (u.password || u.username) {
          const auth = u.username ? (u.password ? `${u.username}:${u.password}` : u.username) : `:${u.password}`
          const safeAuth = u.username ? `${u.username}:••••••` : `:••••••`
          return { ...s, proxyUrl: s.proxyUrl.replace(auth + "@", safeAuth + "@") }
        }
      } catch { /* ignore non-standard url */ }
      return s
    })
  }

  // Redact credentials in customVendors (apiKey, token, secret, Authorization headers)
  if (Array.isArray(clone.customVendors)) {
    clone.customVendors = clone.customVendors.map((cv) => {
      if (!cv || typeof cv !== "object") return cv
      const copy = { ...cv }
      if (copy.apiKey) copy.apiKey = "••••••"
      if (copy.token) copy.token = "••••••"
      if (copy.secret) copy.secret = "••••••"
      if (copy.clientSecret) copy.clientSecret = "••••••"
      if (copy.headers && typeof copy.headers === "object") {
        const h = { ...copy.headers }
        for (const hk of Object.keys(h)) {
          const lower = hk.toLowerCase()
          if (lower === "authorization" || lower.includes("key") || lower.includes("token") || lower.includes("secret")) {
            h[hk] = "••••••"
          }
        }
        copy.headers = h
      }
      return copy
    })
  }

  return clone
}
