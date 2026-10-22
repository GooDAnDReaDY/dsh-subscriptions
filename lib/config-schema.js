import z from '@deepseek-ai/schemastery'
import { PROVIDERS } from './refs.js'

// Defensive polyfill for environments / runners with schemastery < 3.18.4
const proto = z?.Schema?.prototype || (typeof z?.number === "function" ? Object.getPrototypeOf(z.number()) : null)
if (proto && typeof proto.volatile !== "function") {
  proto.volatile = function volatile() {
    return typeof this.extra === "function" ? this.extra("volatile", true) : this
  }
}

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
  maxConcurrency: z.number().default(1)
    .description('#555 Per-slot max concurrent requests before queuing. Defaults to 1 for subscription safety.'),
  monthlyCost: z.number().default(20)
    .description('#590 Optional monthly subscription cost in USD for analytics. Defaults to 20.'),
  maxQueueSize: z.number().default(0)
    .description('#592 Per-account queue depth before overflow. 0 = use the global maxQueueSize.'),
  vipOnly: z.boolean().default(false)
    .description('#175 Reserve this account for VIP requests only.'),
  tags: z.array(z.string()).default([])
    .description('#173 Tags used by tag-filtered rotation.'),
  weight: z.number().default(0)
    .description('#171 Weighted rotation priority. 0 = derive from isPro.'),
  isPro: z.boolean().default(false)
    .description('#171 Treat this account as Pro for weighted rotation.'),
})

export const defaultSlots = PROVIDERS.map((provider) => ({ provider, index: 1, label: '' }))

// Unwrap Volatile boxes before any caller reads a value. A volatile field holds a box
// rather than its value, and the Loader mutates those boxes in place.
export function plainConfig(value) {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(plainConfig)
  if (typeof value.get === 'function') return plainConfig(value.get())
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plainConfig(v)]))
}

