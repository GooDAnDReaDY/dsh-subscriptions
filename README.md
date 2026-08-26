# dsh-subscriptions

Use **ChatGPT Codex**, **Claude**, **Grok**, and **Antigravity**
subscriptions as DeepSeek Harness LLM providers. Log in from
**Settings → Plugins → Plugin settings → Subscriptions**.
Several accounts per provider rotate on quota inside this plugin.

This package is original software. It speaks vendor-public OAuth and LLM HTTP
contracts. It does not ship tools (`x_search`, image, or video).

## Install

```bash
dsh plugin --profile web add @goodandready/dsh-subscriptions
```

Local checkout (development):

```bash
dsh plugin --profile web add file:/path/to/dsh-subscriptions
```

After a `file:` install, remove then add again if you added new files under
`lib/` — pnpm reuses the previous copy otherwise.

## Settings

Settings live on a collapsible card in **Settings → Plugins → Plugin settings**
(not a sidebar entry). Click **Show** to expand it.

1. Pick a provider block and click **Connect**. Complete sign-in in the browser.
2. **+ Add account** adds another account slot for the same provider; every
   account participates in rotation.
3. **Disconnect** removes that account's token; **Reconnect** repeats OAuth on
   the same slot. The × button disconnects and drops the slot.
4. If the provider redirects to a localhost or vendor URL that this host cannot
   receive, paste the full redirected URL (or the `code` value) into the
   account row and click **Submit code**.
5. Logged-in providers appear in the session model picker.

Leave **Use this Web UI origin as OAuth redirect_uri** off unless you registered
your own OAuth client for this origin. Vendor CLI clients typically require
their published redirect URI plus the paste step.

## Accounts and rotation

Each provider holds any number of account slots (`CODEX_OAUTH_1`,
`CODEX_OAUTH_2`, …). On `RATE_LIMIT`, `QUOTA`, or HTTP 429 the plugin cools the
account down (`cooldownMs`, default 30 minutes) and retries the same request on
the next account of the same provider — never a different provider.

Beyond error-driven rotation, accounts are proactively skipped when:

- usage is at 100% for the current window (vendor-reported), or
- remaining quota fraction is at or below `switchAtRemaining`
  (default `0.01` = 1%), or
- the window resets within one minute (no point spending the tail).

When every account is below threshold, the request still goes out on the first
exhausted account — a refusal beats silence.

## Quota visibility

Vendors that report usage expose named windows (Claude `5h`/`7d apps`,
Codex primary/secondary, Grok credits). Each window renders as a progress bar
with percent; colors follow theme variables (normal / warning ≥70% / exhausted
100%). The last known snapshot persists across harness restarts and refreshes
on the next successful request.

The plugin also estimates remaining requests for the primary window
(`≈ N (5h)`) once enough request history exists — hidden when data is thin.

### Limit notifications

When a window crosses 70%, 90%, or 100%, the plugin logs a warning and emits a
`subscriptions.limit-notice` event (provider, ref, window id, usedPercent,
threshold). Each threshold fires once per window until it resets. Toggle with
`notifyLimits` in Config.

## Background maintenance

Two timers run while the plugin is loaded:

- **Token refresh ahead**: expiring tokens are refreshed before they are needed
  (`refreshAheadMs`, default 5 min). Failures back off via `refreshRetryMs`
  (default 10 min) and mark the card as *reconnect required*.
- **Health probe loop**: every `probeIntervalMin` minutes (default 15, 0
  disables) each connected account gets a cheap vendor check. Dead accounts
  surface in the card; probes never set cooldown.

Both timers clean up on plugin dispose.

## HTTP proxy

`POST|GET /dsh-subscriptions/proxy/{provider}/{path…}` forwards to the vendor
API on behalf of a logged-in account — through the same allowlist, rotation,
and quota accounting as model traffic. Same-origin only; no token ever appears
in a response or log. Paths outside the per-provider allowlist get 403.

Example:

```bash
curl -X POST https://<host>:3080/dsh-subscriptions/proxy/codex/models \
  -H 'Content-Type: application/json' -d '{}'
```

## Export / import

Tokens live in the host credentials store and normally tie the installation to
one machine. To move them:

```bash
# export (returns an encrypted DSHE1 payload)
curl -X POST https://<host>:3080/dsh-subscriptions/export \
  -H 'Content-Type: application/json' -d '{"passphrase":"strong-passphrase"}'

# import
curl -X POST https://<host>:3080/dsh-subscriptions/import \
  -H 'Content-Type: application/json' \
  -d '{"passphrase":"strong-passphrase","payload":"DSHE1:…"}'
```

Bundles are AES-256-GCM encrypted with a key derived from your passphrase
(scrypt). Without the passphrase nothing decrypts; wrong passphrase fails with
a clear error. Tokens are never logged.

## Composer provider switcher

A small widget in the composer bar shows the active subscription provider;
clicking cycles among logged-in providers without opening Settings. It does not
change the session model picker state.

## Session header chip

A compact chip in the conversation header shows how many subscriptions are
connected. It polls `/dsh-subscriptions/status` every minute and turns green
when at least one account is active.

## Quota reset countdown

When a vendor reports a quota window reset timestamp, the account card shows a
live `reset HH:MM:SS` countdown next to the quota bar, updating every second.

## Slash commands

From the chat, without opening Settings:

```
/login <provider>     # start OAuth for codex|claude|grok|antigravity (opens the vendor page)
/login status         # insert the connected providers into the composer
/logout <provider>    # disconnect that provider
```

## /subscriptions page

A localhost-only summary page at `/subscriptions` lists every account slot,
connection status, usage percent, remaining quota and reset time across all
providers. Requests from non-loopback hosts get 403.

## Import a token directly

In any account card, paste an existing refresh token (or API key) and click
**Import token** to sign in without the browser OAuth round trip. The token is
written straight to the host credentials store via
`POST /dsh-subscriptions/import-token { provider, index, refreshToken }`.


## Credential names

Tokens are JSON blobs in the DSH credentials store. Names look like:

```text
CODEX_OAUTH_1
CLAUDE_OAUTH_2
```

`<PROVIDER>` is `CODEX`, `CLAUDE`, `GROK`, or `ANTIGRAVITY`.
Settings GET never returns access or refresh tokens — only
`{ configured, label, usagePercent, cooldownUntil, ref }`.

## Providers

| Key | Subscription | Default OAuth client |
|---|---|---|
| `codex` | ChatGPT / Codex | Vendor-public Codex CLI client id |
| `claude` | Claude Pro/Max | Vendor-public Claude Code client id |
| `grok` | xAI / SuperGrok | Vendor-public Grok CLI client id |
| `antigravity` | Google Antigravity | Your OAuth client id + secret in Config |

Override `codexClientId`, `claudeClientId`, and the other empty Config fields
if you register your own OAuth app.

Live requests use the vendor subscription surfaces, not API-key hosts:
Codex `chatgpt.com/backend-api/codex/responses`, Claude Messages with the
OAuth beta header, Grok `cli-chat-proxy.grok.com` with CLI identity headers,
and Antigravity Cloud Code Assist (`loadCodeAssist` then
`streamGenerateContent`). Usage endpoints, when they answer, feed the skip
logic above. If a live model list fails, the built-in catalog is used.

Antigravity uses a confidential Google OAuth client: set `antigravityClientId`
and `antigravityClientSecret` in plugin Config (Settings) — nothing is baked
into the repository.

Default model catalogs are built-in lists you can replace with
`codexModels`, `claudeModels`, `grokModels`, `antigravityModels`
in the plugin Config.

### Config reference

| Key | Default | Meaning |
|---|---|---|
| `cooldownMs` | 1800000 | Cooldown after RATE_LIMIT/QUOTA/429 |
| `switchAtRemaining` | 0.01 | Skip account when remaining ≤ this (fraction <1 or absolute ≥1); 0 disables |
| `refreshAheadMs` | 300000 | Refresh tokens expiring within this window |
| `refreshRetryMs` | 600000 | Backoff after a failed background refresh |
| `probeIntervalMin` | 15 | Account health-check interval, minutes; 0 disables |
| `notifyLimits` | true | Emit notices when usage crosses 70/90/100% |
| `useWebCallback` | false | Use Web UI origin as OAuth redirect_uri |
| `<vendor>Models` | built-in | Replace default model catalog per vendor |

## Identity

These three names must match:

| Place | Value |
|---|---|
| `package.json` `name` | `@goodandready/dsh-subscriptions` |
| `cordis.patch.yml` `name:` | `@goodandready/dsh-subscriptions` |
| `lib/client.js` loader `id` | `@goodandready/dsh-subscriptions` |

## License

MIT