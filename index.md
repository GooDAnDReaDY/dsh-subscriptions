# dsh-subscriptions

OAuth subscription LLM providers for DeepSeek Harness: personal paid
subscriptions (ChatGPT Codex, Claude, Grok, Antigravity, Kimi, GLM, Cursor,
Kiro, Copilot, Qwen, ERNIE, Spark, JetBrains, Perplexity, Replit, Cody) as
native DSH LLM providers with multi-account rotation, quota fallback and
zero-token-leak proxying.

- Status: published on npm (`@goodandready/dsh-subscriptions`), active 0.5.x
  development. Map verified: 2026-09-09.
- Spec: [docs/architecture/2026-08-20-dsh-subscriptions-design.md](docs/architecture/2026-08-20-dsh-subscriptions-design.md)
- Plan: [docs/plans/2026-08-20-dsh-subscriptions.md](docs/plans/2026-08-20-dsh-subscriptions.md)
- Design contract: [docs/design/DESIGN.md](docs/design/DESIGN.md)
- Deploy: [deploy.sh](deploy.sh) — installs a published npm version into a DSH
  profile; candidates are validated on an isolated test server first.
- Tests: `npm test` (eslint + `node --test test/*.test.mjs`; no network,
  no harness needed).
- Install (after publish): `dsh plugin --profile web add @goodandready/dsh-subscriptions`

## Layout

- `lib/index.js` — server half: cordis plugin (`llm`, `credentials`,
  `webServer`, `settings`), `ctx.subscriptions` service for sibling plugins.
- `lib/client.js` + `lib/ui-styles.js` + `lib/ui-i18n.js` — browser half:
  settings card (`settings.plugin.item`, fallback `settings.section`),
  account/vendor cards, OAuth/device-flow UX.
- `lib/vendors/` — 16 built-in vendor adapters; `lib/vendor-factory.js` —
  declarative profile-based custom vendors.
- `lib/routes.js` — `/dsh-subscriptions/*` HTTP API (diagnostics, proxy-check,
  device flow).
- `lib/oauth.js`, `lib/pkce.js`, `lib/loopback.js`, `lib/jwt.js` — auth stack.
- `lib/rotate.js`, `lib/ratelimit.js`, `lib/quarantine.js` — account pools,
  rate-limit parsing, family-scoped cooldowns.
- `test/` — 55+ suites covering protocols, parsers, rotation and borders.

## Dependencies

- peer: `@deepseek-ai/cordis`, `dsh-credentials`, `dsh-host-webserver`,
  `dsh-llm`, `dsh-settings`, `schemastery` (provided by the DSH host).
- runtime: `undici`, `socks` (proxy support).
- Package manager: pnpm (see `pnpm-lock.yaml`). `pnpm audit` and
  `npx npm-check-updates` (check mode) run per dependency-update task.
