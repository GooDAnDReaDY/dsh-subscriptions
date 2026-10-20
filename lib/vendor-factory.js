import { fetchWithTimeout, sanitizeHeaderValues } from "./http.js"
// Vendor factory from a declarative profile.
//
// Covers the OpenAI-Responses-compatible subscription family: PKCE auth,
// form- or json-token endpoint, model catalog, usage, streaming via /responses.
// Non-standard protocols (Anthropic messages, Cloud Code Assist) are not
// expressed by the factory - hand-written modules cover them.
//
// A new provider = a customVendors entry in Config, not code.

import { buildAuthorizeUrl } from "./oauth.js"
import { codexResponsesBody, modelCatalog } from "./messages.js"
import { formTokenRequest, jsonTokenRequest, codexResponsesStream, readJson, tokenBlobFromOAuth, httpError , readErrorBody } from "./wire.js"
import { emailFromToken } from "./jwt.js"
import { BUILTIN_PROVIDERS } from "./refs.js"

function defaultModels(providerId, models) {
  return modelCatalog(providerId, (models || []).map((row) => (typeof row === "string" ? { id: row, name: row } : row)))
}

/**
 * Builds a vendor object from a profile. A profile is data from Config:
 * { id, displayName, authUrl, tokenUrl, baseUrl, scope, tokenStyle,
 *   clientId, redirectUri, modelsPath, models, usagePath, headers }
 */
