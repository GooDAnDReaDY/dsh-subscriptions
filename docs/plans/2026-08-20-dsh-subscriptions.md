# dsh-subscriptions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `@goodandready/dsh-subscriptions` so ChatGPT Codex, Claude, Grok, Gemini, and Antigravity subscriptions can log in via the Web UI, appear in the model picker, and rotate accounts on quota inside this plugin.

**Architecture:** Host plugin registers a DSH `LlmAdapter` and HTTP OAuth routes. Tokens are JSON blobs in `ctx.credentials` under `<PROVIDER>_OAUTH_N`. The browser only sees `{configured,label,usage,cooldown}`. Rotation picks the next account of the same provider on `RATE_LIMIT`/`QUOTA`/429. OAuth callback is the Web UI origin plus a paste-URL fallback.

**Tech Stack:** DeepSeek Harness plugin (Cordis, SchemaMastery, `webServer`, `settings`, `credentials`, `llm`). Node ESM host + CommonJS-shim browser `client.js`. Tests: `node --test`. Git: `git-cursor`.

**Spec:** `docs/architecture/2026-08-20-dsh-subscriptions-design.md`

## Global Constraints

- Package name `@goodandready/dsh-subscriptions` in `package.json`, `cordis.patch.yml` `name:`, and `lib/client.js` loader `id`.
- Patch `id:` is `dsh-subscriptions`.
- Original source. Do not copy third-party subscription plugin trees.
- No host paths, IPs, machine names, or live tokens in the repo.
- No tools in v1 (`x_search`, image, video).
- No Copilot, Cursor, MiniMax, Qwen, Claude Code import, no `dsh-key-rotation` wiring.
- `export const inject = ['llm', 'credentials', 'webServer', 'settings']`
- Browser: `var module = { exports: {} }`, `var exports = module.exports`, `return module.exports`, `dsh.client.platform === "web"`.
- Every vendor HTTP call includes `attributionHeaders()` from `@deepseek-ai/dsh-llm`.
- Adapter must implement `providerRetryPolicy()` (return `undefined` for defaults).
- `llm/stream` interceptors must not be `async`.
- After `file:` installs: `dsh plugin remove` then `add`; compare installed `lib/` to source; then restart Web UI.
- Git wrapper: `git-cursor` only.
- Commits: `Refs: #1`.

## File map

| File | Responsibility |
|---|---|
| `package.json` | scoped name, exports, `dsh.bundle` / `dsh.client`, peers |
| `cordis.patch.yml` | insert `id: dsh-subscriptions`, scoped `name` |
| `lib/refs.js` | `<PROVIDER>_OAUTH_N` names |
| `lib/pkce.js` | S256 verifier/challenge/state |
| `lib/blob.js` | credential JSON parse/serialize (no logging of secrets) |
| `lib/rotate.js` | pick account, cooldown, skip 100% usage |
| `lib/oauth.js` | start URL, exchange code, refresh |
| `lib/adapter.js` | `LlmAdapter` + `ctx.llm.registerAdapter` |
| `lib/vendors/*.js` | one file per provider: authorize, token URL, stream |
| `lib/index.js` | Config, routes, apply |
| `lib/client.js` | Settings -> Subscriptions |
| `test/*.test.mjs` | unit tests |
| `README.md` `LICENSE` `.gitignore` `AGENTS.md` `index.md` | publication + agent contract |

Vendor OAuth client IDs come from **that vendor's public CLI/docs**, stored in `Config` as placeholders (`oauthClientId`), never from our machines.

---

### Task 1: Scaffold publishable package + Gitea

**Files:**
- Create: `package.json`, `cordis.patch.yml`, `.gitignore`, `LICENSE`, `README.md`, `AGENTS.md`, `index.md`
- Keep: `docs/architecture/2026-08-20-dsh-subscriptions-design.md`, `docs/plans/2026-08-20-dsh-subscriptions.md`

**Interfaces:**
- Produces: empty plugin that DSH can load (no adapter yet)

- [ ] **Step 1: Write package.json**

