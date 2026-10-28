## [0.7.43] - 2026-10-28

### Tests
- **#837**: added account-route branch tests; `lib/routes/accounts.js` coverage is 90.96%.
- **#837**: added message-adapter cases for tool-call aliases and orphan reconciliation; `lib/messages.js` coverage is 93.38%.
- Global coverage is 87.44% lines / 74.23% branches / 80.80% functions.

## [0.7.42] - 2026-10-28

### Added
- **#798**: npm metadata resolver for Codex/Claude client versions with local-CLI and built-in fallback, 6h cache, config override, and a source badge in Settings.
- **#815**: Codex subscription search registered through the host `web` seam as `subscriptions-codex`, with citations, retry policy and bounded text.

### Changed
- **#816**: tool-call IDs (including `toolUseId`) and settings RPC results now go through one compatibility layer; unsupported settings APIs raise `DSH_HOST_INCOMPATIBLE`.

### Verification
- Full `npm test` green; coverage gates pass; pack-size OK (client 251588 B).

## [0.7.41] - 2026-10-28

### Fixed
- **#803**: `proxyBypass` is now applied by the real per-account fetch path; matching hosts go direct while other requests keep the proxy.
- Accounts advanced settings expose a comma-separated proxy-bypass field; slot normalization and account views preserve it.

### Verification
- Full `npm test`: 1006/1006; coverage gates pass; pack-size OK (client 250939 B).

## [0.7.40] - 2026-10-28

### Added
- **#803**: per-account `proxyBypass` config, host/domain bypass matching and proxy-vs-provider connectivity classification.
- **#817**: validated named tiers with isolated member selection and no cross-tier fallback.
- **#832**: frozen session tool-policy snapshots with session lookup.
- **#834**: explicit Claude `cli-synced` vs `standalone` modes and Keychain write ownership guard.
- **#815**: Codex web-search result normalization with citations, bounded text and retry-delay policy.

### Verification
- Full `npm test`: 1006/1006; coverage gates pass; pack-size OK.

## [0.7.39] - 2026-10-28

### Added
- **#787**: true per-pool round-robin cursor, lowest-latency strategy by local telemetry, and trace decision reasons (`round_robin`, latency ordering).
- **#788**: provider-scoped `modelAccountRules` glob rules; first match wins, rule account is preferred, unavailable rule accounts fall back to the normal pool.
- **#798**: client-version resolver with config/npm/local/fallback precedence and TTL cache helpers.
- **#816**: centralized compat aliases for tool-call ids, RPC result shapes and unsupported-host errors.
- **#837**: Node coverage is part of `npm test` with global thresholds (lines 85, branches 70, functions 75); CI now fails below them.

### Verification
- Full `npm test`: 1001/1001; coverage gates pass; pack-size OK (client 250268 B).

## [0.7.38] - 2026-10-28

### Fixed
- **GitHub #27**: Grok model resolution no longer treats a failed CLI metadata fetch as a capability verdict. The resolution path uses the per-account last-known-good catalog and does not perform a live metadata fetch on every request.
- The CLI catalog cache keeps the previous snapshot on transport failure or empty response, and grok-4.x gets a conservative high/medium/low reasoning fallback when metadata is unavailable.
- Streaming and resolution now share the same fallback, so an explicit effort no longer silently disappears.

### Verification
- Full `npm test`: 995/995; pack-size OK.
- Regression covers unreachable CLI metadata and the grok-4.x heuristic.

## [0.7.37] - 2026-10-28

### Added
- **#822**: media failure taxonomy and retry policy; ambiguous post-submit failures are never retried.
- **#800**: conservative media-pool account selection with default preference and cooldown/quota/disabled filtering.
- **#809**: per-provider tool policy config (`toolPolicies`) and allow checks.
- **#835/#836**: safe provider icon URL resolution with initials fallback and URL allowlisting.

### Verification
- Full `npm test`: 993/993; pack-size OK (client 250268 B).

## [0.7.36] - 2026-10-28

### Added
- **#790**: per-provider batch Check all / Refresh quotas / Import all CLI with bounded concurrency (2), live progress and cancel.
- **#791**: Vision / Tools / Thinking capability badges on account cards.
- **#794**: account reorder with up/down controls; order persists through Save.
- **#793**: copy account ref quick action alongside existing pause/reset/check actions.
- **#808**: reset-credit panel already exposes expiry, confirmation and refresh; covered by the existing flow.

### Verification
- Full `npm test`: 989/989; pack-size OK (client 250268 B).

## [0.7.35] - 2026-10-28

### Changed
- Refactored the client bundle: Vault snapshots, provider packs, source chain and webhook test panels now load on demand from `lib/client.panels.js` via `require.async` and React.lazy.
- Main client bundle dropped from 255971 B to 245247 B, restoring headroom for UI work while keeping the 256000 B practical gate.

### Verification
- Full `npm test`: 988/988; pack-size OK (main client 245247 B, panel chunk 11554 B).
- No behavior change intended; panel tests read both bundles.

## [0.7.34] - 2026-10-28

### Added
- **#792**: proactive quota guard is wired through config/routing; opt-in self-heal timer probes cooling accounts and clears cooldown on success.
- **#810**: prompt-cache TTL/affinity is wired through config, `lastUsedAt`, routing scores and trace.
- **#820**: plugin HTTP calls use a per-address connect floor from config/env without lowering larger values.
- **#824**: opaque replay state is enveloped by provider/account/model, stripped on mismatch and preserved for legacy histories.
- **#838**: Settings terminology normalized from vendor to provider.

### Verification
- Full `npm test`: 988/988; pack-size OK (client 255972 B).

## [0.7.33] - 2026-10-28

### Added
- **#813**: routing now rejects accounts whose per-account catalog does not contain the requested model (`model_not_in_account_catalog`), while unknown/empty catalogs remain permissive.
- **#792**: opt-in proactive quota guard with remaining/low and zero states before a request.
- **#810**: prompt-cache affinity scoring helper with configurable TTL and cache-expired states.
- **#820**: connect-attempt timeout normalization with a 1.5s floor while preserving larger host values.
- **#824**: hashed provider/account/model replay envelope helpers; mismatched envelopes are not sent and legacy histories remain compatible.

### Verification
- Full `npm test`: 986/986; pack-size OK.
- New tests cover catalog membership, cache TTL, timeout floor, replay match/mismatch/legacy and proactive quota.

## [0.7.32] - 2026-10-28

### Fixed
- **#827**: corrupt/empty credentials are marked unusable per account instead of breaking status/list reads; errors stay token-free.
- **#818**: aliases resolve to stable refs, so renaming a label does not change credential identity.
- **#831**: duplicate provider identities are detected and exposed as `duplicateOf`; unknown identities are never merged.
- **#806**: refresh lineage guard and versioned writes are covered; stale writes cannot overwrite newer credentials.
- **#833**: deterministic host-proxy vs plugin-proxy precedence helper with conflict detection.

### Verification
- Full `npm test`: 981/981; pack-size OK.
- New tests cover credential state, identity keys, alias resolution, refresh lineage and proxy precedence.

## [0.7.31] - 2026-10-28

### Added
- **#804**: per-model display-name editor with Reset; names are presentation-only and persist in config.
- **#819**: Settings draft now has an explicit Cancel, dirty indicator and beforeunload guard; Save failure keeps the draft.
- **#805**: Accounts cards show remaining quota per account (not only the aggregate).
- **#828**: model rows expose and display catalog source (`live`/`cached`/`builtin`) as a badge.

### Verification
- Full `npm test`: 976/976; pack-size OK (client 255963 B).
- New test covers catalog source attribution.

## [0.7.30] - 2026-10-28

### Added
- **#829**: per-provider default account marker (★), separate from pool participation.
- **#830**: global automatic-pool kill switch and a separate media-pool switch. Off uses only the default account with no silent fallback.
- **#811**: `quota-aware` balancing strategy using remaining quota, reset time and urgency; default account wins within a small urgency tolerance. Trace includes urgency/default info.
- **#825**: pool-scoped earliest recovery ETA/reason attached to exhausted-pool errors and trace.
- **#814**: model-scoped cooldowns for Claude/Antigravity quota failures; auth/account-wide failures still block the whole account. Trace distinguishes `model_cooldown`.

### Verification
- Full `npm test`: 975/975; pack-size OK (client 251221 B).
- New tests cover default selection, kill switch/no fallback, urgency/default ordering, pool ETA and model-scope cooldown matrix.

## [0.7.29] - 2026-10-28

### Added
- **#797**: model catalogs are kept per account; the picker merges the account-specific snapshots and preserves which accounts can see each model.
- **#799**: startup + hourly catalog refresh with a five-minute per-account freshness guard and last-known-good retention; failures never clear the picker.
- **#828**: an empty or broken live catalog falls back to cached or built-in models instead of dropping the provider.
- **#821**: explicit `all / selected / none` allowlist modes with mode labels in Accounts.
- **#839**: search inside the account model allowlist, filtered Select all/none and shown/selected/total counters.

### Verification
- Full `npm test`: 970/970; pack-size OK (client 248617 B).
- New tests cover live/cached/builtin resolution, freshness, per-account merge attribution and the three allowlist modes.

## [0.7.28] - 2026-10-28

### Changed
- Release order is now strict: full quality gate → Gitea Release → GitHub mirror → npm → GitHub Release → automatic WEB deploy. A failed step before Gitea Release prevents it from being created; a failed Gitea Release prevents GitHub/npm/deploy.

### Verification
- Strict pipeline validated on `v0.7.27`; Gitea Release API tested against the existing tag.

## [0.7.27] - 2026-10-28

### Changed
- Release is now a single strict pipeline: the tag must be on `main`, the full quality gate and four parallel runs must pass, the GitHub mirror is updated before npm, and WEB deploy runs automatically only after npm + GitHub Release succeed.
- Manual **Deploy WEB** is now a rollback path and refuses versions without a final GitHub Release.

### Verification
- Strict workflow validated on PR #850; release and deploy smoke-tested with the 0.7.27 tag.

## [0.7.26] - 2026-10-28

### Added
- **#795**: account-scoped pool participation. Each slot now has `poolEnabled` (default true) and an optional `poolModels` allowlist. Absent means all current and future models; empty means no model routing; an explicit list allows only those ids. Selection applies the filter before quota tiers, weighting and session pinning, and trace evaluations report `pool_disabled` / `model_not_allowed`.
- Accounts → Advanced slot settings now exposes the pool toggle and a model list with Automatic / Select all / None.

### Verification
- Full `npm test`: 966/966; pack-size OK (client 246520 B).
- Tests cover absent/empty/explicit allowlists, disabled pool, trace reasons, config round-trip, store mapping and stream model propagation.

## [0.7.25] - 2026-10-28

