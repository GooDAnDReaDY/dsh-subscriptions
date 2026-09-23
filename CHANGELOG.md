# Changelog

Notable changes to `@goodandready/dsh-subscriptions`.

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