```json
{
  "name": "@goodandready/dsh-subscriptions",
  "version": "0.1.0",
  "description": "Use ChatGPT Codex, Claude, Grok, Gemini, and Antigravity subscriptions as DeepSeek Harness LLM providers via OAuth.",
  "license": "MIT",
  "type": "module",
  "main": "./lib/index.js",
  "exports": {
    ".": "./lib/index.js",
    "./client": "./lib/client.js",
    "./package.json": "./package.json",
    "./cordis.patch.yml": "./cordis.patch.yml"
  },
  "files": ["lib/", "cordis.patch.yml", "README.md", "LICENSE"],
  "scripts": { "test": "node --test test/*.test.mjs" },
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": {
      "platform": "web",
      "inject": ["@deepseek-ai/dsh-client-runtime", "@deepseek-ai/dsh-client-ui-slots"]
    }
  },
  "peerDependencies": {
    "@deepseek-ai/cordis": "^4.0.1",
    "@deepseek-ai/dsh-llm": "^0.1.0-rc.6",
    "@deepseek-ai/dsh-credentials": "^0.1.0-rc.6",
    "@deepseek-ai/dsh-host-webserver": "^0.1.0-rc.6",
    "@deepseek-ai/dsh-settings": "^0.1.0-rc.6",
    "@deepseek-ai/schemastery": "^3.18.1"
  }
}
```

- [ ] **Step 2: Write cordis.patch.yml** with `id: dsh-subscriptions` and `name: '@goodandready/dsh-subscriptions'`.

- [ ] **Step 3: Minimal `lib/index.js`** exporting `name`, `inject`, `Config`, `apply` that only `settings.register('dsh-subscriptions', Config, { base })`.

- [ ] **Step 4: Minimal `lib/client.js`** factory with CommonJS shim returning `{ apply, inject: ['slots'] }` and an empty Subscriptions section.

- [ ] **Step 5: `node --check lib/index.js` and `npm test` (client-factory test). Commit `chore: scaffold @goodandready/dsh-subscriptions`. Push. Issue #1 comment.**

---

### Task 2: Credential refs and token blobs

**Files:**
- Create: `lib/refs.js`, `lib/blob.js`, `test/refs.test.mjs`, `test/blob.test.mjs`

**Interfaces:**
- Produces:
  - `PROVIDERS = ['codex','claude','grok','gemini','antigravity']`
  - `oauthRef(provider, index) -> string` e.g. `CODEX_OAUTH_1` (index starts at 1)
  - `parseOauthRef(ref) -> { provider, index } | null`
  - `serializeBlob(obj) / parseBlob(text)` where obj is `{ accessToken, refreshToken, expiresAt, label, email }`

- [ ] **Step 1: Failing tests**

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { oauthRef, parseOauthRef } from '../lib/refs.js'

test('oauthRef is an env-style name', () => {
  assert.equal(oauthRef('codex', 1), 'CODEX_OAUTH_1')
  assert.equal(oauthRef('antigravity', 2), 'ANTIGRAVITY_OAUTH_2')
  assert.match(oauthRef('codex', 1), /^[A-Za-z_][A-Za-z0-9_]*$/)
})

test('parseOauthRef round-trips', () => {
  assert.deepEqual(parseOauthRef('CLAUDE_OAUTH_3'), { provider: 'claude', index: 3 })
  assert.equal(parseOauthRef('OPENAI_API_KEY'), null)
})
```

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { serializeBlob, parseBlob } from '../lib/blob.js'

test('blob round-trip does not drop refreshToken', () => {
  const raw = serializeBlob({
    accessToken: 'at', refreshToken: 'rt', expiresAt: 1, label: 'acct', email: 'a@b.c',
  })
  const parsed = parseBlob(raw)
  assert.equal(parsed.refreshToken, 'rt')
  assert.equal(JSON.parse(raw).refreshToken, 'rt')
})
```

- [ ] **Step 2: Run tests — expect FAIL (modules missing).** `npm test`

- [ ] **Step 3: Implement `lib/refs.js` and `lib/blob.js`.** Reject unknown providers. `serializeBlob` must throw on empty access+refresh.

