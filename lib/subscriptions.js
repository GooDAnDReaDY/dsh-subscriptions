import { isProvider } from "./refs.js"
import { pickAccount, markCooldown, isSwitchableError, modelFamily } from "./rotate.js"
import { quotaSnapshot } from "./ratelimit.js"
import { getVendor } from "./vendors/index.js"
import { pickFetch } from "./proxy.js"

// ponytail: allowlist per provider — add path to extend without touching request logic
export const ALLOWLIST = {
  codex: ["/responses", "/models", "/images/generations", "/backend-api/codex/responses", "/backend-api/codex/models", "/backend-api/codex/images/generations"],
  claude: ["/v1/messages", "/api/oauth/profile", "/api/oauth/usage", "/v1/models"],
  grok: ["/v1/models", "/responses", "/v1/responses", "/v1/billing", "/v1/chat/completions", "/images/generations", "/v1/images/generations"],
  antigravity: ["/v1/models", "/v1/generateContent", "/v1/streamGenerateContent", "/v1/loadCodeAssist", "/v1/fetchAvailableModels", "/v1/countTokens", "/v1/internal:loadCodeAssist"],
}

export function isAllowed(provider, path) {
  if (!isProvider(provider)) return false
  const list = ALLOWLIST[provider] || []
  let p = String(path || "")
  // strip query and hash
  p = p.split("?")[0].split("#")[0]
  try {
    if (p.startsWith("http://") || p.startsWith("https://")) p = new URL(p).pathname
  } catch {}
  if (!p.startsWith("/")) p = "/" + p
  for (const allowed of list) {
    const a = allowed.split("?")[0]
    if (p === a) return true
    if (p.startsWith(a + "/")) return true
    if (p.startsWith(a + "?")) return true
  }
  return false
}

function baseFor(provider, cfg) {
  if (provider === "codex") return (cfg.baseUrl || "https://chatgpt.com/backend-api/codex").replace(/\/$/, "")
  if (provider === "grok") return (cfg.baseUrl || "https://api.x.ai/v1").replace(/\/$/, "")
  if (provider === "claude") return "https://api.anthropic.com"
  if (provider === "antigravity") return "https://cloudcode-pa.googleapis.com"
  return (cfg.baseUrl || "").replace(/\/$/, "")
}

function headersFor(provider, blob, cfg) {
  const h = {}
  if (provider === "codex" && blob.accountId) {
    h["chatgpt-account-id"] = blob.accountId
    h["ChatGPT-Account-ID"] = blob.accountId
    h["originator"] = cfg.originator || "codex_cli_rs"
  }
  if (provider === "grok" && String(cfg.baseUrl || "").includes("grok.com")) {
    h["X-XAI-Token-Auth"] = "xai-grok-cli"
    h["x-grok-client-identifier"] = "grok-shell"
    h["x-grok-client-version"] = cfg.clientVersion || "0.2.103"
  }
  if (provider === "antigravity" && blob.projectId) {
    h["x-goog-user-project"] = blob.projectId
  }
  return h
}

