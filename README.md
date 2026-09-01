# 📦 @goodandready/dsh-subscriptions

<div align="center">

<h3>Personal AI Subscription Bridge, Multi-Account Pool Rotation & Zero-Leak OAuth for DeepSeek Harness</h3>

<p align="center">
  <a href="https://www.npmjs.com/package/@goodandready/dsh-subscriptions"><img src="https://img.shields.io/npm/v/@goodandready/dsh-subscriptions.svg?style=for-the-badge&color=6366f1&labelColor=1e1b4b" alt="npm version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-10b981.svg?style=for-the-badge&color=10b981&labelColor=064e3b" alt="license"></a>
  <a href="https://github.com/topics/dsh-plugin"><img src="https://img.shields.io/badge/DSH-Plugin-8b5cf6.svg?style=for-the-badge&labelColor=2e1065" alt="DSH Plugin"></a>
  <a href="https://nodejs.org"><img src="https://img.shields.io/badge/Node-20%2B-f59e0b.svg?style=for-the-badge&labelColor=451a03" alt="Node version"></a>
</p>

<p align="center">
  <a href="https://goodandready.app/"><img src="https://img.shields.io/badge/All_Author_Projects-goodandready.app-ff4500.svg?style=for-the-badge&logo=rocket&logoColor=white&labelColor=1a1a2e" alt="All Author Projects"></a>
</p>

<p align="center">
  <a href="README.md"><b>🇬🇧 English</b></a> •
  <a href="README.ru.md"><b>🇷🇺 Русский</b></a> •
  <a href="README.zh.md"><b>🇨🇳 中文说明</b></a>
</p>

</div>

---

## ⚡ Overview

**`dsh-subscriptions`** bridges your paid personal AI subscriptions directly into **DeepSeek Harness** as first-class LLM providers.