### Added
- **#839**: the Models catalog now supports case-insensitive search by id, name, alias and provider; sorting by name, provider, context window or availability; total/matched/shown/hidden counters; and incremental "Show more"/"Show all" rendering. Search and sort keep the same selected catalog rows and do not mutate the source list.

### Verification
- Full `npm test`: 958/958; pack-size OK (client 241375 B).
- New tests cover filtering, all sort modes, stable/non-mutating ordering and counters over 120 rows.

## [0.7.24] - 2026-10-27

### Fixed
- **GitHub #26**: DSH Desktop validates `dsh-app://app`, then strips `Origin`, `Referer` and `Sec-Fetch-Site` before forwarding. Mutating requests on loopback that carry the shell's `dsh-auth-*` session cookie are now accepted as shell-forwarded; all other origin, cross-site and host checks remain unchanged.

### Verification
- Full `npm test`: 955/955; pack-size OK.
- Regression test covers desktop cookie + loopback, missing/wrong cookie, non-loopback peer, cross-site and mismatched origin.

## [0.7.23] - 2026-10-27

### Changed
- CI/CD now runs in Gitea: PR quality gate, four parallel test runs, tag-driven release, npm publish and GitHub mirror.
- Added a manual **Deploy WEB** workflow that validates the published version, deploys it to 111 over SSH, restarts `dsh-web` and waits for the health endpoint.

### Verification
- Full `npm test`: 954/954; preflight FAIL=0; four parallel runs green.
- Deploy workflow verified against `0.7.22`; WEB health reports `0.7.22`.

## [0.7.22] - 2026-10-23

### Fixed
- **PR #21 (@miztizm)**: Anthropic payloads no longer send `temperature` while thinking is enabled, never emit empty text blocks, and place the cache breakpoint only on a block that can carry it. Persistent billing statuses are announced once and re-armed when cleared.
- **PR #22 (@miztizm)**: error toasts are rate-limited per message and auto-dismiss after 12 s.
- **PR #23 (@miztizm)**: Claude CLI import reads the dotted `~/.claude/.credentials.json` first, with the undotted file as fallback and the real source path in `discover-local`.
- **PR #24 (@miztizm)**: Subscription Hub provider rows are keyboard-accessible controls and open Settings → Subscriptions.
- **PR #25 (@miztizm)**: config polling retries once and host-down toasts are throttled to once per two minutes.

### Verification
- Full `npm test`: 954/954; preflight FAIL=0; client 235667 B.

## [0.7.21] - 2026-10-23

### Fixed
- **GitHub #20**: Claude models now declare `inputModalities: ['text','image']` for built-in, configured and remotely discovered models, so DSH's `read_image` gate accepts the route.
- Durable image blocks `{type:'image', attachment}` are resolved through the host `attachments` service before request serialization and converted to Anthropic base64 blocks.
- `anthropicPayload()` now preserves images inside `role: 'tool'` results as `tool_result` content blocks instead of flattening them to text.

### Verification
- Deterministic #20 tests: modality advertisement, attachment resolution, tool-result image block.
- Full `npm test`: 949/949; preflight FAIL=0.

## [0.7.20] - 2026-10-23

### Fixed
- **GitHub #19**: `QuotaCapsule` no longer violates the Rules of Hooks. The popover `useEffect` moved above the conditional `return null`, so the hook count stays constant when config resolves or the widget is disabled.
- Added a static regression test that fails if any hook appears after the component's early return.

### Verification
- Full `npm test`; `dsh-plugin-preflight` FAIL=0.

## [0.7.19] - 2026-10-22

### Security
- **#782**: every mutating route now requires an explicit `Origin` or `Referer` matching `Host`; a loopback socket alone is no longer trusted, closing the LAN/Tailscale bridge write path.

### Fixed
- **#776**: one `numberOrNull` (null/undefined/empty string -> null); missing quota values no longer become 0% or 100%.
- **#777**: #322 tests keep the event loop alive, loopback tests use ephemeral ports, SSE #450 timing has a parallel-safe margin.
- **#778**: `npm test` now fails when any packed file exceeds 262 144 B and warns above 256 000 B.
- **#780**: DESIGN.md marks the 2026-09-10 settings decision as superseded by 2026-10-21.
- **#781**: removed `pnpm-lock.yaml`, synced the legacy DEV root, and removed test-only exports from production modules.

### Docs
- **#779**: documented all external HTTP API routes in README.md, README.ru.md and README.zh.md.

### Verification
- `npm test`: 945/945, cancelled 0.
- Four concurrent `npm test` runs: all exit 0.
- `dsh-plugin-preflight`: FAIL=0, no dead-export warning.

## [0.7.18] - 2026-10-22

### Fixed
- **#18**: subscription-native `image_generate`, `x_search`, `web_search` and `video_generate` are now **opt-in** (`nativeTools: true` or `DSH_SUBSCRIPTIONS_NATIVE_TOOLS=1`). They no longer shadow required builtin tools during boot, so `dsh-image-generation` cannot abort startup.
- Registration now also skips names already present in `ctx.tools` before calling `register`.

### Verification
- Full `npm test`: 941/941.
- `dsh-plugin-preflight`: FAIL=0.

## [0.7.17] - 2026-10-22

### Fixed
- Status header now localizes the host-latency text instead of hardcoding `Host online (... ms)`.
- Provider count now uses the localized `subsPoolTitle` label instead of `Pool: N accounts`.
- Russian UI remaining labels are covered by `dsh-russian-lang` 0.4.5 (`subsLogged`, `runSmoke`).

### Verification
- Full `npm test` pass; `dsh-plugin-preflight` FAIL=0.
- WEB 111 and Desktop updated to 0.7.17.

## [0.7.16] - 2026-10-21