- [ ] **Step 4: Tests pass. Commit `feat(subs): credential ref names and token blobs`.**

---

### Task 3: PKCE + rotation (pure)

**Files:**
- Create: `lib/pkce.js`, `lib/rotate.js`, `test/pkce.test.mjs`, `test/rotate.test.mjs`

**Interfaces:**
- Produces:
  - `createPkce() -> Promise<{ verifier, challenge, state }>`
  - `pickAccount(accounts, nowMs) -> account | null` where account is `{ ref, usagePercent, cooldownUntil, hasToken }`
  - `markCooldown(account, nowMs, cooldownMs) -> account`
  - `isSwitchableError(err) -> boolean` for codes `RATE_LIMIT`, `QUOTA` and status `429`

- [ ] **Step 1: Failing rotation test**

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pickAccount, markCooldown, isSwitchableError } from '../lib/rotate.js'

test('skips 100% usage and cooldown, picks the next token', () => {
  const now = 1_000
  const accounts = [
    { ref: 'CODEX_OAUTH_1', hasToken: true, usagePercent: 100, cooldownUntil: 0 },
    { ref: 'CODEX_OAUTH_2', hasToken: true, usagePercent: 10, cooldownUntil: 5_000 },
    { ref: 'CODEX_OAUTH_3', hasToken: true, usagePercent: 10, cooldownUntil: 0 },
  ]
  assert.equal(pickAccount(accounts, now).ref, 'CODEX_OAUTH_3')
})