export const Config = z.object({
  cooldownMs: z.number().volatile().default(30 * 60 * 1000)
    .description('After RATE_LIMIT/QUOTA/429, skip that account for this many milliseconds.'),
  switchAtRemaining: z.number().volatile().default(0.01)
    .description('If remaining <= this (absolute or <1 fraction), treat as exhausted before request. 0 disables.'),
  refreshAheadMs: z.number().volatile().default(5 * 60 * 1000)
    .description('Background refresh when expiry within this many ms.'),
  refreshRetryMs: z.number().volatile().default(10 * 60 * 1000)
    .description('Do not retry background refresh more often than this after failure.'),
  probeIntervalMin: z.number().volatile().default(15)
    .description('Background health-check interval in minutes. 0 disables.'),
  notifyLimits: z.boolean().volatile().default(true)
    .description('Emit log notices when usage crosses 70/90/100% of a window.'),
  expiryNotifyDays: z.number().volatile().default(7)
    .description('#67 Warn in the header chip this many days before a subscription expiry (expiresAt). 0 disables.'),
  privacyMask: z.boolean().volatile().default(false)
    .description('#98 Hide personal data in the UI: emails show as j***n@example.com.'),
  slots: z.array(Slot).volatile().default(defaultSlots)
    .description('Account slots. Secrets are not stored here; only the credential ref names.'),
  useWebCallback: z.boolean().volatile().default(false)
    .description('When on, redirect_uri is this Web UI origin + /dsh-subscriptions/oauth/callback. When off, the vendor CLI registered redirect is used and you paste the redirected URL.'),
  autoLoopback: z.boolean().volatile().default(true)
    .description('#89 When on and the vendor redirect_uri is a loopback address (codex :1455, grok :56121), a temporary local server catches the OAuth callback automatically - no paste needed. Paste fallback stays available.'),
  ollamaBaseUrl: z.string().volatile().default('http://127.0.0.1:11434')
    .description('#91 Local Ollama base URL. Served as the ollama provider in the native model picker when reachable.'),
  ollamaFallback: z.boolean().volatile().default(true)
    .description('#91 When every account of a provider is exhausted, continue the chat on local Ollama instead of failing.'),
  ollamaFallbackModel: z.string().volatile().default('')
    .description('#91 Ollama model used for the fallback (for example qwen2.5-coder). Empty = first model from /api/tags.'),
  hideDeprecatedModels: z.boolean().volatile().default(false)
    .description('#94 Hide test/preview/beta/legacy model ids from the native model picker.'),
  modelDisplayNames: z.array(z.object({ provider: z.string(), id: z.string(), name: z.string() })).volatile().default([])
    .description('#681 Per-model display names shown in the native model picker.'),
  hiddenModels: z.array(z.object({ provider: z.string(), id: z.string() })).volatile().default([])
    .description('#681 Per-model visibility switches for the native model picker.'),
  modelContextWindows: z.array(z.object({ provider: z.string(), id: z.string(), contextWindow: z.number() })).volatile().default([])
    .description('#681 Per-model context-window override.'),
  modelReasoningDefaults: z.array(z.object({ provider: z.string(), id: z.string(), effort: z.string() })).volatile().default([])
    .description('#681 Per-model default reasoning effort.'),
  modelPlans: z.array(z.object({ provider: z.string(), id: z.string(), minPlan: z.string(), plan: z.string() })).volatile().default([])
    .description('#690 Minimum subscription plan per model, shown in the picker metadata.'),
  codexClientId: z.string().volatile().default(''),
  codexVerbosity: z.string().volatile().default('')
    .description('#93 Response verbosity for Codex reasoning models: low, medium or high. Empty = protocol default.'),
  codexFastMode: z.boolean().volatile().default(false)
    .description('#92 Fast Mode for Codex: sends service_tier priority (1.5x speed billing tier) with every request.'),
  composerQuota: z.string().volatile().default('off')
    .description('#84 Composer quota indicator mode: off, percent, bar or forecast (predictive runway from a sliding window).'),
  composerQuotaDisplay: z.string().volatile().default('current')
    .description('#682 Status-bar quota scope: current (model provider) or hidden.'),
  quotaWidget: z.string().volatile().default('docked')
    .description('#688 Quota widget placement: off, floating (draggable) or docked.'),
  quotaWidgetPosition: z.object({ right: z.number(), bottom: z.number() }).volatile()
    .default({ right: 16, bottom: 16 })
    .description('#711 Last floating quota widget position in CSS pixels.'),
  rateLimitWait: z.boolean().volatile().default(true)
    .description('#684 Report the disclosed reset to dsh-llm-retry instead of parking the account on a guess.'),
  rateLimitMaxWaitMs: z.number().volatile().default(21600000)
    .description('#684 Maximum reset wait reported to dsh-llm-retry (default 6h).'),
  codexRedirectUri: z.string().volatile().default(''),
  codexBaseUrl: z.string().volatile().default(''),
  codexClientVersion: z.string().volatile().default('')
    .description('Codex CLI identity version for /models catalog gating (e.g. 0.160.0). Empty uses the built-in default.'),
  claudeClientId: z.string().volatile().default(''),
  claudeRedirectUri: z.string().volatile().default(''),
  grokClientId: z.string().volatile().default(''),
  grokRedirectUri: z.string().volatile().default(''),
  grokBaseUrl: z.string().volatile().default(''),
  grokClientVersion: z.string().volatile().default('')
    .description('Grok CLI identity version header. Empty uses the built-in default.'),
  antigravityClientId: z.string().volatile().default(''),
  antigravityClientSecret: z.string().role('secret').default('')
    .description('Google OAuth client secret for custom confidential clients or CLI tokens requiring secret refresh.'),
  antigravityRedirectUri: z.string().volatile().default(''),
  perplexityClientId: z.string().volatile().default(''),
  perplexityRedirectUri: z.string().volatile().default(''),
  jetbrainsClientId: z.string().volatile().default(''),
  jetbrainsRedirectUri: z.string().volatile().default(''),
  antigravityModels: z.array(z.any()).volatile().default([])
    .description('Custom model catalog for Antigravity.'),
  codexOriginator: z.string().volatile().default('')
    .description('Originator header for Codex API requests (e.g. codex_cli_rs).'),
  codexSystemPrefix: z.string().volatile().default('')
    .description('System prompt prefix for Codex.'),
  codexModels: z.array(z.any()).volatile().default([])
    .description('Custom model catalog for Codex.'),
  claudeSystemPrefix: z.string().volatile().default('')
    .description('System prompt prefix for Claude.'),
  copilotMode: z.string().volatile().default('auto')
    .description('#508 Execution mode for GitHub Copilot: auto (prefer CLI if available), cli (require copilot CLI), or web (direct web/OAuth API).'),
  copilotCliPath: z.string().volatile().default('')
    .description('#508 Custom binary path for copilot-cli (empty detects in PATH and ~/.npm-global).'),
  claudeCcVersion: z.string().volatile().default('')
    .description('Claude Code version header for billing attribution (default: 2.1.289.7e2).'),
  claudeModels: z.array(z.any()).volatile().default([])
    .description('Custom model catalog for Claude.'),
  grokModels: z.array(z.any()).volatile().default([])
    .description('Custom model catalog for Grok.'),
  cascadingFallback: z.boolean().volatile().default(false)
    .description('#349 Opt-in cross-vendor fallback when all accounts of a provider are exhausted or rate limited.'),
  cascadingFallbackOrder: z.array(z.string()).volatile().default(PROVIDERS)
    .description('Configurable global priority sequence for cross-vendor fallback.'),
  rotationStrategy: z.string().volatile().default('round-robin')
    .description('Load balancing strategy among available accounts: round-robin (balanced), least-loaded (fair-share quota), or priority (sequential).'),
  enableSoftFailureSentinel: z.boolean().volatile().default(true)
    .description('Intercept HTTP 200 soft-failure capacity apologies and automatically cascade to next healthy account.'),
  cascadingChain: z.any().volatile().default({})
    .description('#349 Custom cross-vendor fallback chains (e.g. { claude: ["copilot", "cursor"] }).'),
  webhookUrl: z.string().volatile().default('')
    .description('#351 External webhook URL to receive quota and session alerts (JSON POST).'),
  webhookSecret: z.string().role('secret').default('')
    .description('#720 HMAC-SHA256 secret used to sign webhook payloads.'),
  webhookAllowPrivate: z.boolean().volatile().default(false)
    .description('#729 Allow webhook URLs that resolve to private or loopback hosts.'),
  webhookFormat: z.string().volatile().default('native')
    .description('#751 Webhook payload format: native or notify (dsh-plugin-notify compatible).'),
  digestIntervalHours: z.number().volatile().default(0)
    .description('#720 Send an alert digest every N hours (0 disables digests).'),
  alertThresholds: z.array(z.number()).volatile().default([80, 90, 95])
    .description('#351 Quota usage percentage thresholds for firing alerts.'),
  enableToasts: z.boolean().volatile().default(true)
    .description('#510 In-app toast alerts for quarantine and quota threshold events.'),
  autoPacing: z.boolean().volatile().default(true)
    .description('#352 Predictive burn-rate load balancing between accounts.'),
  drainBeforeReset: z.boolean().volatile().default(false)
    .description('#485 Prioritize accounts with closest reset window to burn expiring quota first.'),
  drainSafetyPercent: z.number().volatile().default(5)
    .description('#485 Safety margin percent: avoid draining accounts below this threshold when alternatives exist.'),
  enableQueue: z.boolean().volatile().default(true)
    .description('#518 Bounded concurrency queue to prevent bursts of 429 errors.'),
  accountMaxConcurrency: z.number().volatile().default(1)
    .description('#518 #555 Default max concurrent requests per account before queuing (1 for OAuth subscription safety).'),
  maxQueueSize: z.number().volatile().default(20)
    .description('#518 Max requests waiting in queue before reject.'),
  queueTimeoutMs: z.number().volatile().default(30000)
    .description('#518 Max queue wait time in ms before timeout.'),
  masterKey: z.string().role('secret').default('')
    .description('#550 Optional master passphrase for encrypting OAuth credentials at rest (defaults to DSH_SUBSCRIPTIONS_MASTER_KEY env).'),
  vaultSyncEnabled: z.boolean().volatile().default(false)
    .description('#562 Enable automated encrypted vault sync to remote storage.'),
  vaultSyncBackend: z.string().volatile().default('webdav')
    .description('#562 Remote storage backend: webdav, gist, or s3.'),
  vaultSyncPassphrase: z.string().role('secret').default('')
    .description('#562 Passphrase used to encrypt/decrypt the remote vault archive.'),
  vaultDeviceId: z.string().volatile().default('')
    .description('#749 Stable per-device vault id. Empty derives one from the host.'),
  vaultDeviceLabel: z.string().volatile().default('')
    .description('#749 Human-readable device label for vault metadata.'),
  vaultPerDeviceKeys: z.boolean().volatile().default(true)
    .description('#749 Derive a per-device passphrase and remote object; legacy shared vault stays readable.'),
  vaultSyncProviders: z.array(z.string()).volatile().default([])
    .description('#691 Optional provider allowlist for selective vault sync. Empty means all providers.'),
  vaultSyncIntervalHours: z.number().volatile().default(24)
    .description('#562 Automated periodic sync interval in hours (0 disables periodic pull).'),
  vaultSyncAutoPush: z.boolean().volatile().default(true)
    .description('#562 Automatically push encrypted vault after successful OAuth login/refresh.'),
  vaultSyncWebdavUrl: z.string().volatile().default('')
    .description('#562 WebDAV target URL.'),
  vaultSyncWebdavUsername: z.string().volatile().default('')
    .description('#562 WebDAV username.'),
  vaultSyncWebdavPassword: z.string().role('secret').default('')
    .description('#562 WebDAV password or app token.'),
  vaultSyncGistId: z.string().volatile().default('')
    .description('#562 GitHub or Gitea Gist ID.'),
  vaultSyncGistToken: z.string().role('secret').default('')
    .description('#562 Personal access token with gist permission.'),
  vaultSyncGistBaseUrl: z.string().volatile().default('https://api.github.com')
    .description('#562 Gist API base URL.'),
  vaultSyncS3Endpoint: z.string().volatile().default('')
    .description('#562 S3 endpoint URL.'),
  vaultSyncS3Bucket: z.string().volatile().default('')
    .description('#562 S3 bucket name.'),
  vaultSyncS3Key: z.string().volatile().default('dsh-subscriptions-vault.enc')
    .description('#562 S3 object key.'),
  vaultSyncS3Region: z.string().volatile().default('us-east-1')
    .description('#562 S3 region.'),
  vaultSyncS3AccessKey: z.string().volatile().default('')
    .description('#562 S3 Access Key ID.'),
  vaultSyncS3SecretKey: z.string().role('secret').default('')
    .description('#562 S3 Secret Access Key.'),
  customVendors: z.array(z.any()).volatile().default([])
    .description('Declarative OpenAI-Responses-compatible providers. See README.'),
  providerPacks: z.array(z.any()).volatile().default([])
    .description('#694 Data-only vendor packs registered through the provider SDK.'),
  nativeTools: z.boolean().volatile().default(false)
    .description('#18 Opt-in subscription-native image/x/web/video tools. Off by default because these names shadow builtin tools; enable only when the host does not provide them.'),
})