export function createVendorFromProfile(profile) {
  const id = String(profile.id)
  const name = String(profile.displayName || profile.id)
  const base = String(profile.baseUrl || "").replace(/\/$/, "")
  const tokenStyle = profile.tokenStyle === "json" ? "json" : "form"

  function identityHeaders(blob, extra) {
    return sanitizeHeaderValues({
      Authorization: `Bearer ${blob.accessToken}`,
      ...(profile.headers || {}),
      ...(extra || {}),
    })
  }

  return {
    id,
    providerInfo() {
      return { id, name }
    },
    defaults() {
      return {
        clientId: profile.clientId || "",
        redirectUri: profile.redirectUri || "",
        baseUrl: base,
        scope: profile.scope || "openid profile offline_access",
        models: profile.models || [],
      }
    },
    authorizeUrl(cfg, pkce) {
      return buildAuthorizeUrl({
        authUrl: profile.authUrl,
        clientId: cfg.clientId,
        redirectUri: cfg.redirectUri,
        challenge: pkce.challenge,
        state: pkce.state,
        scope: cfg.scope || profile.scope || "openid profile offline_access",
      })
    },
    async exchangeCode(cfg, pkce, code, fetchImpl) {
      const params = {
        grant_type: "authorization_code",
        client_id: cfg.clientId,
        code,
        redirect_uri: cfg.redirectUri,
        code_verifier: pkce.verifier,
      }
      const req = tokenStyle === "json" ? jsonTokenRequest : formTokenRequest
      const tokenFetch = (u, i, o) => fetchWithTimeout(fetchImpl || fetch, u, i, { timeoutMs: 30000, ...(o || {}) })
      const json = await req(profile.tokenUrl, params, tokenFetch)
      const blob = tokenBlobFromOAuth(json)
      return { ...blob, email: blob.email || emailFromToken(blob.accessToken), label: blob.label || name }
    },
    async refresh(cfg, blob, fetchImpl) {
      const params = {
        grant_type: "refresh_token",
        client_id: cfg.clientId,
        refresh_token: blob.refreshToken,
      }
      const req = tokenStyle === "json" ? jsonTokenRequest : formTokenRequest
      const tokenFetch = (u, i, o) => fetchWithTimeout(fetchImpl || fetch, u, i, { timeoutMs: 30000, ...(o || {}) })
      const json = await req(profile.tokenUrl, params, tokenFetch)
      return tokenBlobFromOAuth(json, { label: blob.label, email: blob.email })
    },
    async listModels(blob, cfg, fetchImpl) {
      const catalog = defaultModels(id, cfg.models || profile.models || [])
      if (!profile.modelsPath) return catalog
      try {
        const res = await fetchWithTimeout(fetchImpl || fetch, `${base}${profile.modelsPath}`, {
          headers: identityHeaders(blob, { Accept: "application/json" }),
        }, { timeoutMs: 15000 })
        if (!res.ok) throw httpError(res.status, await readErrorBody(res))
        const json = await readJson(res)
        const rows = []
        for (const entry of json.data || json.models || []) {
          const slug = entry && (entry.slug || entry.id)
          if (!slug) continue
          rows.push({ id: slug, name: entry.display_name || entry.name || slug })
        }
        if (!rows.length) throw new Error("empty catalog")
        return modelCatalog(id, rows)
      } catch (err) {
        const status = Number(err && (err.status || err.statusCode) || 0)
        if (status === 401 || status === 403 || (err && err.code === 'AUTH')) throw err
        return catalog
      }
    },
    async* streamOnce({ blob, options, fetchImpl, headers, signal }) {
      const body = codexResponsesBody(options, "")
      if (!body.instructions) delete body.instructions
      const res = await fetchWithTimeout(fetchImpl || fetch, `${base}/responses`, {
        method: "POST",
        headers: {
          ...headers,
          ...identityHeaders(blob),
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify(body),
        signal,
      }, { timeoutMs: 60000, stream: true })
      if (!res.ok) throw httpError(res.status, await readErrorBody(res))
      yield* codexResponsesStream(res.body)
    },
  }
}

/** Validates the profile from Config; throws on invalid fields. */
export function validateProfile(raw) {
  const p = raw && typeof raw === "object" ? raw : {}
  for (const key of ["id", "authUrl", "tokenUrl", "baseUrl", "clientId"]) {
    if (!p[key] || typeof p[key] !== "string") throw new Error(`customVendors[${p.id || "?"}]: field ${key} is required`)
  }
  if (!/^[a-z][a-z0-9_]*$/.test(p.id)) throw new Error(`customVendors: id "${p.id}" must match [a-z][a-z0-9_]*`)
  if (BUILTIN_PROVIDERS.includes(p.id)) throw new Error(`customVendors: id "${p.id}" conflicts with a built-in provider`)
  if (p.tokenStyle && !["form", "json"].includes(p.tokenStyle)) throw new Error(`customVendors[${p.id}]: tokenStyle must be form|json`)
  const localHostnames = new Set(["localhost", "127.0.0.1", "::1", "[::1]"])
  for (const key of ["authUrl", "tokenUrl", "baseUrl"]) {
    try {
      const u = new URL(p[key])
      if (u.protocol !== "https:" && u.protocol !== "http:") {
        throw new Error("protocol must be http: or https:")
      }
      if (u.protocol === "http:" && !localHostnames.has(u.hostname)) {
        throw new Error("http is allowed only for localhost")
      }
    } catch (e) {
      throw new Error(`customVendors[${p.id}]: field ${key} must be a valid http(s) URL (${e.message || e})`)
    }
  }
  return {
    id: p.id,
    displayName: p.displayName || p.id,
    authUrl: p.authUrl,
    tokenUrl: p.tokenUrl,
    baseUrl: p.baseUrl,
    scope: p.scope || "",
    tokenStyle: p.tokenStyle || "form",
    clientId: p.clientId,
    redirectUri: p.redirectUri || "",
    modelsPath: p.modelsPath || "",
    models: Array.isArray(p.models) ? p.models : [],
    headers: p.headers && typeof p.headers === "object" ? p.headers : {},
  }
}

/** Validates a list of profiles, skipping invalid entries individually. */
export function validateProfiles(list) {
  const out = []
  for (const raw of Array.isArray(list) ? list : []) {
    try {
      out.push(validateProfile(raw))
    } catch { /* skip invalid profile */ }
  }
  return out
}