test('429 is switchable', () => {
  assert.equal(isSwitchableError({ code: 'RATE_LIMIT' }), true)
  assert.equal(isSwitchableError({ status: 429 }), true)
  assert.equal(isSwitchableError({ code: 'AUTH' }), false)
})
```

- [ ] **Step 2: Run — FAIL. Implement. Tests pass.**

- [ ] **Step 3: PKCE uses `crypto.subtle` or `node:crypto` `randomBytes` + SHA-256 base64url. Test challenge length > 20.**

- [ ] **Step 4: Commit `feat(subs): PKCE helpers and account rotation`.**

---

### Task 4: OAuth HTTP routes (no vendor stream yet)

**Files:**
- Modify: `lib/index.js`
- Create: `lib/oauth.js`, `test/oauth.test.mjs`

**Interfaces:**
- Consumes: `createPkce`, `oauthRef`, `serializeBlob`
- Produces host routes from the spec table. Pending logins live in memory `Map<state, { provider, index, verifier, createdAt }>`, TTL 15 min.

- [ ] **Step 1: Unit-test `buildAuthorizeUrl({ authUrl, clientId, redirectUri, challenge, state, extra })` includes `code_challenge_method=S256`.**

- [ ] **Step 2: Unit-test `parseCallbackInput(text)` accepts a full URL with `?code=` or a raw code string.**

- [ ] **Step 3: In `apply`, register exact routes. PUT/POST gated by same-origin (`sec-fetch-site !== 'cross-site'`). GET config returns slots + `{configured,label}` from `credentials.describe`, never blob fields.**

- [ ] **Step 4: `POST /dsh-subscriptions/oauth/complete` `{ provider, index, url }` exchanges the code (injectable `fetchImpl` in tests) and `credentials.set(ref, serializeBlob(...))`.**

- [ ] **Step 5: Commit `feat(subs): OAuth start/callback/complete routes`.**

---

### Task 5: LlmAdapter with rotation around stream()

**Files:**
- Create: `lib/adapter.js`, `test/adapter.test.mjs`
- Modify: `lib/index.js`

**Interfaces:**
- Consumes: `pickAccount`, `markCooldown`, `isSwitchableError`, `parseBlob`, `ctx.credentials.resolve`
- Produces: class `SubscriptionAdapter extends LlmAdapter` with `stream(options)`, `listModels`, `resolveModel`, `providerInfo`, `providerRetryPolicy() { return undefined }`

- [ ] **Step 1: Fake vendor `streamOnce({ provider, blob, options })` that fails 429 on first account and succeeds on second. Assert adapter retries and yields text chunks.**

- [ ] **Step 2: Register via `ctx.llm.registerAdapter(loggedInProviders, adapter)` and `handle.replace(...)` when login/logout changes the set. Empty replace is legal.**

- [ ] **Step 3: `listModels` returns [] when no account has a token. Logged-in returns vendor catalog (stub list in v1 if live fetch fails).**

- [ ] **Step 4: Every vendor fetch uses `headers: { ...attributionHeaders(), Authorization: 'Bearer ' + access }`.**

- [ ] **Step 5: Commit `feat(subs): LLM adapter with in-plugin account rotation`.**

---

### Task 6: Vendor modules (codex, claude, grok, gemini, antigravity)

**Files:**
- Create: `lib/vendors/codex.js`, `claude.js`, `grok.js`, `gemini.js`, `antigravity.js`, `lib/vendors/index.js`
- Test: `test/vendors.test.mjs` with mocked `fetchImpl`

**Interfaces:**
- Each vendor exports `{ id, providerInfo(), authorizeUrl(cfg, pkce), exchangeCode(cfg, pkce, code), refresh(cfg, blob), streamOnce(ctx), listModels(blob), usage(blob) }`
- `usage` returns `{ percent: number } | null` if the vendor has no usage API.

- [ ] **Step 1: Codex against mocked token + models + chat endpoints (OpenAI-style). No real network.**

- [ ] **Step 2: Claude OAuth + Anthropic Messages stream mock.**

- [ ] **Step 3: Grok OAuth + xAI chat mock. No `x_search` tool.**

- [ ] **Step 4: Gemini + Antigravity Google OAuth; stream via generateContent or the vendor's documented Code Assist endpoint. Mock only.**

- [ ] **Step 5: OAuth client IDs/URLs are `Config` fields with empty or vendor-public defaults and README placeholders (`YOUR_CLIENT_ID`).**

- [ ] **Step 6: Commit `feat(subs): vendor OAuth and stream adapters`.**

---

### Task 7: Settings UI

**Files:**
- Modify: `lib/client.js`
- Test: `test/client-factory.test.mjs`

**Interfaces:**
- Section label `Subscriptions`, order ~28.
- Per provider: account rows, Connect (opens `/dsh-subscriptions/oauth/start` URL), paste callback, Disconnect, reorder, usage/cooldown badges.

- [ ] **Step 1: Assert client source contains `var exports = module.exports`, `/dsh-subscriptions/oauth`, and `return module.exports`.**

- [ ] **Step 2: Load config on mount from `GET /dsh-subscriptions/config`. Save slots via PUT. Never put tokens in React state except the paste-URL draft.**

- [ ] **Step 3: Commit `feat(subs): Subscriptions settings card`.**

---

### Task 8: README, install, smoke

**Files:**
- Modify: `README.md`, `package.json` version if needed

- [ ] **Step 1: README: install command, Settings flow, provider table, credential *names* as placeholders, no live accounts.**

- [ ] **Step 2: `npm test` all green. `node --check` on `lib/*.js` (skip browser factory syntax if needed; factory is valid JS).**

- [ ] **Step 3: Staging/web `file:` install via plugin-guard: remove+add, `ls` installed `lib/` vs source, restart, HTTP 200 on `/plugins/@goodandready/dsh-subscriptions/client.js`, boot JSON contains the scoped id. Hard-refresh. Connect is a manual smoke (user completes OAuth).**

- [ ] **Step 4: Commit `docs(subs): README for published OAuth subscriptions`.**

---

## Spec coverage

| Spec section | Task |
|---|---|
| Three id sites | 1 |
| Credentials refs/blobs | 2 |
| PKCE, callback origin, paste URL | 3, 4, 7 |
| Rotation + usage skip | 3, 5 |
| LLM adapter + picker | 5, 6 |
| Five providers | 6 |
| Settings UI | 7 |
| No tools / no Copilot / no Cursor | 6, 7 (do not add) |
| Tests + release impersonality | 1, 8 |