export function publicConfig(cfg) {
  if (!cfg || typeof cfg !== "object") return cfg
  const clone = { ...cfg }
  // #242, #252: redact secret fields before exposing config via GET /config.
  for (const key of Object.keys(clone)) {
    if (key.endsWith("ClientSecret") || key.endsWith("Secret") || key.endsWith("SecretKey") || key.endsWith("Password") || key.endsWith("Token") || key.endsWith("Passphrase") || key === "masterKey") {
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

export function restoreMaskedSecrets(incoming, existing) {
  if (!incoming || typeof incoming !== "object") return incoming
  if (!existing || typeof existing !== "object") return incoming

  const out = { ...incoming }

  for (const key of Object.keys(out)) {
    if ((key.endsWith("ClientSecret") || key.endsWith("Secret") || key.endsWith("SecretKey") || key.endsWith("Password") || key.endsWith("Token") || key.endsWith("Passphrase") || key === "masterKey") && typeof out[key] === "string") {
      if (out[key].includes("••••")) {
        out[key] = existing[key] || ""
      }
    }
  }

  if (Array.isArray(out.slots) && Array.isArray(existing.slots)) {
    out.slots = out.slots.map((s) => {
      if (!s || typeof s !== "object" || typeof s.proxyUrl !== "string" || !s.proxyUrl.includes("••••")) return s
      const match = existing.slots.find((e) => e && e.provider === s.provider && Number(e.index) === Number(s.index))
      if (match && match.proxyUrl) {
        return { ...s, proxyUrl: match.proxyUrl }
      }
      return s
    })
  }

  if (Array.isArray(out.customVendors) && Array.isArray(existing.customVendors)) {
    out.customVendors = out.customVendors.map((cv) => {
      if (!cv || typeof cv !== "object") return cv
      const match = existing.customVendors.find((e) => e && e.id === cv.id)
      if (!match) return cv
      const copy = { ...cv }
      for (const f of ["apiKey", "token", "secret", "clientSecret"]) {
        if (typeof copy[f] === "string" && copy[f].includes("••••")) {
          copy[f] = match[f] || ""
        }
      }
      if (copy.headers && typeof copy.headers === "object" && match.headers && typeof match.headers === "object") {
        const h = { ...copy.headers }
        for (const hk of Object.keys(h)) {
          if (typeof h[hk] === "string" && h[hk].includes("••••")) {
            h[hk] = match.headers[hk] || ""
          }
        }
        copy.headers = h
      }
      return copy
    })
  }

  return out
}

export function revisionOf(settingsApi) {
  return settingsApi && typeof settingsApi.revision === 'function' ? settingsApi.revision() : undefined
}
