# Changelog

Notable changes to `@goodandready/dsh-subscriptions`.

## 0.6.30

### Fixes & Security
- **Test History Isolation Guard (#411)**: isolated test history storage directory (`resolveHistoryDir`) via `DSH_HISTORY_DIR`/`DSH_STORAGE_DIR`/`DSH_HOME` and added test setup guard ensuring production `~/.dsh` is never touched by unit test runs.
- **Hermes Mentions Removal (#412)**: removed legacy references to Hermes agent from UI instructions, client placeholder hints, and CLI credential importer.
- **Local Discovery Coding-Agent Configs Cleanup (#413)**: removed unsupported coding-agent configurations from local credential discovery to avoid importing incomplete or unroutable profiles.
- **Vault Passphrase & Key Derivation Hardening (#414)**: enforced a minimum 12-character passphrase on vault token export with scrypt `N=131072` (DSHE3) and PBKDF2 600,000 iterations (DSHE2) while preserving backwards-compatible decryption for existing backups.

## 0.6.29

### Fixes & Hardening
- **Theme Variables in CSS (#406)**: replaced hardcoded hex fallback `#3b82f6` in `.dsub-speed-tag` styles with pure theme variable `var(--dsw-alias-brand-default)`.
- **Runtime Quota Alerts & Session Expiration Wiring (#407)**: wired `checkQuotaThresholds` into adapter quota capture and `notifySessionExpired` into `streamWithRotation` on 401/`TOKEN_REVOKED` errors; dynamically resolved User-Agent from `package.json` in external webhook dispatcher.
- **Snapshot Status in Settings PluginCard (#408)**: added handling of host configuration status in `PluginCard` (`props.status === loading` and `props.status === unavailable`) to comply with DSH slot contracts.
- **Canonical Plugin Updater Aliases & Fail-Closed Validation (#409)**: registered canonical route aliases `/api/@goodandready/dsh-subscriptions/update` and `/api/dsh-subscriptions/update`; enforced strict fail-closed origin validation using `isTrustedSettingsRequest`.

## 0.6.28

### Features & Optimization
- **Prompt Caching Prefix Stabilization & Ephemeral Controls (#400)**: normalized whitespace and CRLF line endings in system prompts and instructions; attached Anthropic ephemeral `cache_control` breakpoints to system text block, the last tool definition, and the second-to-last user conversation turn in multi-turn dialogues to achieve 90%+ cache hit rate and instant TTFT.
- **Stream Runaway Circuit-Breaker Guard (#401)**: added `RunawayDetector` and `withRunawayGuard` in `lib/runaway-guard.js` to monitor live generation streams, automatically terminating with a clean `stop` finish chunk when consecutive repetitive tokens (>=30) or cyclic n-gram loops (>=6 repetitions) are detected, saving user quota and preventing UI lockups.
- **Universal Tool Schema Normalizer (#403)**: implemented `normalizeTools` and `normalizeJsonSchema` in `lib/tools-normalizer.js`, stripping unsupported meta properties (`$schema`, `$id`), sanitizing function names (`^[a-zA-Z0-9_-]{1,64}), validating top-level object parameters, and pruning enum lists across OpenAI, Anthropic, Gemini, and Codex.
- **Universal Multimodal Payload Normalizer (#404)**: added `extractImages` and vendor format converters in `lib/images.js` (`toOpenAiImage`, `toAnthropicImage`, `toGeminiImage`, `toCodexImage`), extracting and cross-converting data URIs, base64 payloads, and image URLs seamlessly for all vision models.

## 0.6.27

### Features & WebUI
- **Live Quota Reset Countdown Timers (#394)**: added live relative countdown timers in account cards and header status chip (`formatRelativeReset`), parsing ISO timestamps and epoch formats from upstream quota windows to show exact time remaining until quota replenishment.
- **TTFT & Token Generation Speed Telemetry (#395)**: tracked time-to-first-token (TTFT) and generation speed (tokens/sec) during streaming requests in adapter; aggregated metrics per slot in `HistoryStore` and surfaced live speed badges (`⚡ TTFT: 340ms · 45.2 t/s`) on account cards.
- **Encrypted Profile Backup with PBKDF2 (#396)**: added export and import backup functionality using PBKDF2 (100k iterations, SHA-256) and AES-256-GCM (`DSHE2:`), maintaining backward compatibility with `DSHE1:` (scrypt); added user-friendly Export and Import modals in settings with direct file download (`.enc`) and clipboard copy.

### Providers & OAuth
- **GitHub Copilot Device Code Flow (#398)**: integrated official GitHub Copilot subscription provider via headless Device Code OAuth (`https://github.com/login/device`), automatic token capture and polling, model catalog (`claude-3.7-sonnet`, `gpt-4o`, `o1`, `o3-mini`), and local CLI session importer.

## 0.6.26

### Bug Fixes & Wire Protocol
- **Tool-Call ID & Index Guarantees (#390, GH #8)**: ensured `googleStream()` assigns a dedicated block index and non-empty string `id` (`gemini_call_<n>` or upstream id) to every `tool-call-delta` chunk, resolving `TypeError: tool-call-delta id must be a string` in DSH stream validator. In `anthropicStream()`, mapped and preserved `tool_use` block `id` across all `input_json_delta` chunks. Coerced token counters with `?? 0` across stream usage chunks to ensure lossless JSON serialization.
- **Gemini Tool Schema Enum Sanitization (#392, GH #10)**: trimmed, filtered empty/whitespace-only strings, and deduplicated `schema.enum` in `toGeminiSchema()`; omitted the `enum` property entirely if empty to prevent Google `400 INVALID_ARGUMENT` crashes.
- **Antigravity Quota Windows Resolution (#389, GH #7)**: prevented pure-numeric array indices (`/^\d+$/`) from becoming window names in `usageWindows()`; resolved semantic identifiers (`modelId`, `model`, `window`, `name`, `id`, `scope`). For model buckets, only 1-2 active models with `usedPercent > 0` are surfaced, returning `null` when all are at 0% to prevent cluttering the UI. Standard named windows (`5h`/`7d`) preserved.
- **Transient Google Region Error Recovery (#391, GH #9)**: added `isRegionError()` classifying HTTP 400 `FAILED_PRECONDITION` / `"User location is not supported"` as switchable in `isSwitchableError()`. Added in-place retry (up to 2 attempts with 400ms backoff) in `streamWithRotation()` before rotating account slots.

## 0.6.25

### Security & Hardening
- **Route Authorization Guard (#385)**: enforced `isTrustedSettingsRequest(req)` on `POST /dsh-subscriptions/analyze-session`, returning `403 Forbidden` on cross-site/unauthenticated requests.

### Features & WebUI
- **Session Cache Analyzer Integration (#386)**: connected the session cache analyzer to Settings WebUI diagnostics block with an on-demand analysis action (`runAnalyzeSession`) and display of weighted cache hit percentage and saved tokens, localized for `en` and `zh`.

### Technical Debt & Quality
- **Test Suite Lint Cleanliness (#387)**: fixed all 25 ESLint errors across the `test/` suite and updated `npm test` to validate both `lib/` and `test/` directories (`eslint lib/ test/`).

## 0.6.24

### Features & Models Catalog
- **Codex GPT-6 Catalog Gating (#383, #384)**: bumped default Codex `clientVersion` from `0.147.0` to `0.157.1` in `lib/vendors/codex.js`, unlocking the complete GPT-6 and modern GPT-5.x model family (`gpt-6-astra`, `gpt-6-sol`, `gpt-6-luna`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, `gpt-5.5`).
- **Configurable Codex Client Version**: added `codexClientVersion` property to the `Config` schema in `lib/config-schema.js` with documentation, enabling custom client version override without code modifications.
- **Modern Fallback Models**: refreshed default Codex catalog fallback list to modern GPT-6 and GPT-5.x generation models when the live `/models` endpoint is unreachable or empty.

## 0.6.23

### Security & Privacy
- **Credential Redaction in Public Config (#242, #252)**: redacted nested proxy URL credentials (`user:••••••@host`) and custom vendor credentials (`apiKey`, `token`, `secret`, `headers.Authorization`) in `publicConfig`; dropped `antigravityClientSecret` from Config schema.
- **Fail-Closed Origin Validation (#341, #374)**: made `isTrustedSettingsRequest` fail-closed against absent origin headers on non-loopback clients; added 403 protection to `GET /config`, `GET /diagnostics`, and `GET /discover-local`.

### Reliability & Concurrency
- **Optimistic Concurrency on Config PUT (#379)**: added revision counter and CAS conflict detection on `PUT /config` returning 409 Conflict when saving from stale client revisions, with automatic draft reload in settings UI.
- **Bounded History & Clean Teardown (#377, #378)**: capped in-memory request `HistoryStore` to 1000 entries with eviction, added `dispose()` method hooked to `ctx.on('dispose')`; effect-bound client settings slots for proper teardown.

### UI & Theme Standards
- **DSH Theme Tokens Migration (#320)**: converted all standalone `rgba(...)` and hex colors in `lib/client.js` to canonical DSH theme tokens (`var(--dsw-alias-state-*)`, `var(--dsw-alias-bg-*)`, `var(--dsw-alias-brand-primary)`), ensuring crisp readability across both light and dark themes.

### Technical Debt & Packaging
- **Modularization & Linter Zero-Debt (#372)**: reduced `lib/index.js` from 861 lines to 415 lines by extracting `lib/adapter-manager.js`, `lib/diagnostics.js`, and `lib/accounts-view.js`; eliminated all 40 linter warnings (`no-unused-vars` enabled as error); wired `healthBadge` into account models and UI; added production route `DELETE /alerts`.
- **Localized Documentation Packaging (#375)**: included `README.ru.md` and `README.zh.md` in `package.json` `files` array for distribution on npm.

## 0.6.22

### Security
- **Cross-site Protection on Read Routes (#371)**: added `isTrustedSettingsRequest(req)` origin check returning 403 Forbidden for cross-site requests (`sec-fetch-site: cross-site`, cross-origin `Origin`/`Referer`) on read endpoints:
  - `GET /dsh-subscriptions/status`
  - `GET /dsh-subscriptions/history`
  - `GET /dsh-subscriptions/telemetry`
  - `GET /dsh-subscriptions/alerts`
  - `GET /dsh-subscriptions/reset-credits`
  Added regression tests in `test/routes-security.test.mjs` covering cross-site rejection and same-origin acceptance.

## 0.6.21

### Bug Fixes
- **Codex Tool Output HTTP 400 Repair (#369)**: mapped messages with `role: "tool"` to `function_call_output` in `codexResponsesBody`, added bidirectional reconciliation for OpenAI Responses protocol (synthesizing outputs for interrupted tool calls and dropping orphan outputs) to prevent vendor 400 errors.
- **Account Proxy Support in `listModels` (#369)**: passed account proxy fetch dispatcher via `pickFetch(this.deps, targetAccount.ref)` in `SubscriptionAdapter.prototype.listModels`, enabling live catalog fetching from geo-blocked regions.
- **Catalog Freshness (#369)**: updated default model list with modern models including GPT-5.6 Luna, GPT-5.3 Codex, and GPT-5.2 Codex.

## 0.6.20

### Performance
- **Immutable Config Snapshot & Hot Path Optimization (#367)**: eliminated expensive `scope.get()` and `structuredClone()` calls from hot request paths and loops, caching an immutable config snapshot invalidated only via `settings/document-updated` or explicit mutation; read config once per operation in `lib/accounts.js`.

## 0.6.19

### Security
- **Cross-site protection on POST /smoke (#359)**: added `isTrustedSettingsRequest(req)` guard to `/smoke` endpoint returning 403 Forbidden for cross-site callers, preventing unauthorized token refreshes and quota consumption.

## 0.6.18

### Security & Hardening
- **Strict Vault Schema & Injection Defense (#360)**: Vault imports now validate declared slot providers, non-negative integer indices, duplicate slots, and strictly reject undeclared credential blob injection.
- **Cascading Fallback Cycle Prevention & Abort Safety (#361)**: Added `visited` tracking set across cascade chains to eliminate infinite loops and `options.signal.aborted` checks to abort cascading when client cancels.
- **Auto-Reconciliation of Orphaned Slots (#362)**: `reconcileSlots` synchronizes discovered provider credentials directly from `ctx.credentials.describe`.
- **Adapter Lifecycle & Timer Teardown (#363)**: Added `adapterDisposed` guard to teardown retry timers and ignore sync tasks after adapter destruction.
- **Health Matrix i18n & UI Localization (#364)**: Localized Health Matrix column headers, health status badges, and plugin item title using `t()` across EN and ZH locales.

## 0.6.17

### Added
- **Cascading Cross-Vendor Fallback (#349)**: Seamless fallback across compatible providers (Claude -> Copilot -> Cursor) when accounts are exhausted or rate limited (opt-in via `cascadingFallback`).
- **Self-Healing Quarantine Warm-up (#350)**: Background warmup probe (`probing` status) verifies expired quarantine slots via `fetchForRef()` before returning to active pool, with exponential backoff on repeated failure.
- **Proactive Quota Alerts & Webhooks (#351)**: Threshold alerts (80%, 90%, 95%) and session expiration notifications with in-memory buffer, `/alerts` endpoint, and async HTTP POST webhook dispatch.
- **Predictive Burn-rate Optimizer & Auto-Pacing (#352)**: Runway calculation and exhaustion risk scoring in `pickAccount()` to dynamically balance token consumption until the quota reset window.
- **Encrypted Vault Export & Import (#353)**: AES-256-GCM encrypted backup and restore for slots and credential blobs via `/vault/export` and `/vault/import`.
- **Health Matrix Overview in UI (#354)**: Real-time health matrix showing latency, health scores, quarantine state, and quota runways in the plugin settings component.
- **Device-Flow OAuth Support (#355)**: Unified device-code authorization endpoints for Copilot and Codex with interactive polling.

## 0.6.16

### Performance & Security Optimization
- **Non-blocking stream initialization (#339)**: `refreshUsage` no longer delays Time To First Chunk (TTFT) by running sequentially before chunks are yielded; it now refreshes asynchronously in the background.
- **Debounced history persistence (#340)**: `HistoryStore` now buffers disk writes with a 1000ms debounce instead of synchronous `writeFileSync` on every completed request.
- **CSRF protection hardening (#341)**: `isTrustedSettingsRequest` now strictly validates `Host` vs `Origin` / `Referer` headers when `sec-fetch-site` is omitted.
- **Smart rotation health weighting (#342)**: `listAccounts` now computes and forwards `healthScore`, re-enabling penalty-aware rotation across account pools.
- **Proxy support for status and smoke checks (#343)**: Background health probes and `/check`, `/smoke` routes now route through the slot's configured `proxyUrl`.
- **GitHub Copilot Device Flow support (#344)**: Connected `deviceStart`, `devicePoll`, and `refresh` to the OAuth route handler, enabling Web UI Copilot authorization.
- **Public exports for forecast and relative time (#345)**: Exported `observeForecast`, `estimateForecast`, and `formatRelativeReset` from root `lib/index.js`.
- **Parallel slot reconciliation (#346)**: Cold-start slot discovery across 160 provider/index combinations now executes in parallel via `Promise.all`.
- **Memory leak prevention (#347)**: Implemented automatic pruning of expired entries in `sessionPins` and reset-credit `challenges`.

## 0.6.15

### Fixed
- **Settings reachable again on the plugin's own page**: the current DSH core
  (0.1.6-alpha.2) renders a plugin's configuration page only for entries registered
  in the plugin-list seat `plugins.item`. The view-aware card is now registered there
  (`id: 'dsh-subscriptions'`, order 60, static label); the row seat and the legacy
  `settings.plugin.item` card stay as fallbacks.

## 0.6.14

### Fixed
- **Settings reachable again**: the card registered into `settings.plugin.item`, a
  slot the current DSH core (0.1.6-alpha.2) no longer renders, so the plugin's
  settings were unreachable. The surface now registers into the Plugins page row
  seat `plugins.row.config`, keyed
  `@goodandready/dsh-subscriptions#dsh-subscriptions`
  (`rowConfigKey(package, rowId)`): the plugin's row gains a configure control whose
  page is the settings form (`view: 'page'`, open and without our card chrome — the
  host page draws the title, icon, crumb and padding) plus a one-line state for
  `view: 'summary'`. The legacy seat stays registered as a fallback for older cores.

### Added
- This changelog.