export function createSubscriptionsService(deps) {
  return {
    async available(provider) {
      if (provider) {
        if (!isProvider(provider)) return false
        const accs = await deps.listAccounts(provider)
        return accs.some((a) => a.hasToken)
      }
      const providers = ["codex", "claude", "grok", "antigravity"]
      const out = []
      for (const p of providers) {
        const accs = await deps.listAccounts(p)
        if (accs.some((a) => a.hasToken)) out.push(p)
      }
      return out
    },
    async request({ provider, path, method = "GET", headers = {}, body, signal }) {
      if (!isProvider(provider)) {
        const err = new Error("unknown provider: " + provider)
        err.code = "PROVIDER"
        throw err
      }
      if (!isAllowed(provider, path)) {
        const err = new Error("path not allowed for " + provider + ": " + path)
        err.code = "FORBIDDEN"
        throw err
      }
      const list = await deps.listAccounts(provider)
      const thr = typeof deps.switchAtRemaining === "function" ? deps.switchAtRemaining() : (deps.switchAtRemaining ?? 0)
      const cooldownMs = typeof deps.cooldownMs === "function" ? deps.cooldownMs() : (deps.cooldownMs ?? 30 * 60 * 1000)
      // copy pool for rotation
      const pool = list.map((a) => ({ ...a }))
      const tried = new Set()
      let lastError = null
      while (true) {
        const account = pickAccount(pool, Date.now(), { switchAtRemaining: thr, family: modelFamily(provider, body && body.model) })
        if (!account) {
          if (lastError) throw lastError
          const err = new Error("no usable subscription account for this provider")
          err.code = "AUTH"
          throw err
        }
        if (tried.has(account.ref)) {
          if (lastError) throw lastError
          const err = new Error("all subscription accounts failed")
          err.code = "RATE_LIMIT"
          throw err
        }
        tried.add(account.ref)
        try {
          const blob = await deps.ensureFresh(provider, await deps.loadBlob(account.ref), account.ref)
          const cfg = deps.vendorConfig(provider)
          const base = baseFor(provider, cfg)
          // normalize path
          let p = String(path)
          if (p.startsWith("http://") || p.startsWith("https://")) {
            // full URL, use as is
          } else {
            if (!p.startsWith("/")) p = "/" + p
            // for codex, path /responses should become base + /responses
            // for claude, path /v1/messages with base https://api.anthropic.com => https://api.anthropic.com/v1/messages
            p = base + p
          }
          const url = p
          const extraHeaders = headersFor(provider, blob, cfg)
          const fetchImpl = pickFetch(deps, account.ref)
          const t0 = Date.now()
          const res = await fetchImpl(url, {
            method,
            headers: {
              Authorization: "Bearer " + blob.accessToken,
              Accept: "application/json",
              ...extraHeaders,
              ...headers,
              ...(body && typeof body === "object" && !(body instanceof Uint8Array) && !(typeof body === "string") ? { "Content-Type": "application/json" } : {}),
            },
            body: body && typeof body === "object" && !(body instanceof Uint8Array) && typeof body !== "string" ? JSON.stringify(body) : body,
            signal,
          })
          // capture quota
          try {
            const snap = quotaSnapshot(provider, res.headers, null, Date.now())
            if (snap && typeof deps.rememberQuota === "function") deps.rememberQuota(account.ref, snap)
          } catch {}
          if (!res.ok && res.clone) {
            try {
              const txt = await res.clone().text()
              let j = null
              try { j = JSON.parse(txt) } catch {}
              if (j) {
                const snap2 = quotaSnapshot(provider, res.headers, j, Date.now())
                if (snap2 && typeof deps.rememberQuota === "function") deps.rememberQuota(account.ref, snap2)
              }
            } catch {}
          }
          if (!res.ok) {
            const txt = await res.text().catch(() => "")
            const err = new Error("vendor http " + res.status + (txt ? ": " + txt.slice(0, 200) : ""))
            err.status = res.status
            if (res.status === 429) err.code = "RATE_LIMIT"
            else if (res.status === 402) err.code = "QUOTA"
            else err.code = "VENDOR"
            throw err
          }
          // #65: записать в историю запросов и стоимости.
          if (typeof deps.recordHistory === "function") {
            try {
              deps.recordHistory({
                provider,
                ref: account.ref,
                model: (body && typeof body === "object" && body.model) || null,
                path,
                method,
                status: res.status || 200,
                ms: Date.now() - t0,
                kind: "request",
              })
            } catch {}
          }
          return res
        } catch (err) {
          lastError = err
          if (!isSwitchableError(err)) throw err
          const cooled = markCooldown(account, Date.now(), cooldownMs, modelFamily(provider, body && body.model))
          account.cooldownUntil = cooled.cooldownUntil
          if (typeof deps.rememberCooldown === "function") deps.rememberCooldown(account.ref, account.cooldownUntil, cooled.cooldownFamilies || null)
          // try next account
        }
      }
    },
  }
}