Instead of burning expensive pay-as-you-go API credits for everyday agent tasks, `dsh-subscriptions` allows you to authenticate your existing web subscriptions via standard OAuth PKCE. It features **multi-account rotation pools** (automatically switching accounts when a rate limit or cooldown is reached), **preemptive quota switching**, and an **in-process Cordis service (`ctx.subscriptions`)** that safely powers sibling plugins like [`dsh-image-gen`](https://github.com/GooDAnDReaDY/dsh-image-gen) and [`dsh-grok-xsearch`](https://github.com/GooDAnDReaDY/dsh-grok-xsearch) with zero token leakage.

```mermaid
graph LR
    subgraph DSHCore [DeepSeek Harness Session]
        Agent[🤖 DSH Agent Execution] --> Router{Provider Router}
    end

    subgraph SubscriptionsCore [dsh-subscriptions Engine]
        Router --> Pool{Multi-Account Vendor Pool}
        Pool -->|Account #1| Acc1[👤 Primary Account: Active]
        Pool -->|Account #2| Acc2[👤 Secondary Account: Standby]
        Pool -->|Account #3| Acc3[👤 Fallback Account: Cooldown]
        Acc1 -->|HTTP 429 / Quota Limit| Rotate[Smart Quota & Cooldown Rotator]
        Rotate -->|Switches Traffic| Acc2
    end

    subgraph VendorBridges [4 Upstream Vendor Bridges]
        Acc1 --> B1[ChatGPT / Codex Backend]
        Acc1 --> B2[Claude Pro / Max Protocol]
        Acc1 --> B3[xAI / Grok Subscriptions]
        Acc1 --> B4[Google Cloud Code Assist / Antigravity]
    end

    subgraph EcosystemBridge [In-Process Cordis Service: ctx.subscriptions]
        Pool --> ImgGen[dsh-image-gen: Zero-Cost Image Drawing]
        Pool --> XSearch[dsh-grok-xsearch: Live Twitter Search]
    end

    style DSHCore fill:#1e1e2e,stroke:#89b4fa,stroke-width:2px,color:#cdd6f4
    style SubscriptionsCore fill:#181825,stroke:#cba6f7,stroke-width:2px,color:#cdd6f4
    style VendorBridges fill:#11111b,stroke:#a6e3a1,stroke-width:2px,color:#cdd6f4
    style EcosystemBridge fill:#181825,stroke:#f38ba8,stroke-width:2px,color:#cdd6f4
```

---

## ✨ Key Features & Capabilities

### 1. 🌐 4 Supported Built-in Subscription Vendors

| Vendor Key | Subscription Tier | Protocol & Features |
|---|---|---|
| `codex` | ChatGPT Plus / Pro | Codex streaming responses, tool calling & image drawing (`/backend-api/codex/...`) |
| `claude` | Claude Pro / Max | Native Claude Messages protocol, usage tracking (`/v1/messages`, `/api/oauth/...`) |
| `grok` | xAI / X Premium | Real-time reasoning responses, billing checks & social search |
| `antigravity` | Google Cloud Code Assist | Antigravity engine (`/v1/loadCodeAssist`, `/v1/streamGenerateContent`) |

*Custom vendors can also be dynamically registered via the `createVendorFromProfile` factory.*

---

### 2. 🔄 Multi-Account Rotation & Rate-Limit Mitigation (`rotate.js`, `ratelimit.js`)
* **Multi-Account Pooling**: Attach multiple accounts per vendor (e.g. `CODEX_OAUTH_1`, `CODEX_OAUTH_2`, `CODEX_OAUTH_3`).
* **Automatic 429 Failover**: When an account encounters a rate limit (`HTTP 429`, `RATE_LIMIT`, `QUOTA_EXCEEDED`), traffic instantly fails over to the next healthy account in the pool.
* **Preemptive Quota Switching (`switchAtRemaining`)**: Automatically rotates to the next account before hitting zero if the rate-limit window reset is imminent.
* **Dynamic Cooldown Calculation**: Parses upstream headers (`Retry-After`, `x-ratelimit-reset`, ISO dates, epoch timestamps) and auto-restores cooled-down accounts when their window resets.

---

### 3. 🔒 Zero-Leak Credential Security & Headless OAuth
* **Zero Token Leakage**: OAuth tokens are **never** returned over HTTP API endpoints or rendered in the Web UI. The UI only receives masked account labels, connection health, and quota bars.
* **Secure Host Storage**: Tokens reside in encrypted `$DSH_HOME/.credentials.yaml` managed by the host credentials service.
* **Headless / Remote Login Fallback**: If running DSH on a headless server over SSH where browser popups cannot redirect to `localhost`, simply paste the redirected callback URL or authorization code directly into the account card.
* **Proactive Background Token Refresh**: Access tokens are refreshed automatically before expiration.

---

### 4. 🧩 In-Process Cordis Service (`ctx.subscriptions`)
Sibling plugins can tap into subscription capabilities directly in memory via Cordis:
```javascript
// Example in dsh-image-gen or custom plugins:
const res = await ctx.subscriptions.request('codex', '/backend-api/codex/images/generations', {
  method: 'POST',
  body: JSON.stringify({ prompt: 'Cyberpunk landscape', size: '1024x1024' }),
})
```
* **Zero Overhead**: Eliminates intermediate HTTP loops and keeps auth tokens strictly in-memory.
* **Strict Path Allowlist (`ALLOWLIST`)**: Restricts calls to verified vendor endpoints, preventing SSRF vulnerabilities.

---

### 5. 🔐 Login Without a Browser: Loopback & Device Code (`v0.4.9`)
* **Automatic Loopback Callback (`autoLoopback`, on by default)**: For vendors whose OAuth redirect URI is a loopback address (Codex `:1455`, Grok `:56121`), the plugin spins up a temporary local HTTP server and catches the callback by itself — no URL pasting needed. The paste fallback always stays available.
* **Device Code Login (Codex)**: On fully headless machines (no browser on any reachable host), use the **Device login** button in the Codex account card. The plugin requests a short user code from `auth.openai.com`, you open `https://auth.openai.com/codex/device` on any device, enter the code, and the plugin completes the standard PKCE exchange automatically.
* **Classic Fallbacks Intact**: Web-origin redirect (`useWebCallback`) and manual paste of the redirected URL / authorization code remain available for custom OAuth clients.

### 6. 🌍 Per-Account HTTP/SOCKS Proxy (`v0.4.9`)
* **Individual Proxy per Account (`proxyUrl`)**: Every account slot accepts its own proxy URL (`http://`, `https://`, `socks5://[user:pass@]host:port`). All requests for that account — OAuth token refresh, vendor checks, model requests — are routed through it. Empty = direct connection.
* **One-Click Proxy Check**: The account card has a **Check proxy** button: it performs a real request to the vendor base URL through the configured proxy and shows the round-trip latency or the failure reason.
* **Request History Timings**: Every recorded request now carries its duration (`ms`) in the history store, so you can compare direct vs proxied latency over time.

### 7. 🕶️ Privacy Masking & Diagnostics Report (`v0.4.9`)
* **Privacy Masking (`privacyMask`)**: One toggle in the settings card masks personal data across the whole UI: emails render as `j***n@example.com` everywhere (account lists, status labels, check results). Designed for screen sharing and streaming. Server-side masking means labels never leak through API responses either; the underlying account data is never overwritten.
* **Anonymized Diagnostics Report**: The settings card has a **Generate diagnostics report** block: one click fetches an anonymized report (plugin/runtime versions, OS, per-vendor health counters, aggregate HTTP status counts, last ≥400 errors with timings, non-secret settings) and copies it to the clipboard. Tokens, emails, credential refs and proxy URLs are strictly excluded (verified by tests).
* **Issue-Ready**: The same block links to the project issue tracker, so a bug report is: generate → paste → submit.

### 8. 🔌 HTTP API (added in `v0.4.9`)
| Route | Method | Purpose |
|---|---|---|
| `/dsh-subscriptions/diagnostics` | GET | Anonymized diagnostics report (no secrets, no tokens, no proxy URLs) |
| `/dsh-subscriptions/proxy-check` | POST | Latency check of a slot's proxy against its vendor base URL |
| `/dsh-subscriptions/oauth/device/start` | POST | Begin Codex device-code login (returns user code + verification URL) |
| `/dsh-subscriptions/oauth/device/poll` | POST | Poll device-code authorization status |

---

### 9. 🦛 Local Ollama Gateway & Seamless Fallback (`v0.4.17`)
* **Native Provider (`ollama`)**: When a local Ollama is reachable at `ollamaBaseUrl` (default `http://127.0.0.1:11434`), it appears in the native DSH model picker with the models discovered from `/api/tags`. No API key needed.
* **Seamless Quota Fallback (`ollamaFallback`, on by default)**: When every account of a provider is exhausted (or unreachable) and nothing has been streamed yet, the chat continues on a local model (`ollamaFallbackModel`, or the first model from `/api/tags`). The fallback is logged and recorded in request history as `kind: fallback`.
* **Free ($0) Emergency Path**: Works with no internet and no quota — ideal for offline demos.

### 10. ⚡ Reasoning Effort, Verbosity & Fast Mode (`v0.4.17`)
* **Reasoning Effort**: Codex models advertise their supported effort levels from the live catalog; the native picker validates and the chosen effort is transmitted as `reasoning.effort` in the Codex `/responses` protocol. Grok forwards effort with its own catalog-aware filtering.
* **Verbosity (`codexVerbosity`)**: `low` / `medium` / `high` is sent as `text.verbosity` for Codex reasoning models. Empty = protocol default.
* **Fast Mode (`codexFastMode`)**: Sends `service_tier: priority` (1.5x speed billing tier) with every Codex request. The active-subscription chip shows a `⚡` prefix while enabled.

### 11. 🚦 Family-Scoped Cooldowns & Model Filtering (`v0.4.17`)
* **Reasoning vs Standard**: A 429 on a reasoning model (claude `*thinking*`, grok `*reasoning*`, all codex models) cools down only the reasoning family of that account — standard models on the same account keep working immediately. Legacy cooldowns (from older versions) still block the whole account until expiry.
* **Hide Deprecated Models (`hideDeprecatedModels`)**: Filters `test`/`preview`/`dev`/`alpha`/`beta`/`legacy` model ids out of the native picker (applies to live catalogs and the static fallback).

---

## 📦 Quick Installation

```bash
dsh plugin --profile web add @goodandready/dsh-subscriptions
```

> [!IMPORTANT]
> Restart DSH Web UI after installation (`systemctl --user restart dsh-web`) and navigate to **Settings → Subscriptions** to link your accounts.

---

## ⚙️ Configuration Reference (`settings.yaml`)

```yaml
dsh-subscriptions:
  switchAtRemaining: 1
  cooldownMs: 60000
  autoLoopback: true        # v0.4.9: catch loopback OAuth callbacks automatically
  privacyMask: false        # v0.4.9: mask emails and account identifiers in the UI
  ollamaBaseUrl: http://127.0.0.1:11434  # v0.4.17: local Ollama gateway
  ollamaFallback: true      # v0.4.17: seamless fallback when all accounts are exhausted
  ollamaFallbackModel: ''   # v0.4.17: e.g. qwen2.5-coder; empty = first model from /api/tags
  hideDeprecatedModels: false # v0.4.17: filter test/preview/beta/legacy model ids
  codexVerbosity: ''        # v0.4.17: low | medium | high (text.verbosity)
  codexFastMode: false      # v0.4.17: service_tier priority (1.5x speed tier)
  # Per-slot fields (v0.4.9): expiresAt (ms epoch), proxyUrl (http/https/socks5://)
  accounts:
    codex:
      - ref: CODEX_OAUTH_1
        label: "Work Pro Account"
      - ref: CODEX_OAUTH_2
        label: "Personal Plus Account"
    claude:
      - ref: CLAUDE_OAUTH_1
        label: "Claude Max"
    grok:
      - ref: GROK_OAUTH_1
        label: "X Premium"
```

---

## 📄 License

MIT © [GooDAnDReaDY](https://github.com/GooDAnDReaDY)
