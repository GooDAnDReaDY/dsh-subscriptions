# dsh-subscriptions design (2026-08-20)

Publishable DeepSeek Harness plugin: use **subscription OAuth** as LLM
providers, with several accounts per provider and rotation on limits.

Package: `@goodandready/dsh-subscriptions`. Original implementation. Do not
copy source from third-party subscription plugins. Vendor OAuth and LLM HTTP
contracts are public protocols.

## Goal

Settings -> **Subscriptions**: Connect / Disconnect per account. Logged-in
providers appear in the session model picker. When the current account hits a
limit, the plugin retries on the next account of the **same** provider. Tokens
live in the DSH credentials store.

## Non-goals (v1)

- GitHub Copilot, Cursor, MiniMax, Qwen, Claude Code import
- `image_generate`, `video_generate`, `x_search`, any other tools
- Coupling to `@goodandready/dsh-key-rotation` (rotation is local to this plugin)
- API-key providers (OpenRouter, Groq, platform keys) — already covered elsewhere
- Telegram / messenger hub

## Identity (must match in three places)

| Place | Value |
|---|---|
| `package.json` `name` | `@goodandready/dsh-subscriptions` |
| `cordis.patch.yml` `name:` | `@goodandready/dsh-subscriptions` |
| `lib/client.js` loader `id` | `@goodandready/dsh-subscriptions` |

Patch `id:` may stay short: `dsh-subscriptions`.

## Providers (v1)

| Key | Subscription | Auth |
|---|---|---|
| `codex` | ChatGPT Plus/Pro (Codex backend) | OAuth PKCE |
| `claude` | Claude Pro/Max | OAuth PKCE (not Claude Code files) |
| `grok` | xAI / X Premium | OAuth PKCE |
| `gemini` | Google Gemini / Gemini CLI style | OAuth PKCE |
| `antigravity` | Google Antigravity / Cloud Code Assist style | OAuth PKCE |

Several accounts per provider. Display names are user labels (email or "Account 2"), never the refresh token.

## OAuth

- Connect opens the provider authorize URL in the browser.
- `redirect_uri` is the **same origin as the DSH Web UI**:
  `{webOrigin}/dsh-subscriptions/oauth/callback`.
- Do not use `127.0.0.1` on the operator's laptop as the only callback: the
  harness often runs on another host.
- Fallback: paste the full redirected URL or the `code` query param into the
  account card (headless / SSH / popup blocked).
- PKCE S256. State bound to the in-progress login (provider + account slot).
- Refresh tokens stay on the host. Access tokens refresh before expiry.
- Failed refresh: mark the account unusable, rotate to the next, surface
  "reconnect" on that card.

Client IDs / redirect URIs are the **vendor-published** OAuth client used by
that product's CLI or web app, documented as configuration with placeholders,
not as secrets copied from our machines.

## Credentials

- Persist via `credentials.set` / `resolve` / `unset`.
- Refs are env-style names: `<PROVIDER>_OAUTH_1`, `_2`, … matching
  `^[A-Za-z_][A-Za-z0-9_]*$`.
- Stored value is a JSON blob owned by this plugin (access, refresh, expiry,
  account label). GET settings never returns the blob — only
  `{ configured, writable, ref, label, usage? }`.
- Plugin `Config` stores account **slots** (provider, ref, order), not secrets.

## Rotation (this plugin only)

Per provider, ordered account list:

1. Skip accounts with no usable token.
2. Skip accounts whose **current usage window is 100%** when the vendor
   exposes usage.
3. Call the LLM with the first remaining account.
4. On switchable errors (`RATE_LIMIT`, `QUOTA`, HTTP 429, vendor-equivalent
   billing/limit codes): put that account in cooldown (`cooldownMs`, default
   30 minutes), retry the **same request** on the next account.
5. If every account fails, return the last error. Do not silently switch to
   another provider.

The model/provider the user picked does not change. Only the account (token)
changes. Cooldown ends automatically; usage 100% is re-checked when usage
refresh succeeds.

Settings show per account: in use / ready / cooling down / reconnect needed /
usage bar when available.

## LLM

- Register a DSH LLM adapter (or one per provider route) so subscription
  models appear in the picker **only when at least one account is logged in**.
- Catalogs: live from the vendor when the protocol has a models endpoint;
  otherwise a small built-in list that can be overridden in config.
- Translate DSH `Message[]` to each vendor wire format (OpenAI responses /
  chat, Anthropic messages, Google generateContent, xAI). Stream back as DSH
  chunks. Handlers on `llm/stream` must not be `async`.
- Vision: if the model advertises image input, map image blocks; otherwise
  fail clearly.
- Required adapter surface: whatever current dsh-llm calls unconditionally
  (including `providerRetryPolicy` if still required). Verify against the
  installed harness, do not invent methods.

## Settings UI

Section **Subscriptions**, HTTP config like other published plugins
(`GET`/`PUT /dsh-subscriptions/config`), not a dead `settingsScope`.

Per provider card:

- list of accounts, add account, Connect, Disconnect, reorder
- usage + rotation state
- password-less: OAuth button, not a paste-API-key field (except the callback
  URL fallback)

Browser bundle: CommonJS shim (`var exports = module.exports`),
`dsh.client.platform === "web"`, `return module.exports`.

## Host routes

| Route | Role |
|---|---|
| `GET`/`PUT /dsh-subscriptions/config` | slots, labels, rotation settings; no secrets |
| `GET /dsh-subscriptions/oauth/start` | `{provider, account}` -> authorize URL |
| `GET /dsh-subscriptions/oauth/callback` | exchange `code`, store credential, close/redirect UI |
| `POST /dsh-subscriptions/oauth/complete` | paste-URL fallback |
| `POST /dsh-subscriptions/logout` | unset that credential ref |
| `GET /dsh-subscriptions/status` | logged-in flags for picker/poller |

Same-origin writes. Do not require loopback (LAN / reverse proxy).

## Tests

- PKCE/state binding, credential ref naming, secret stripping on GET
- Rotation: skip 100% usage, cooldown on 429, exhaust pool
- Client factory returns `apply` after the CommonJS shim
- Adapter: logged-out provider is absent; logged-in provider streams a fake
  upstream
- No real refresh tokens in fixtures

## Release

Publication route: Gitea `goodandready/dsh-subscriptions` -> test on staging
Web UI -> RELEASE copy -> GitHub `GooDAnDReaDY/dsh-subscriptions` + npm
`@goodandready/dsh-subscriptions`. README/LICENSE placeholders only. No host
paths, IPs, or live tokens in the tree.

After `file:` install: remove+add so pnpm copies new files; then restart Web UI
and hard-refresh. Scoped name check: boot JSON id and `/plugins/@goodandready/dsh-subscriptions/client.js` HTTP 200.