### Fixed
- Settings tabs now filter panes correctly: `data-tab` is on the real root, nested groups are filtered, and Overview/Accounts hide the settings container (#770).
- Peer ranges accept DSH `0.2.1-rc.2` for credentials, host-webserver, llm and settings (#771).

### Verification
- Full `npm test`: 939/939 pass.
- `dsh-plugin-preflight`: FAIL=0.
- WEB 111 and Desktop both on DSH 0.2.1-rc.2; health/CSS verified.
## [0.7.15] - 2026-10-21

### Changed
- Settings split into Overview / Accounts / Routing / Models / Vault / Notifications / Advanced panes (#767).
- The overloaded groupRotation was split into display, sources, packs, vault and notification groups; header, Add provider, picker and save footer stay visible on every tab.

### Verification
- Full `npm test`: 938/938 pass.
- `dsh-plugin-preflight`: FAIL=0.
## [0.7.14] - 2026-10-21

### Changed
- Settings now render as a full `settings.section` page on DSH 0.2, with the legacy `plugins.item`/row seats kept as fallback (#764).
- All setting groups are collapsed by default; the status/action header stays visible.
- Add provider opens a searchable modal picker instead of an inline gallery.
- Client CSS moved to `lib/client.css` and served from `/dsh-subscriptions/client.css`; `client.js` is now 232 KB.

### Verification
- Full `npm test`: 937/937 pass.
- `dsh-plugin-preflight`: FAIL=0.
- Pack: 121 files, client.js 232 348 B, client.css 25 319 B.
## [0.7.13] - 2026-10-21

### Fixed
- Add provider gallery: clicking ChatGPT Codex (or any hidden provider) now immediately reveals its slot and Connect button instead of silently adding an invisible blank slot (#761).

### Verification
- Full `npm test`: 934/934 pass.
- `dsh-plugin-preflight`: FAIL=0.
- client.js 255 985 B.
## [0.7.12] - 2026-10-21

### Fixed
- Per-device pre-pull snapshots now restore with the key recorded at capture time; legacy snapshots fall back to the base key (#754).
- `/health` probes the actual Ollama endpoint instead of treating `ollamaFallback` as availability, and no longer performs a full account view per request (#755).
- `/oauth/headless-info` requires same-origin/loopback and rejects non-http(s) URLs; query host/user are ignored (#756).
- `npm run typecheck` is green and runs as part of `npm test` (#757).
- New Sources/packs/snapshots/webhook UI strings use en/zh locale keys (#758).

### Verification
- Full `npm test`: 933/933 pass (includes typecheck).
- `dsh-plugin-preflight`: FAIL=0.
- `npm pack`: client.js 255 965 B (below 256 000 practical threshold).
## [0.7.11] - 2026-10-21

### Added
- Per-device vault keys: stable device id, derived passphrase, device-suffixed WebDAV/Gist/S3 objects, legacy shared vault fallback (#749).
- `dsh-subscriptions tui [--once]`: ANSI dashboard with health, accounts, sources and vault snapshots; r refresh, q quit (#750).
- `webhookFormat: native | notify` with dsh-plugin-notify compatible `{kind,title,sessionId,summary,reason}` payloads (#751).

### Verification
- Full `npm test`: 926/926 pass.
- `dsh-plugin-preflight`: FAIL=0.
## [0.7.10] - 2026-10-21

### Added
- Prometheus `GET /dsh-subscriptions/metrics`: configured/usage/cooldown gauges, selected source, request and alert counters (#744).
- Source-aware `/health`: connected accounts, key-rotation, Ollama, webhook, snapshots; `healthy|degraded` (#745).
- `/diagnostics` includes source chain and vault snapshot stats; `doctor` prints snapshots (#746).

### Verification
- Full `npm test`: 919/919 pass.
- `dsh-plugin-preflight`: FAIL=0.
## [0.7.9] - 2026-10-21

### Added
- Durable vault snapshots at `DSH_HOME/storages/dsh-subscriptions/vault-snapshots.json` (temp+rename, 0600, corrupt-file tolerant) (#739).
- 2MB byte budget with oldest-first eviction and `stats()` (#740).
- Snapshot stats in `/vault/snapshots`, CLI `vault status`, and the settings panel (#741).

### Verification
- Full `npm test`: 915/915 pass.
- `dsh-plugin-preflight`: FAIL=0.
## [0.7.8] - 2026-10-21

### Added
- Bounded encrypted vault snapshot store; every pull captures a `pre-pull` snapshot (#734).
- GET/POST `/vault/snapshots` and POST `/vault/snapshots/restore` with revision/CAS (#735).
- CLI `vault snapshots`, `vault snapshot [label]`, `vault restore <id>` (#735).
- Vault snapshots settings panel with create/restore (#736).

### Verification
- Full `npm test`: 912/912 pass.
- `dsh-plugin-preflight`: FAIL=0.
## [0.7.7] - 2026-10-21

### Security
- Webhook URLs reject userinfo, non-http(s) schemes and loopback/private/link-local/CGNAT hosts by default; `webhookAllowPrivate` is the explicit opt-in (#729).

### Added
- POST `/dsh-subscriptions/webhook/test` and a Send test button with delivered/failed feedback (#730).
- Quota widget candidate popover: source availability, cooldown and healthy-key counts, plus Open settings (#731).

### Verification
- Full `npm test`: 907/907 pass.
- `dsh-plugin-preflight`: FAIL=0.
## [0.7.6] - 2026-10-21

### Added
- Provider packs settings panel: list, paste JSON, server-side validation, revisioned save and masked export (#724).
- Webhook URL, Webhook secret and Digest interval fields in settings (#725).

### Fixed
- Restored the expiry warning hint after the notification fields landed (#725).

### Performance
- Key-rotation status reads use a 10s TTL cache with in-flight de-duplication and an explicit bypass (#726).

### Verification
- Full `npm test`: 902/902 pass.
- `dsh-plugin-preflight`: FAIL=0.
## [0.7.5] - 2026-10-21

### Fixed
- `/dsh-subscriptions/sources` read a non-existent `hasToken` field, so every OAuth account was reported unavailable and no source was selected. It now reads `configured` (#709, #716).

### Verification
- Full `npm test`: 892/892 pass.
- `dsh-plugin-preflight`: FAIL=0.
## [0.7.4] - 2026-10-21

### Added
- Read-only `dsh-key-rotation` bridge and `GET /dsh-subscriptions/sources`: OAuth → API key → Ollama, health/cooldown, no key values and no duplicate rotation (#709).
- Sources panel in Subscriptions settings (#713).
- `sources` CLI command with `--json` (#714).
- Source badge in the floating/docked quota widget (#715).
- `config` and `set <dot.path> <value>` CLI commands with revision/CAS (#710).

### Fixed
- Floating quota widget now persists its position across reloads (#711).

### Verification
- Full `npm test`: 891/891 pass.
- `dsh-plugin-preflight`: FAIL=0.
## [0.7.3] - 2026-10-21

### Added
- DSH market metadata (bilingual name/description, category, tags, default providers) and a repeatable listing checklist (#693).
- Data-only provider pack SDK: `normalizeVendorPack`/`registerVendorPack`, `providerPacks` config and docs; no eight-file vendor edit (#694).
- Headless/remote `dsh-subscriptions` CLI (`status`, `usage --csv`, `fast`), overlay example and docs (#695).
- Floating/docked quota capsule with off/docked/floating modes and pointer dragging (#688).
- Vault v2: conflict-reporting slot merge, provider allowlist for selective sync, encrypted snapshots/restore (#691).
- Signed (`x-dsh-signature`) and retrying webhook delivery with 24h notification digest (#696).

### Changed
- Key ownership is explicit: `dsh-key-rotation` owns API-key pools and cooldowns; this plugin owns OAuth subscriptions. No duplicate rotation (#689).

### Verification
- Full `npm test`: 880/880 pass.
- `dsh-plugin-preflight`: FAIL=0.
## [0.7.2] - 2026-10-21

### Fixed
- Native tools declare the host-required output schema/render (#683).
- Duplicate tool names owned by other DSH plugins no longer abort activation (#683).

### Packaging
- 0.7.0 and 0.7.1 were tagged but not published: 0.7.0 failed the tool output contract, 0.7.1 hit duplicate x_search. 0.7.2 is the first working 0.7.x npm release.

### Verification
- Full `npm test`: 869/869 pass.
- `dsh-plugin-preflight`: FAIL=0.

## [0.7.1] - 2026-10-21

### Fixed
- Native tools now declare the host-required output { schema, render }; 0.7.0 failed to activate with "tool image_generate must declare output" (#683).

### Added
- read-only /usage with accounts and calls, JSON or CSV, including quota source, age, reset and health (#687).
- modelPlans and plan-aware picker filtering, with plan metadata on models (#690).
- credential-free route/billing/quota-confidence report in /diagnostics (#692).

### Packaging
- 0.7.0 was tagged but never published to npm because the tool contract prevented activation. Use 0.7.1.

### Verification
- Full `npm test`: 868/868 pass.
- `dsh-plugin-preflight`: FAIL=0.

## [0.7.0] - 2026-10-21

### DSH-native Parity
- Per-model display names, hidden models, context-window overrides and reasoning defaults; session-scoped Codex Speed with /fast (#681).
- Composer quota follows the provider of the current model and can be hidden from the status bar (#682).
- Native tools: image_generate (saved workspace files), x_search, web_search and video_generate submit (#683).
- Rate-limit waits use only a disclosed reset; retryAfterMs/resetAt flow to dsh-llm-retry with a bounded max wait (#684).
- Settings show connected providers first, hide the rest behind Add provider, and expose VIP/Pro/tags/weight/queue per slot (#685).
- Conflicting DSH subscription plugins are detected, logged and exposed in /diagnostics (#686).

### Behavior changes
- A 429 without a disclosed reset no longer parks the account for a guessed 2-24h vendor window; local backoff applies.
- `tools` is now a required injected service for the native media tools.

### Verification
- Full `npm test`: 863/863 pass.
- `dsh-plugin-preflight`: FAIL=0.

## [0.6.91] - 2026-10-20

### Security
- The OAuth callback trust-checks non-navigation requests; top-level provider redirects still work (#606).

### Packaging
- 0.6.90 was normalized by npm to 0.6.9 (trailing zero), so an exact 0.6.90 install does not exist and 0.6.9 sorts below 0.6.89. 0.6.91 supersedes both; do not use 0.6.90 or 0.6.9.

### Verification
- Full `npm test`: 850/850 pass.
- `dsh-plugin-preflight`: FAIL=0.

## [0.6.90] - 2026-10-20

> Packaging note: npm normalized this version to 0.6.9; it is superseded by 0.6.91.

### Security
- The OAuth callback now trust-checks non-navigation requests: top-level provider redirects still work, but cross-site fetch/subresource attempts are rejected with 403 (#606).

### Verification
- Full `npm test`: 850/850 pass.
- `dsh-plugin-preflight`: FAIL=0.

## [0.6.89] - 2026-10-20

### Client and Vendor Cleanup
- Settings navigation uses pluginNavigation.openBundle; the DOM scraper, label guessing and poll chains are removed (#624).
- Quota bars, LED/tag thresholds, clock padding and mm:ss formatting share one set of helpers (#626).
- The grok gRPC-web protobuf decoder and its optional credits fallback are removed; usage reads the billing JSON only (#630).
- Built-in provider ids, display names and isProvider now come from one registry shared by refs and vendors (#632).
- fetchWithTimeout returns the native Response; the res.json/res.text monkey-patching is removed and the request-wide AbortSignal enforces the body deadline (#633).

### Deferred (closed as not planned)
- #623 (split the 2040-line SubsSection) — architecture-only, needs an interactive UI harness.
- #627 (five PluginCard registrations) — distinct host slots/keys required for DSH 0.1/0.2 compatibility, not duplication.
- #629 (vendor factory for 12 OpenAI adapters) — needs per-vendor integration tests; deferred to a dedicated task.

### Verification
- Full `npm test`: 849/849 pass.
- `dsh-plugin-preflight`: FAIL=0.

## [0.6.88] - 2026-10-20

### Reliability and Cleanup
- VIP/tags/weight/isPro are persisted in Slot and returned by listAccounts (#591).
- Vendors return null instead of fabricated usage snapshots (#619).
- Vendors no longer mutate the caller's credential blob (#621).
- Outbound header values are sanitized for CRLF and non-Latin1 input (#622).
- Removed the unused sessions service from client inject (#628).
- Removed 43 dead translation keys, added missing lang/error/settingsError, and added a key-parity test (#635).
- Locale detection uses the lang key instead of translated prose (#614).
- The composer forecast uses the server analytics.forecast instead of a client EWMA (#625).
- Plugin-settings DOM polling is generation-guarded so a new navigation cancels old chains (#610).
- Alert, status and vault failures are surfaced instead of rendered as empty state (#612).

### Verification
- Full `npm test`: 847/847 pass.
- `dsh-plugin-preflight`: FAIL=0.

## [0.6.87] - 2026-10-20

### Breaking Changes
- The backup API exposes only `/dsh-subscriptions/vault/export` and `/vault/import`; the legacy `/export`, `/import`, `/export-backup` and `/import-backup` routes were removed (#599).

### Reliability and UI
- Config reload aborts stale requests and ignores out-of-order responses (#608).
- Client state timers are tracked and cleared on unmount (#609).
- Clipboard writes are awaited and caught (#611).
- Added the missing cancel/quota/subs5hWindow translations (#613).
- The proxy prefix ends with a slash, so /proxy-check keeps its own handler (#601).
- Custom vendor ids cannot collide with built-ins (#617); invalid profiles are skipped individually (#618).
- The updater reuses the shared request-trust policy (#634).
- Removed no-op vendor usage()/check fields (#631).

### Verification
- Full `npm test`: 836/836 pass.
- `dsh-plugin-preflight`: FAIL=0.

## [0.6.86] - 2026-10-20

> 0.6.85 was not published to npm because the registry kept a staged-version tombstone after the first publish attempt. 0.6.86 contains the same code and is the published artifact.

### Reliability and Security
- OAuth Connect opens its popup before the first await and keeps a fallback link; the slash command copies the URL when a popup is blocked (#595).
- ERNIE access_token is URL-encoded in the v1 chat URL (#636).
- Loopback parsing validates IPv4 octets; the updater uses the same rule (#603).
- /logout validates provider and index before clearing a credential ref (#607).
- /history relies on isTrustedSettingsRequest instead of re-checking Host (#602).
- SSE parsing caps the buffer at 8 MB and enforces a 10-minute deadline (#604).
- Claude billing fallback keys are sha256-based (#615).
- vendor-factory rethrows 401/403 from listModels (#616).
- Vendor error bodies are read with a 4 KB cap (#605).
- Copilot CLI removes its abort listener and escalates to SIGKILL (#620).

### Verification
- Full `npm test`: 826/826 pass.
- `dsh-plugin-preflight`: FAIL=0.

## [0.6.84] - 2026-10-20

### Security and Reliability
- Copilot CLI paths are restricted to copilot binaries (#573, breaking).
- Client links and images require http/https/dsh-app; data:image is allowed only for images (#586).
- Status vendor probes are bounded by a 15s vendorFetch timeout (#582).
- The diagnostic wizard uses canonical vendor signatures and a real proxy HEAD (#597).
- Vault exports use the package version; imports reject future majors (#598).

### Configuration and UI
- monthlyCost and per-account maxQueueSize are part of the Slot schema; monthlyCost is editable in the slot UI (#590, #592).
- Removed the dead INSTRUCTIONS branch (#593).
- The device polling effect has dependencies and handles errors (#594).
- Slot updates are functional and keyed by provider and index (#596).

### Breaking Changes
- `copilotCliPath` must point to a `copilot`, `github-copilot-cli` or `copilot-cli` binary; rename custom wrappers.

### Verification
- Full `npm test`: 813/813 pass.
- `dsh-plugin-preflight`: FAIL=0.

## [0.6.83] - 2026-10-20

### Security Hardening (Audit Batch 2)
- **OAuth and request trust**:
  - JetBrains and Perplexity require a real PKCE challenge and state (#576).
  - Antigravity requires an explicit client secret; the embedded default was removed (#577).
  - The headless redirect requires a trusted request and posts state only to a validated origin (#579).
  - Loopback settings requests pin Host to loopback or configured hosts (#572).
  - Sandboxed CLI discovery no longer reads the real Windows Credential Manager (#581).
- **Imports and settings**:
  - Imported credential blobs are validated before saving (#584).
  - Import and vault sync pass the settings revision they read (#585).
- **Vendors and proxy**:
  - Copilot CLI launches `.cmd` shims on Windows (#588).
  - Copilot stderr is capped and GitHub tokens are redacted (#589).
  - The proxy allowlist covers all built-in providers (#600).

### Breaking Changes
- Antigravity CLI imports must configure `antigravityClientSecret`; the embedded default no longer exists.

### Verification
- Full `npm test`: 802/802 pass.
- `dsh-plugin-preflight`: FAIL=0.

## [0.6.82] - 2026-10-20

### Security Hardening (Audit Fixes #568-#587)
- **OAuth and token transport**:
  - ERNIE token exchange sends client credentials in the request body instead of the URL (#568). The inference access token is tracked separately in #636.
  - Custom vendor config objects are no longer forwarded as HTTP headers (#569).
  - Settings `masterKey` now encrypts credentials at rest and matches `isEncryptedAtRest` (#570).
  - Custom vendor `authUrl`/`tokenUrl`/`baseUrl` require HTTPS; plain HTTP is allowed only for loopback hosts (#571).
- **Copilot CLI**:
  - Model ids are validated before argv construction, preventing flag injection (#574).
  - `stdin` EPIPE is handled without crashing the host (#583).
- **Grok**:
  - Bearer tokens are sent only to trusted xAI hosts (`api.x.ai`, `grok.com`/`*.grok.com`, loopback) (#575).
  - The CLI catalog cache is capped at 32 entries and keyed by `sha256(token)` (#587).
- **Diagnostics and OAuth state**:
  - Error buffer, diagnostics report and wizard redact Bearer tokens, API keys, JWTs and `key=value` credentials (#578).
  - Expired pending OAuth states are swept on start and every 60 seconds (#580).

### Breaking Changes
- Custom vendor endpoints using non-loopback `http://` must switch to `https://`.
- Grok `baseUrl` overrides must point to `api.x.ai`, `grok.com`/`*.grok.com`, or a loopback host.

### Verification
- Full `npm test`: 792/792 pass.
- `dsh-plugin-preflight`: FAIL=0.

## [0.6.81] - 2026-10-18

### Added & Enhanced (Issue #563 - Perplexity Pro & JetBrains AI Subscription OAuth Integration)
- **Perplexity Pro Subscription OAuth (Issue #563)**:
  - Integrated OAuth 2.0 PKCE authentication flow for Perplexity Pro accounts (`authorizeUrl`, `exchangeCode`, `refresh`).
  - Added discovery and catalog for official Perplexity models: `sonar-reasoning-pro` (with low/medium/high reasoning effort support), `sonar-pro`, `sonar-reasoning`, `sonar`, and `r1-1776`.
  - Added Pro plan decoration, profile avatar, and token usage endpoint integration.
  - Added token pricing rates in `lib/pricing.js` for value delivered calculations.
- **JetBrains AI Assistant Subscription Integration (Issue #563)**:
  - Direct OAuth PKCE authentication flow with JetBrains Accounts for AI Assistant subscribers.
  - Registered official JetBrains AI models: `jb-claude-3.5-sonnet`, `jb-claude-3.7-sonnet` (with reasoning efforts), `jb-gpt-4o`, `jb-o3-mini`, and `jb-deepseek-r1`.
  - Added user license check, license decoration, and `IntelliJ-IDEA` User-Agent forwarding.
- **Capability Matrix & Slot Lifecycle**:
  - Registered `perplexity` (200K context, low_med_high reasoning, tools) and `jetbrains` (200K context, budget reasoning, vision, tools) in `PROVIDER_CAPABILITIES`.
  - Added plan badges `[Pro]` and `[AI Assistant]` in WebUI slot cards.

## [0.6.80] - 2026-10-18

### Added & Enhanced (Issues #557 & #562 - Headless Auth Helper with SSH Port Forwarding & Automated Encrypted Vault Sync)
- **Headless Auth Helper with Auto-Generated SSH Port Forwarding & Terminal/Web QR Code (Issue #557)**:
  - Added SSH port forwarding command generator in `lib/headless-auth.js` (`generateSshTunnelCommand`) that computes the exact copyable command (`ssh -N -L <port>:127.0.0.1:<port> user@<host>`) using actual remote port and request origin host.
  - Implemented zero-dependency pure JavaScript QR Code generator (Byte Mode, ECC Level L, Versions 1-10) with terminal ANSI half-block rendering (`renderAsciiQr`) and inline SVG/Data URL rendering (`renderSvgQr`, `renderSvgDataUrl`).
  - Automatically emits ASCII QR code in terminal/journal logs on device authorization flows and renders high-contrast inline QR code in WebUI modal for mobile/camera scanning.
  - Added dedicated headless callback relay route `GET /dsh-subscriptions/oauth/headless-redirect` to complete OAuth exchanges and return postMessage/copyable code fallback.
  - Added WebUI 1-click "Copy SSH Command" button and expandable headless tips in Connect modal.
- **Automated Encrypted Vault Sync via WebDAV, S3, or Private Gist (Issue #562)**:
  - Supported automated remote encrypted backup and synchronization to WebDAV (Nextcloud, ownCloud, NAS), secret GitHub/Gitea Gists, and S3-compatible object storage (AWS S3, MinIO, Cloudflare R2) using native SigV4 signing.
  - Added `vaultSync*` configuration options in `Config` schema with automatic credential masking (`••••••`) and restoration in `publicConfig` and `restoreMaskedSecrets`.
  - Added background periodic synchronization loop in `lib/index.js` and optional automatic push after successful OAuth logins/refreshes (`vaultSyncAutoPush`).
  - Added management endpoints `POST /dsh-subscriptions/vault/sync/push`, `POST /dsh-subscriptions/vault/sync/pull`, and `GET /dsh-subscriptions/vault/sync/status`.
  - Added interactive "Automated Remote Vault Sync" controls and live status in the WebUI Vault modal.

## [0.6.79] - 2026-10-17

### Added & Enhanced (Issues #556, #558, #559, #561 - Capabilities Matrix, Billing Cycle Notifier, Pacing Runway & Value Delivered Counter)
- **Subscription Capability Matrix & Request Normalizer (Issue #556)**:
  - Introspected model & subscription tier capabilities: context window limits (128K, 200K, 500K Team, 1M, 2M Ultra), thinking modes, multimodal vision, and function tools.
  - Implemented adaptive request normalization in `lib/capabilities.js` and `streamWithRotation`: automatically clamps `maxTokens` and strips unsupported tools or reasoning parameters to prevent HTTP 400 Bad Request errors.
  - Rendered interactive capability badges on WebUI slot cards (`[500K Context] [Adaptive Thinking] [Vision] [Tools]`).
- **Billing Cycle Renewal Countdown & Payment Notifier (Issue #558)**:
  - Extracted billing cycle reset timestamps from token metadata and computed human-readable renewal countdown (`📅 Renews in X days (YYYY-MM-DD)` / `📅 Renews today`).
  - Added payment failure detector: identifies `past_due`, `unpaid`, and `payment_failed` statuses, rendering warning badge `⚠️ Payment Failed` / `⚠️ Renewal Overdue`.
  - Dispatches automated webhook alerts 48h/24h before expiry and immediately upon billing failures via `notifyBillingAlert`.
- **Quota Pacing Runway & Sliding Window Burn Predictor (Issue #559)**:
  - Real-time runway duration estimator (`calculatePacingRunway`) combining sliding window velocity and remaining quota percent.
  - Added color-coded pacing status indicators in WebUI: green `⏱️ Runway: Sustainable` / `> 2.5h`, yellow `⏱️ Runway: ~1h` (elevated), red `⏱️ Runway: < 15m` (critical).
  - Exposed runway metrics (`runwayMs`, `runwayText`, `pacingStatus`) in `/dsh-subscriptions/analytics` and slot view.
- **Subscription Value Delivered & API Cost Equivalent Counter (Issue #561)**:
  - Built official token pricing registry in `lib/pricing.js` for Claude 3.7 Sonnet, GPT-4o, o1, Grok, and Gemini models.
  - Computed monetary value delivered from prompt, completion, and cache tokens vs $20/mo flat subscription fee.
  - Rendered ROI widget in WebUI (`📊 $64.20 (3.2x ROI)`) and included value delivered metrics in telemetry and analytics.

## [0.6.78] - 2026-10-17

### Added & Enhanced (Issues #555 & #560 - Per-Slot Concurrency Queue & Atomic Refresh Mutex with Clock Drift Compensation)
- **Per-Slot Concurrency Queue & Stream Throttle Guard (Issue #555)**:
  - Added `maxConcurrency` configuration per slot in `Slot` schema, defaulting to 1 for consumer OAuth subscription safety.
  - Updated default `accountMaxConcurrency` from 2 to 1 in plugin config to protect against 429 rate limit triggers.
  - Preserved slot-level `maxConcurrency` during normalization, listing, and stream rotation.
  - Real-time stream tracking exposed on accounts view (`activeStreams`, `queuedStreams`, `maxConcurrency`).
  - Added interactive per-slot concurrency limit control (`⚡ 1`) and live badge (`⚡ N active · ⏳ M queued`) in WebUI slot cards.
- **Atomic Token Refresh Mutex Singleflight & Clock Drift Compensation (Issue #560)**:
  - Implemented singleflight mutex guarantee in `ensureFresh` deduplicating concurrent refresh calls for the same account into a single upstream request.
  - Dynamic server-to-vendor clock drift compensation: parses upstream HTTP `Date` header, tracks offset in ms, and adjusts local expiry calculations accordingly.
  - Expanded proactive refresh safety margin to 5 minutes (`300_000 ms`) with drift adjustment.
  - Integrated transient failure backoff to protect against tight retry loops and avoid slamming vendor OAuth token endpoints.

## [0.6.77] - 2026-10-16

### Added & Enhanced (Issue #550 - Encrypted Vault Backup/Restore & Credentials Encryption at Rest)
- **Encrypted OAuth Vault Backup & Restore**:
  - Export all active subscription account slots and OAuth credential blobs into an encrypted portable archive (`dsh-subscriptions-vault.enc`).
  - Strong AES-256-GCM encryption with user passphrase and PBKDF2/scrypt key derivation.
  - WebUI modal with 1-click file download and file upload input, allowing seamless migration across DSH instances.
- **Credentials Encryption at Rest**:
  - Optional encryption for local credential store on disk using master key (`DSH_SUBSCRIPTIONS_MASTER_KEY` environment variable or `config.masterKey`).
  - Automatically encrypts sensitive token fields at rest with AES-256-GCM and transparently decrypts upon access.
  - Exposes `isEncryptedAtRest` on accounts view and renders security status badge `🔒 Encrypted at Rest (AES-256-GCM)` in WebUI.
  - Masks `masterKey` in public configurations.

## [0.6.76] - 2026-10-16

### Added & Enhanced (Issue #549 - Rolling Quota Window Countdown & Multi-Tenant Organization Switcher)
- **Subscription Rolling Window Countdown Timer**:
  - Exact rate-limit reset boundary resolution across vendor headers (`Retry-After`, `x-ratelimit-reset`, Anthropic rolling 5-hour window, Codex 3-hour window).
  - Real-time countdown computation (`formatRollingCountdown`, `computeEffectiveResetAt`) displayed as `⏳ Window resets at HH:MM (in Xm · MM:SS)` with live ticking.
  - Rendered in slot card status header and exposed in `accountsView` (`resetAt`, `resetCountdown`, `resetWindowMs`).
- **Team & Enterprise Workspace / Organization Selector**:
  - Automatically extract and list organizations and workspaces from OAuth tokens and profile endpoints in `lib/jwt.js` (`organizationsFromToken`) and vendor profile hooks.
  - Multi-tenant organization switcher on account cards for ChatGPT Team/Enterprise, Claude Team/Enterprise workspaces, Google Antigravity project IDs, and Copilot enterprise organizations.
  - Dedicated endpoint `POST /dsh-subscriptions/accounts/switch-organization` dynamically switches active organization/workspace and immediately synchronizes live provider adapters.
  - Outgoing vendor requests include corresponding organization headers (`chatgpt-account-id`, `OpenAI-Organization`, `anthropic-organization-id`, `x-anthropic-organization`).

## [0.6.75] - 2026-10-16

### Added & Enhanced (Issue #548 - Proactive OAuth Health Probe & Zero-Downtime Invalidation Cascade)
- **Zero-Downtime Cascade on Mid-Flight Token Invalidation**:
  - Enhanced `isAuthError` in `lib/rotate.js` to identify HTTP 401, `TOKEN_REVOKED`, `invalid_grant`, and remote session terminations.
  - Transparent failover in `lib/stream-rotate.js`: when an account encounters mid-flight invalidation before output tokens are emitted, it marks the account in `SESSION_REVOKED` quarantine and immediately cascades to the next healthy account of the same vendor without breaking the chat session.
- **Proactive OAuth Refresh Token Health Probe**:
  - Hardened background probe loop in `lib/index.js` to proactively test refresh tokens via `store.ensureFresh` and `vendor.check`.
  - Automatically flags expired/revoked credentials with `store.recordBroken` and `SESSION_REVOKED` quarantine before user prompts fail mid-chat.
  - Dispatches webhook notifications via `notifySessionExpired`.
- **Prominent Status Warning Badge & 1-Click Re-Auth**:
  - Exposes `isRevoked` and `authWarning` in `lib/accounts.js:describeRef` and `lib/accounts-view.js`.
  - Renders red status badge `⛔ Revoked / Expired` and inline warning banner with direct 1-click `🔄 Re-authenticate now` button in WebUI.

## [0.6.74] - 2026-10-16

### Added & Enhanced (Issue #547 - Subscription Profile Identity, In-Place Re-Auth & OAuth Scope Health Inspector)
- **Subscription Profile Identity**:
  - Automatically extract and display authenticated user email, avatar/initials, and subscription plan tier (`Pro`, `Team`, `Max`, `Enterprise`, `Ultra`, etc.) on account cards.
  - Added JWT token claims decoders in `lib/jwt.js` (`decodeJwtPayload`, `chatgptAccountId`, `emailFromToken`, `planFromToken`, `avatarFromToken`, `scopesFromToken`).
  - Supported avatar rendering (fallback to initials circle) and email display in WebUI with full `privacyMask` protection (`pmE`).
- **In-Place 1-Click Re-Authentication**:
  - Dedicated re-authenticate actions for active slot refs (`REF_OAUTH_N`) that preserve existing slot metadata and credentials while refreshing OAuth authorization.
  - Completing re-auth clears any active cooldowns, quarantines, and cached refresh failure states (`store.clearRefreshFailure`, `store.clearCooldown`, `store.recordSuccess`).
  - Added direct inline `🔄 Re-authenticate now` button inside token refresh failure banners.
- **OAuth Scope Health Inspector**:
  - Added `lib/scope-inspector.js` validating granted token scopes against provider requirements (`REQUIRED_SCOPES` for Codex, Claude, Antigravity, Copilot, Grok).
  - Displays visible warning banner (`⚠️ OAuth scope warning`) with 1-click `🔄 Re-grant scopes` button when critical vendor permissions are missing.

## [0.6.73] - 2026-10-14

### Security & Hardening (Defense-in-Depth Audit #545)
- **OAuth Loopback Callback Path Boundary**:
  - Replaced prefix matching (`startsWith(path)`) in `lib/loopback.js` with boundary-aware path verification (`url.pathname === path || (path.endsWith("/") ? url.pathname.startsWith(path) : url.pathname.startsWith(path + "/"))`).
  - Off-path requests (e.g. `/auth/callback_evil`) now return HTTP 404 without consuming the one-shot OAuth slot or prematurely closing the loopback listener.
- **Desktop Scheme (`dsh-app:`) Hardening**:
  - Restricted allowed hosts for custom desktop protocol (`dsh-app:`) in `lib/http.js` to `app` and `localhost`.
  - Added strict remote socket verification: `dsh-app:` requests originating from non-loopback network sockets are immediately rejected (HTTP 403) before connection service delegation.
- **Plugin Updater Origin Verification**:
  - Hardened `isTrustedUpdateRequest` in `lib/updater.js` to check `Sec-Fetch-Site: cross-site` and validate `Origin` against `Host` before honoring the fast-path `x-dsh-plugin-update: 1` header on loopback.
- **Vendor Proxy Path Traversal Containment**:
  - Added backslash containment in `lib/routes/proxy.js` (`invalid path`, HTTP 400).
  - Verified and pinned vendor host containment in `subscriptions.request()` so vendor requests cannot escape declared vendor endpoints.

## [0.6.72] - 2026-10-13

### Added & Enhanced (Vendor Auth Doctor, Latency Ping, Model Sync & Client Modularization)
- **Vendor Auth Doctor (#543)**:
  - Added `lib/doctor.js` with comprehensive classification of authentication and network failures (`GEO_BLOCKED`, `TOKEN_EXPIRED`, `TOKEN_REVOKED`, `MISSING_SCOPE`, `QUOTA_EXHAUSTED`, `RATE_LIMIT`, `PROXY_ERROR`).
  - Integrated diagnosis verdicts and actionable recommendations into test connection responses and WebUI account cards.
- **Latency RTT Indicator & Fast Ping Probe (#542)**:
  - Real-time round-trip latency measurement to provider APIs with colored badges (`🟢 <250ms`, `🟡 <750ms`, `🔴 >750ms`).
  - Added dedicated `POST /dsh-subscriptions/ping` endpoint and wired latency grading into `/smoke` test responses.
- **Dynamic Model Catalog Discovery & Sync (#541)**:
  - Added `POST /dsh-subscriptions/accounts/sync-models` to query vendor live `/v1/models` catalogs.
  - Added interactive "🔄 Sync Models" button on account cards to discover new models dynamically.
- **Client Bundle Modularization & Store Limit Relief (#540)**:
  - Reduced `lib/client.js` bundle size from 217.3 KiB to < 199 KiB (>57 KiB buffer below 256 KiB DSH Store ceiling) via `h` alias, CSS minification, and dynamic instruction loading via `/dsh-subscriptions/instructions`.

## [0.6.71] - 2026-10-13

### Added & Enhanced (Smart Balancing, Accurate Reset Clock & Soft-Failure Sentinel)
- **Least-Loaded Smart Balancing (Idea 3 / #538)**:
  - Added configurable `rotationStrategy` in `lib/config-schema.js` (`round-robin`, `least-loaded`, `priority`).
  - In `least-loaded` mode, dynamically sorts accounts by highest remaining quota percentage / lowest utilization (`lib/rotate.js`), avoiding burning out individual accounts while others sit idle.
- **Accurate Quota Reset Clock Synchronization (Idea 8 / #538)**:
  - Added `lib/reset-clock.js` to parse exact reset timestamps from HTTP rate-limit headers (`Retry-After`, `x-ratelimit-reset`), error bodies, text messages, and vendor rolling windows (Claude 5h, Codex 3h, Grok 2h).
  - Wired into `lib/stream-rotate.js` to set cooldown and quarantine directly to exact reset boundary + safety buffer (+10s), preventing premature retries and unnecessary long outages.
- **Soft-Failure & Refusal Sentinel (Idea 9 / #538)**:
  - Added `lib/sentinel.js` to inspect initial stream output for capacity apologies and polite refusals under HTTP 200 before tokens reach client.
  - Intercepted soft-failures mark account in degraded cooldown (5m) and automatically cascade to the next healthy account or vendor.
- **WebUI Settings & Diagnostics Controls**:
  - Added Balancing Strategy dropdown and Soft-Failure Sentinel toggle in settings with English and Chinese localization.

## [0.6.70] - 2026-10-12

### Added & Enhanced (Resilience, Diagnostics & Fallback Enhancements)
- **Cross-Vendor Cascading Fallback & Configurable Provider Priority (#536)**:
  - Added configurable `cascadingFallbackOrder` in `lib/config-schema.js` and wired it into `resolveFallbackVendor` (`lib/cascade.js`) and `lib/adapter-manager.js`.
  - Added interactive provider priority reordering UI (▲/▼ buttons) in Settings WebUI.
- **1-Click Test Connection & Latency Measurement (#536)**:
  - Enhanced `/dsh-subscriptions/check` across all vendors to measure and return round-trip latency (`latencyMs`).
  - Added per-account `⚡ Test` button in settings table and modal pill with live status badges (`✓ 240ms` / `✗ Error`).
- **Live Cooldown Countdown & Availability Toasts (#536)**:
  - Rendered exact remaining countdown (`m:ss`) for accounts in cooldown.
  - Added in-app toast notification when an account recovers from cooldown and becomes available.
- **Proactive OAuth Token Heartbeat (#536)**:
  - Implemented `runProactiveHeartbeat` in `lib/index.js` to refresh expiring tokens ahead of time, preventing latency spikes on user queries.
  - Added `POST /dsh-subscriptions/heartbeat/run` manual trigger route and heartbeat telemetry in diagnostics report.
- **Recent Errors Ring Buffer & Inspector (#536)**:
  - Added `ErrorRingBuffer` (`lib/error-buffer.js`) holding the 20 most recent runtime stream and API errors with PII masking.
  - Added interactive Recent Errors Inspector in WebUI Diagnostics section with a Clear button.

## [0.6.69] - 2026-10-12

### Added & Enhanced (Antigravity Tiered Thinking Models, Tool Replay Sentinel & Stream Resilience)
- **Gemini 3 Tool-Call History Replay Sentinel (#534)**:
  - Injected `thoughtSignature: 'skip_thought_signature_validator'` on reconstructed `functionCall` blocks in `lib/messages.js`.
  - Fixes Gemini 3.x validation errors when replaying conversation history containing prior tool results in DSH's provider-neutral format.
- **Tiered Model Catalog & Dynamic Thinking Level Mapping (#534)**:
  - Preserved `gemini-3.8-flash-tiered` and `gemini-3.7-flash-tiered` in `fetchAvailableModels` (`lib/code-assist.js`) despite empty upstream display names.
  - Automatically expanded tiered models into High, Medium, and Low choices (`gemini-3.8-flash-high`, `gemini-3.8-flash-medium`, `gemini-3.8-flash-low`, etc.).
  - Added `antigravityTieredAlias` mapping in `lib/code-assist.js` and wired `streamOnce` in `lib/vendors/antigravity.js` to dispatch the upstream `*-flash-tiered` model ID while configuring `generationConfig.thinkingConfig: { thinkingLevel }`.
- **Stalled & Empty Stream Resilience with Auto-Retry (#534)**:
  - Added 30s idle stream timeout (`RESPONSE_TIMEOUT_MS`) in `lib/vendors/antigravity.js` and threaded `idleTimeoutMs` into `googleStream` in `lib/wire.js`.
  - Added `hasContent` tracking with `EMPTY_RESPONSE` error code when no content tokens are received.
  - Implemented automatic single retry on transient stream stalls before emitting chunks.
  - Added `TIMEOUT` and `EMPTY_RESPONSE` to `isSwitchableError` in `lib/rotate.js` for seamless multi-account pool rotation.
- **Documentation**:
  - Added `docs/antigravity-models-and-connectivity.md` network and model diagnostic guide.

## [0.6.68] - 2026-10-12

### Fixed & Enhanced (xAI Grok RFC 8628 Device Authorization Flow)
- **RFC 8628 Device Authorization Flow for xAI Grok (GH #17, #532)**:
  - Implemented `deviceStart` and `devicePoll` in `lib/vendors/grok.js` using xAI's RFC 8628 device endpoints (`https://auth.x.ai/oauth2/device/code` and `https://auth.x.ai/oauth2/token` with `urn:ietf:params:oauth:grant-type:device_code`).
  - Solves GitHub issue #17: xAI's CLI client ID (`b1a00492-073a-47ea-816f-4c329264a828`) returns a Grok Build user-code verification page without browser loopback redirection.
  - Enabled "Device Login" button for Grok slots in `lib/client.js` and wired "Connect" to launch the device flow directly, rendering the user code, direct verification link (`https://accounts.x.ai/oauth2/device`), and background polling.
  - Updated English and Chinese instructions in `lib/client.js`.

## [0.6.67] - 2026-10-11

### Fixed & Hardened (Claude Per-Account Billing Attribution Isolation)
- **Per-Account `cc_turn_index` & `cch` Isolation (#530)**:
  - Replaced process-wide `globalThis.__DSH_CC_TURN__` and `globalThis.__DSH_CC_H__` state in `lib/vendors/claude.js` with a bounded per-account state table (`billingAccountState` Map keyed by `accountId`, capped at 256 entries with FIFO eviction).
  - Pooled Claude subscriptions no longer share or mix `cch` session hashes or `cc_turn_index` counters across accounts; `lib/adapter.js` passes `accountId: account.id || account.ref` into `vendor.streamOnce()`.
- **Dynamic `cc_prompt_index` Calculation & Kill-Switch Documentation (#530)**:
  - `makeClaudeBillingHeader(cfg, context)` now computes `cc_prompt_index` dynamically from multi-turn conversation history (`Math.max(0, userTurns - 1)` in `options.messages`) or explicit `promptIndex` overrides (defaulting to `0` on single-turn prompts).
  - Documented kill-switch semantics (`CLAUDE_CODE_ATTRIBUTION_HEADER=0` environment variable and `cfg.disableBillingHeader === true`) in `docs/design/DESIGN.md`.

## [0.6.66] - 2026-10-11

### Added & Enhanced (Copilot CLI SDK Mode)
- **Native Copilot CLI SDK Mode & Local Tool Calling (#508)**:
  - Added native driver `lib/vendors/copilot-cli.js` supporting direct local execution via the `copilot` / `github-copilot-cli` binary.
  - Credential reading from local environments and config files (`~/.config/github-copilot/hosts.json`, `apps.json`, `~/.config/gh/hosts.yml`, `~/.copilot-cli/config.json`, env `GITHUB_COPILOT_TOKEN`, `GH_TOKEN`).
  - Automatic binary detection (`findCopilotCli`, `isCopilotCliAvailable`) searching configured paths, system `PATH`, and standard npm global/local directories (`~/.npm-global/bin`).
  - Streaming execution (`streamCopilotCli`) translating CLI process stdout into canonical DSH streaming events (`block-start`, `text-delta`, `tool-call-delta`, `finish`, `usage`).
  - Configuration options in `lib/config-schema.js`: `copilotMode` (`auto` [default], `cli`, `web`) and `copilotCliPath`.
  - Seamless fallback invariant in `lib/vendors/copilot.js`: in `auto` mode, prefers local CLI if available and falls back smoothly to direct web/OAuth API on error; in `cli` mode, strictly enforces CLI availability with structured error codes.
  - WebUI configuration dropdown and path input in `lib/client.js`.
  - Diagnostics integration in `lib/diagnostics.js` (`copilotCli: copilotCliInfo()`).

## [0.6.65] - 2026-10-11

### Added & Enhanced (Batch 4: Reasoning Effort Management & Contract Matrix)
- **Session-Scoped Reasoning Effort Management (#505)**:
  - Added pure reasoning engine `lib/reasoning-effort.js` with comprehensive vendor and model capability detection (`getModelReasoningCapabilities`), extraction (`extractReasoningOptions`), validation (`validateReasoningEffort`), session store with sliding TTL (`setSessionReasoning`, `getSessionReasoning`, `clearSessionReasoning`, `pruneSessionReasoning`, `getSessionReasoningStats`), and model-switch safety (`resolveEffectiveReasoning`).
  - Model switch safety invariant: when a session has stored reasoning effort (e.g. `high` for `o1`), but the user switches the conversation to a non-reasoning model (e.g. `gpt-4o`), `resolveEffectiveReasoning` automatically suppresses the effort to prevent upstream APIs from rejecting the request with HTTP 400.
  - Extended vendor coverage: Codex (`o1`, `o3`, `low/medium/high`), Claude (`claude-3-7-sonnet*`, `claude-4.6+`, adaptive thinking and token budget mapping), Antigravity/Gemini (`thinkingConfig` injection), Grok (`grok-3-mini`, `reasoning`), and Kimi (`k1.5`, `max` effort level).
  - HTTP endpoints `GET /dsh-subscriptions/session-reasoning`, `POST /dsh-subscriptions/session-reasoning`, `DELETE /dsh-subscriptions/session-reasoning` for session-scoped override.
  - WebUI reasoning controls in `lib/client.js`: session effort picker with model-aware badges and quick resets.
  - Telemetry integration in `lib/diagnostics.js` (`reasoning: getSessionReasoningStats()`).
- **Adapter Contract Matrix & Wire Protocol Guards (#521)**:
  - Added comprehensive provider × capability matrix test suite `test/contract-matrix.test.mjs` verifying 8 providers (`codex`, `claude`, `antigravity`, `grok`, `copilot`, `cursor`, `kimi`, `ollama`) across 7 protocol capabilities (`stream`, `tools`, `reasoning`, `usage`, `caching`, `auth_errors`, `rate_limit`).
  - Strict contract enforcement: offline deterministic wire verification ensuring protocol changes or vendor API deviations are immediately flagged before reaching production.
  - Malformed vendor response guards: verifying corrupted SSE chunks and vendor error payloads translate cleanly into structured terminal error events without crashes or unhandled rejections.

## [0.6.64] - 2026-10-09

### Fixed (Critical Hotfix: Desktop Referer Loopback Guard)
- **DSH Desktop Electron HTTP Forwarding Compatibility (#524)**:
  - Fixed `isTrustedSettingsRequest` in `lib/http.js` where requests from DSH Desktop (Electron) carrying `Referer: dsh-app://app/` failed the `referer.host === host` equality check prior to loopback and connection service verification, causing all settings routes (`/config`, `/accounts`, `/oauth`, `/proxy`, `/diagnostic-wizard`) to reject with HTTP 403 Forbidden.
  - Restricted strict `host` equality check to standard web schemes (`http:`, `https:`), allowing application schemes (`dsh-app://`) to proceed cleanly to loopback and connection service checks.
  - Preserved fail-closed cross-site / CSRF protection for web-profile requests while restoring full functionality on DSH Desktop.

## [0.6.63] - 2026-10-09

### Added & Enhanced (Batch 3: Diagnostic Wizard & Cache-Aware Session Pin)
- **Guided Diagnostic Wizard (#519)**:
  - Added pure diagnostic analysis engine `lib/diagnostic-wizard.js` with structured step-by-step verification: credentials and expiry status, proxy and gateway configuration, token freshness and singleflight OAuth refresh, and model catalog reachability without incurring paid inference.
  - Standardized step states (`pass`, `fail`, `warn`, `skipped`) and error codes (`MISSING_CREDENTIAL`, `EXPIRED_ACCESS_TOKEN`, `TOKEN_EXPIRED_NO_REFRESH`, `VALIDATION_REQUIRED`, `PROXY_UNREACHABLE`, `TOKEN_REVOKED`, `CATALOG_OK`).
  - Automatic data redaction via `sanitizeDiagnosticData`: masks tokens, bearer headers, passwords, keys, and private emails across the entire report and export payloads.
  - Added HTTP endpoint `POST /dsh-subscriptions/diagnostic-wizard` and interactive WebUI modal wizard with actionable troubleshooting advice and one-click masked report copying.
- **Cache-Aware Session Pinning (#520)**:
  - Upgraded session affinity engine in `lib/session-pin.js` with prompt caching awareness (`isCacheAwareProvider`, `CACHE_AWARE_PROVIDERS` for Claude, Codex, Antigravity, and Grok).
  - Sliding TTL on active turns (`touchSessionPin`), tracking pinned hits and saved cache read tokens (`recordSessionCacheUsage`).
  - Strict priority invariant in `lib/rotate.js`: account cooldown, quarantine, zero quota, and model incompatibility automatically release the pin with documented reason codes (`pinned_cooldown`, `pinned_quarantine`, `pinned_zero_quota`, `pinned_exhausted`, `pinned_model_mismatch`) before cascading to healthy accounts.
  - Decision tracing captures `cache_pinned` versus `session_pinned` and displays dedicated visual affinity badge in WebUI telemetry traces.
  - Integrated pin telemetry in `lib/diagnostics.js` (`pins: getSessionPinStats()`).

## [0.6.62] - 2026-10-09

### Added & Enhanced (Batch 2: Analytics & Concurrency Queue)
- **Subscription & Cache Analytics (#511)**:
  - Added pure analytical engine `lib/analytics.js` with comprehensive caching, latency, and throughput metrics (`calculateCacheMetrics`, `calculatePerformanceMetrics`, `calculateHourlyBuckets`, `calculateAccountBreakdown`, `calculateQuotaForecast`, `calculateAnalytics`).
  - Real-time token efficiency: cache hit rate %, prompt/completion/cached token ratios, TTFT (avg, p95, min, max), and generation speed (tokens/sec).
  - 24-hour activity distribution histogram: hourly request density, cached tokens, and error distribution.
  - Quota runway & depletion forecasting: burn rate per account, projected hours until exhaustion, and pre-reset depletion warnings.
  - HTTP endpoints `GET /dsh-subscriptions/analytics` and enriched diagnostic reports.
  - Interactive telemetry card in WebUI: cache performance overview, pure CSS 24-hour activity histogram, and quota exhaustion alert banners.
- **Request Concurrency Queue & Overload Protection (#518)**:
  - Added bounded concurrency queue engine `lib/concurrency-queue.js` (`ConcurrencyQueue`, `defaultConcurrencyQueue`) with per-key concurrency limits, bounded queue depth, timeout eviction, and zero-leak slot lifecycle.
  - Integrated with streaming rotation (`streamWithRotation` in `lib/stream-rotate.js`): acquires queue slot before streaming attempt, guarantees release on completion, error, or mid-stream disconnect.
  - Cooperative cancellation via `AbortSignal`: queued requests evict immediately on client cancel without slot leaks or lingering timeouts.
  - Automatic load shedding & pool failover: queue overflow (`QUEUE_OVERFLOW`, HTTP 429) and timeout (`QUEUE_TIMEOUT`, HTTP 504) dynamically cascade to next available account in the pool before rejecting.
  - Configuration settings: `enableQueue` (default true), `accountMaxConcurrency` (default 2), `maxQueueSize` (default 20), `queueTimeoutMs` (default 30000).
  - Live queue telemetry in WebUI and HTTP endpoint `GET /dsh-subscriptions/queue`.

## [0.6.61] - 2026-10-09

### Added & Enhanced (Batch 1: Decision Traces & Dynamic Model Catalog)
- **Rotation Decision Tracing & Routing Explanation (#517)**:
  - Added synchronous decision tracing in account selection, rotation, streaming retry, cascade fallback, and session pinning (`pickAccountWithTrace`, `_decisionTrace`, `onDecisionTrace`).
  - Standardized reason codes: `session_pinned`, `healthy_tier0`, `healthy_tier1`, `tier2_fallback`, `quarantine`, `cooldown`, `zero_quota`, `hard_exhausted`, `soft_exhausted`, `vip_reserved`, `tag_mismatch`, and `no_usable_account`.
  - Zero post-hoc reconstruction: traces capture exact account state, metrics, and failure reasons at the moment decisions occur without state drift.
  - Exposed decision history in `HistoryStore`, `GET /dsh-subscriptions/history`, `GET /dsh-subscriptions/diagnostics`, and WebUI telemetry card («🧭 Rotation & Routing Decisions»).
- **Enriched Dynamic Model Catalog with Pool Health, Quotas & Capabilities (#507)**:
  - Added `lib/models-catalog.js` with comprehensive capability inference (`vision`, `tools`, `reasoning`, `coding`, `fast`) and context window definitions.
  - Pool-level health calculation: individual account quarantine degrades rather than disables the pool when healthy alternative accounts exist (`healthy`, `degraded`, `cooldown`, `quarantined`, `exhausted`, `unavailable`).
  - Real-time pool quota percentage and live reset countdown badges.
  - Added HTTP endpoint `GET /dsh-subscriptions/models` and enriched `configResponse` model catalog.
  - Replaced static chip grid in plugin settings with reactive model catalog including capability tags, context window badges, and status indicators.

## [0.6.60] - 2026-10-07

### Fixed & Enhanced
- **Antigravity Client Secret Configuration Schema (#515, GH #16)**:
  - Added `antigravityClientSecret: z.string().role("secret").default("")` to `Config` schema in `lib/config-schema.js`, allowing users to enter custom Google OAuth client secrets without schemastery dropping them.
  - Fully integrated with `publicConfig` redaction (`••••••`) and `restoreMaskedSecrets` preservation.
- **Resilient CLI Token Refresh & Default Public Client Credentials (#515, GH #16)**:
  - Added default public application credentials for the standard Gemini / Antigravity CLI client (`Google Gemini CLI Client ID` / `Google Gemini CLI Client Secret`) in `lib/vendors/antigravity.js` and `lib/import-auth.js`.
  - Imported CLI sessions now refresh tokens smoothly without expiring after 1 hour or requiring manual secret input.
  - Hardened error handling in `antigravity.js::refresh()`: replaces raw HTTP 400 errors with actionable guidance to configure `antigravityClientSecret` when client secret is required by a custom OAuth client.
- **Windows Credential Manager CLI Discovery (#515, GH #16)**:
  - Added Windows Credential Manager target `gemini:antigravity` inspection on `win32` platform in `lib/import-auth.js`, enabling `📥 From CLI` to discover active CLI sessions directly when `agy` stores credentials in Windows Credential Manager.

## [0.6.59] - 2026-10-06

### Added & Enhanced (Sprint 1: Quarantine Control, Quota Countdown & In-App Alerts)
- **Manual Quarantine Control & Instant Warmup Probe (#509)**:
  - Added HTTP endpoints `POST /dsh-subscriptions/quarantine/park` and `POST /dsh-subscriptions/quarantine/probe`.
  - Added UI actions in account slot cards: `⏸ Park` (manually quarantine an active account for 1 hour for maintenance/debugging), `🔄 Probe Now` (trigger immediate warmup micro-probe via `probeWarmup` with `force=true`), and `✕ Release` (immediately clear quarantine state).
  - Added canonical reason `REASON_MANUAL_PARK` in `lib/quarantine.js`.
- **Live Quota Reset Countdown Timers (#506)**:
  - Added real-time per-second countdown timer `ResetCountdown` in `SubsPill` and account cards in settings.
  - Automatically calculates remaining time until rolling quota reset window (`account.quota.resetAt`, `five_hour`, `seven_day`, `primary_window`) using canonical `formatRelativeReset`.
- **In-App Toast Alerts & Webhook Notifications (#510)**:
  - Added lightweight non-intrusive floating toast alerts (`.dsub-toast-container` / `.dsub-toast`) in DSH chat interface, styled with canonical `--dsw-alias-state-*` tokens.
  - Added `notifyQuarantineEntered` and `notifyQuarantineReleased` helpers in `lib/alerts.js` with automatic translation to in-app toasts and optional external webhook alerts.
  - Added `enableToasts: z.boolean().default(true)` in configuration schema to allow toggling popup notifications.

## [0.6.58] - 2026-10-06

### Fixed
- **Theme Contract & Canonical CSS Tokens (#501, #504)**:
  - Replaced legacy CSS custom properties with canonical `--dsw-alias-*` tokens across `lib/client.js`.
  - Added automated theme contract guard `test/theme-contract.test.mjs` ensuring zero unmapped or hardcoded color tokens in frontend styles.

## [0.6.57] - 2026-10-06

### Fixed
- **Claude OAuth Protocol & Billing Header (#498, #499, #500, GH #14, GH #15)**:
  - Use `Bearer` authentication for Claude OAuth models and inject required billing headers.
  - Isolate `extra_usage` metadata parsing to prevent unexpected upstream protocol divergences.

## [0.6.56] - 2026-10-05

### Fixed & Hardened
- **Vendor Configuration Schema & Adapter Security (#489, #493, #494, #497)**:
  - Explicitly declare vendor settings in schema with strict input validation.
  - Harden custom vendor URLs against SSRF and guard internal adapter host API.

## [0.6.55] - 2026-10-05

### Security
- **Security Hardening & Token Protection (#487, #488, #490, #491, #492)**:
  - Resolve path traversal vectors in static and export handlers.
  - Implement constant-time comparison for token and secret verification.
  - Guard OAuth redirect trusts against header poisoning.

## [0.6.54] - 2026-10-04

### Added
- **Smart Quota Drainer Balancing Strategy (#485, #486)**:
  - Implement `drainBeforeReset` strategy to prioritize accounts nearing rolling quota reset windows.
  - Configurable `drainSafetyPercent` threshold to avoid sudden 429 exhaustion before window resets.

## [0.6.53] - 2026-10-03

### Fixed
- **Zero-Cyrillic Contract in Frontend Client (#318, #483)**:
  - Eliminate Cyrillic string literals from navigation helpers in `lib/client.js`.
  - Pass automated contract guard `test/contract-guards.test.mjs` with 0 Cyrillic characters in `lib/*.js`.

## [0.6.52] - 2026-10-03

### Fixed & Hardened
- **Quarantine Warmup Contract & Pacing Isolation (#350, #352, #459, #481)**:
  - Canonical 3-argument signature for `vendor.check(blob, cfg, fetchImpl)`.
  - Isolate quota reset windows in auto-pacing sample calculations.
  - Multilingual navigation resilience in DSH 0.2 Settings dialog.

## [0.6.51] - 2026-10-02

### Fixed
- **Antigravity CLI Expiry Normalization (GH #13, #478)**: Normalize ISO 8601 string expiry (including nanoseconds and timezone offsets), epoch seconds, and epoch milliseconds into numeric Unix milliseconds in `lib/blob.js`, preventing `Number(ISODateString) === NaN -> 0` and eliminating premature immediate refresh cycles.
- **Antigravity OAuth Client ID Extraction & Retention (GH #13, #478)**: Safely extract Google OAuth Client ID from `id_token` JWT `aud`/`azp` metadata when direct fields are absent; preserve `clientId`, `clientSecret`, and `idToken` across serialization cycles in `lib/blob.js`.
- **Antigravity Refresh Guard (GH #13, #478)**: In `lib/vendors/antigravity.js::refresh()`, prioritize `cfg.clientId` over `blob.clientId`, guard against missing client ID with an early descriptive error to prevent Google OAuth HTTP 400 (`invalid_request: Could not determine client ID from request`), and retain client metadata across token refreshes.
- **CLI Discovery (#478)**: Detect local credentials from `~/.gemini/oauth_creds.json` in addition to CLI proxy paths.

## [0.6.50] - 2026-10-02

### Fixed & Hardened (Round 3 Audit Resolution)
- **HTTP / Routes (#374)**: Strict fail-closed authentication on sensitive routes (`/config`, `/status`), reject unauthenticated remote requests with matching host, exact cookie token lookup, and safe Cordis context connection access.
- **Accounts / Credentials (#442)**: Prevent credential resurrection after logout when in-flight `saveBlob` resolves, unconditionally executing `credentials.unset`.
- **Rotation / Quarantine (#350)**: Expired quarantine accounts require active warmup micro-probe (`vendor.check`) before returning to the active rotation pool, with exponential backoff on probe failure.
- **Quota / Forecast (#352)**: Record sliding-window `quotaSamples` from actual quota snapshots, calculate `pacePerHour` via `calculateBurnRatePerHour`, and populate backend pacing inputs for `computePacingRisk`.
- **UI / Client (#459)**: Resilient "All Settings" navigation in SubsPill to DSH 0.2 Plugins package card via native capability and standard `PLUGIN_LABELS` / `data-plugin-package` title button triggers.
- **Documentation (#434)**: Synchronize `docs/design/DESIGN.md` active version to 0.6.50, update slot architecture (`plugins.bundle.config`, `plugins.row.config`, `conversation.session.header.actions`).
- **Distribution (#326)**: Release v0.6.50 to npm public registry and migrate production runtime from file tgz dependency.

## [0.6.49] - 2026-10-02

### Fixed & Enhanced
- Codex: normalize tool `call_id` to <= 64 chars to prevent OpenAI HTTP 400 errors (Refs: GH #12, #474)
- Codex: add `gpt-6.1-sol` model and bump default `clientVersion` to `0.160.0` (Refs: GH #11, #473)
- Tools: preserve boolean schema contracts (`normalizeJsonSchema(false) === false`) (Refs: #403)
- Accounts: prevent credential mutation races and false unsetting on concurrent refresh/write (Refs: #442)
- Adapter: record and persist quarantine on native HTTP 429 and clear on success (Refs: #350)
- Adapter Manager: propagate `autoPacing` configuration into `streamWithRotation` (Refs: #352)
- HTTP / Routes: fail-closed authentication on sensitive routes, reject forged headers/cookies on non-loopback (Refs: #374)
- Status / Settings: enforce host revision CAS and return HTTP 409 on version conflict (Refs: #379)
- Wire / Adapter: capture `reasoningTokens` in streaming chunks and forward to history (Refs: #449)
- UI / Client: fix "All Settings" navigation on DSH 0.2 via Plugins panel (Refs: #459)

## [0.6.43] - 2026-10-01

### Fixed
- Eliminate empty catch block in redirect headers sanitizer (Refs: #322)

## [0.6.42] - 2026-10-01

### Fixed & Enhanced (Block 6 - Developer Tooling, Timeout Tuning, CLI Import & Typechecking)
- Support environment-only Cursor and Kiro imports and canonical Claude alias (Refs: #452)
- Apply network timeouts to all external calls with body protection and error classification (Refs: #322)
- Declare local ESLint and update dev core dependencies for clean reproducibility (Refs: #457)
- Add JSDoc typing for core modules and ensure typecheck passes cleanly with zero errors (Refs: #304)

## [0.6.41] - 2026-10-01

### Fixed & Enhanced (Block 5 - UI, Settings Card, Runaway Guard, Telemetry & Quota)
- Publish custom vendor catalog with actual profile id instead of 'custom' (Refs: #451)
- Remove synthetic fake quota percentages from 8 vendor modules (Refs: #454)
- Deduplicate concurrent usage refreshes with single-flight locking (Refs: #455)
- Ensure stream finalization and history recording run under runaway guard via exactly-once finally lifecycle (Refs: #456)
- Surface cache efficiency and token savings in UI telemetry and analyze-session event mapping (Refs: #386)
- Restore settings card accessibility and fix All Settings navigation on DSH 0.2 (Refs: #459)

## [0.6.40] - 2026-10-01

### Fixed & Hardened (Block 4 - Stream, SSE, Responses & Wire Hardening)
- Preserve valid JSON Schema combinators (anyOf, oneOf, allOf) and keywords in tool normalizer (Refs: #403)
- Preserve remote HTTP image URLs in Anthropic and Gemini payloads (Refs: #404)
- Preserve query parameters in HTTP proxy routes (Refs: #446)
- Fix loggedInProviders array indexing in subscriptionImages service (Refs: #447)
- Align stream finish reasons with canonical DSH LLM contract (Refs: #448)
- Preserve input and cache token usage across stream adapters (Refs: #449)
- Handle DONE signal cleanly and prevent abrupt EOF false success (Refs: #450)

## [0.6.39] - 2026-10-01

### Fixed & Added (Block 3 - Account Pool, Health & Rotation Resilience)
- Fix healthScore=0 fallback evaluation during account sorting (Refs: #342)
- Expand cross-vendor fallback chains and guard signal abortion (Refs: #349)
- Persist quarantine state and add warmup helpers (Refs: #350)
- Integrate autoPacing load balancing strategy (Refs: #352)
- Prevent race condition during adapter disposal (Refs: #363)
- Expose account counters and health callbacks (Refs: #443)
- Provide pickAccount locked pool fallback (Refs: #444)

# Changelog

## [0.6.38] - 2026-10-01
### Storage, Vault Resilience & Dynamic Model Discovery
- Dynamic listModels caching and live catalog endpoints for Copilot, Claude, Grok, and Codex (Refs: #458)
- Preserve masked secrets on GET-config partial updates (Refs: #242)
- Preserve proxyUrl, expiresAt, and custom parameters during slot normalization (Refs: #343)
- Enforce strict CAS revision validation on config updates (Refs: #379)
- Enforce settings update failure rollback and safe ref cleanup (Refs: #439)
- Preserve custom blob properties in serializeBlob and parseBlob (Refs: #440)
- Isolate static API key imports from OAuth token refresh routines (Refs: #441)
- Enhance credential save and delete error handling and ref validation (Refs: #442)

## [0.6.37] - 2026-10-01
### Security & Hardening
- Enforce same-origin auth check on sensitive GET routes (Refs: #374)
- Resolve redirectFor signature compatibility across OAuth routes (Refs: #437)
- Enforce strict state validation on OAuth complete endpoint (Refs: #438)
- Sanitize bearer headers and cookies on external/cross-origin requests (Refs: #445)
- Restrict credential ref targets in legacy import handlers (Refs: #360)
- Enforce KDF and minimum passphrase length in legacy export routines (Refs: #414)
- Sanitize Copilot CLI token import duration and initial expiration (Refs: #453)

## 0.6.36

### Fixes & Hardening
- **Settings Dynamic Sync (#430)**: ensured `onSettingsChanged` and `ctx.inject(['settings'])` properly trigger `syncSnapshot()` on host configuration changes, keeping custom vendors, adapter registries, and Ollama fallback synchronized in runtime.
- **Volatile Schema Resilience & Dev Dependency (#431)**: introduced defensive runtime fallback for `.volatile()` in `lib/config-schema.js` and added `@deepseek-ai/schemastery: "^3.18.4"` to `devDependencies` to restore test runner stability across all environments.
- **Retired Slot Cleanup (#427)**: removed legacy `settings.plugin.item` registration from `lib/client.js` in favor of primary DSH 0.2 slots `plugins.item` and `plugins.row.config`.
- **Vendor & Core Encapsulation (#432, #433)**: encapsulated `DEVICE_AUTH_URL` in `lib/vendors/codex.js` and internal helpers (`scrubReport`, `decodeJwtPayload`, `reconcileResponsesInput`, `applyClaudeThinking`, `enrichAntigravityAccount`).
- **Design Contract Alignment (#434)**: updated active version to `0.6.36` and documented current UI slot surfaces in `docs/design/DESIGN.md`.

## 0.6.34

### Fixed
- **Peer gate on DSH 0.2.0-rc.1** (#58): DSH skips a profile bundle whose `peerDependencies` exclude the running version, so this plugin was absent from the profile with no error in the UI. Every `@deepseek-ai/dsh-*` peer now names both the 0.1.7-rc.2 and 0.2.0-rc.1 lines, because semver does not admit a prerelease of the next minor into a range that does not name it.

Notable changes to `@goodandready/dsh-subscriptions`.

## 0.6.33

### Fixes & Hardening
- **Cordis Logger Guard (#421)**: eliminated un-injected `ctx.log` reference in plugin entry point `lib/index.js` to strictly adhere to Cordis proxy invariants.
- **Preflight Error Handling (#422)**: documented rationale for empty catch blocks in updater routines (`lib/updater.js`).
- **Vendor Encapsulation (#423)**: encapsulated internal provider constants across `lib/vendors/*.js` to protect module boundaries.
- **Design Contract Fix (#424)**: resolved duplicate word typo in `docs/design/DESIGN.md`.

## 0.6.32

### Fixes
- **Cordis History Directory Invariant (#419)**: removed un-injected `ctx.historyDir` access in plugin entry point `lib/index.js` which triggered Cordis Context proxy trap on host startup; added regression guard testing `apply()` against strict Cordis context proxy.

## 0.6.31

### DevOps & Resilience
- **Repository Hygiene & Worktree Pruning (#415)**: pruned merged and obsolete branches, removed stale `/tmp/pub-subs` worktree, and brought root checkout into sync with `origin/main`.
- **Updater Lockfile Resilience & Supply-Chain Protection (#416)**: dropped `--config.minimumReleaseAge=0` override to preserve pnpm release-age protection; introduced PID-aware `package.json.lock` validation returning HTTP 409 Busy on concurrent installations and ensuring stale locks from terminated children are automatically cleaned up on timeout.

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
