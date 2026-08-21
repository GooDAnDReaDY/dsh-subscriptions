# dsh-subscriptions

Use **ChatGPT Codex**, **Claude**, **Grok**, **Antigravity**
subscriptions as DeepSeek Harness LLM providers. Log in from
**Settings → Subscriptions**. Several accounts per provider rotate on quota
inside this plugin.

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

1. Open **Settings → Subscriptions**.
2. Pick a provider card and click **Connect**. Complete sign-in in the browser.
3. **Disconnect** removes that account's token so you can connect again. **Reconnect** repeats OAuth on the same slot. The × on the card also disconnects, then drops the slot.
4. If the provider redirects to a localhost or vendor URL that this host cannot
   receive, paste the full redirected URL (or the `code` value) into the account
   row and click **Submit code**.
5. Logged-in providers appear in the session model picker.

Leave **Use this Web UI origin as OAuth redirect_uri** off unless you registered
your own OAuth client for this origin. Vendor CLI clients typically require
their published redirect URI plus the paste step.

Disconnect removes that account's blob from the host credentials store.

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
`streamGenerateContent`). Usage endpoints, when they answer, feed the 100%
skip. If a live model list fails, the built-in catalog is used.
Antigravity uses a confidential Google OAuth client: set `antigravityClientId`
and `antigravityClientSecret` in plugin Config (Settings) — nothing is baked
into the repository.

Default model catalogs are built-in lists you can replace with
`codexModels`, `claudeModels`, `grokModels`, `antigravityModels`
in the plugin Config.

## Rotation

On `RATE_LIMIT`, `QUOTA`, or HTTP 429 the plugin cools that account down
(default 30 minutes) and retries the **same provider** on the next account.
It never switches to a different provider. Accounts at 100% usage (when the
vendor reports usage) are skipped.

This plugin does not call `dsh-key-rotation`.

## Identity

These three names must match:

| Place | Value |
|---|---|
| `package.json` `name` | `@goodandready/dsh-subscriptions` |
| `cordis.patch.yml` `name:` | `@goodandready/dsh-subscriptions` |
| `lib/client.js` loader `id` | `@goodandready/dsh-subscriptions` |

## License

MIT
