// Фабрика вендоров из декларативного профиля.
//
// Покрывает семейство OpenAI-Responses-совместимых подписок: авторизация PKCE,
// form- или json-токен-эндпоинт, каталог моделей, usage, стрим через /responses.
// Нестандартные протоколы (Anthropic messages, Cloud Code Assist) фабрикой не
// описываются — для них есть рукописные модули.
//
// Новый провайдер = запись customVendors в Config, не код.

import { buildAuthorizeUrl } from "./oauth.js"
import { codexResponsesBody, modelCatalog } from "./messages.js"
import { formTokenRequest, jsonTokenRequest, codexResponsesStream, readJson, tokenBlobFromOAuth, httpError } from "./wire.js"
import { emailFromToken } from "./jwt.js"
import { asUsageSnapshot } from "./usage.js"

function defaultModels(models) {
  return modelCatalog("custom", (models || []).map((row) => (typeof row === "string" ? { id: row, name: row } : row)))
}

/**
 * Собирает объект вендора из профиля. Профиль — данные из Config:
 * { id, displayName, authUrl, tokenUrl, baseUrl, scope, tokenStyle,
 *   clientId, redirectUri, modelsPath, models, usagePath, headers }
 */
export function createVendorFromProfile(profile) {
  const id = String(profile.id)
  const name = String(profile.displayName || profile.id)
  const base = String(profile.baseUrl || "").replace(/\/$/, "")
  const tokenStyle = profile.tokenStyle === "json" ? "json" : "form"

  function identityHeaders(blob, extra) {
    return {
      Authorization: `Bearer ${blob.accessToken}`,
      ...(profile.headers || {}),
      ...(extra || {}),
    }
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
      const json = await req(profile.tokenUrl, params, fetchImpl)
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
      const json = await req(profile.tokenUrl, params, fetchImpl)
      return tokenBlobFromOAuth(json, { label: blob.label, email: blob.email })
    },
    async listModels(blob, cfg, fetchImpl) {
      const catalog = defaultModels(cfg.models || profile.models || [])
      if (!profile.modelsPath) return catalog
      try {
        const res = await (fetchImpl || fetch)(`${base}${profile.modelsPath}`, {
          headers: identityHeaders(blob, { Accept: "application/json" }),
        })
        const json = await readJson(res)
        const rows = []
        for (const entry of json.data || json.models || []) {
          const slug = entry && (entry.slug || entry.id)
          if (!slug) continue
          rows.push({ id: slug, name: entry.display_name || entry.name || slug })
        }
        if (!rows.length) throw new Error("empty catalog")
        return modelCatalog(id, rows)
      } catch {
        return catalog
      }
    },
    async usage() {
      // Универсального usage-эндпоинта у произвольных сервисов нет — квота
      // наполняется из ratelimit-заголовков через adapter quotaFetch.
      return null
    },
    check: undefined,
    async* streamOnce({ blob, options, fetchImpl, headers, config, signal }) {
      const body = codexResponsesBody(options, "")
      if (!body.instructions) delete body.instructions
      const res = await (fetchImpl || fetch)(`${base}/responses`, {
        method: "POST",
        headers: {
          ...headers,
          ...identityHeaders(blob, config),
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify(body),
        signal,
      })
      if (!res.ok) throw httpError(res.status, await res.text())
      yield* codexResponsesStream(res.body)
    },
  }
}

/** Валидирует профиль из Config; бросает при невалидных полях. */
export function validateProfile(raw) {
  const p = raw && typeof raw === "object" ? raw : {}
  for (const key of ["id", "authUrl", "tokenUrl", "baseUrl", "clientId"]) {
    if (!p[key] || typeof p[key] !== "string") throw new Error(`customVendors[${p.id || "?"}]: поле ${key} обязательно`)
  }
  if (!/^[a-z][a-z0-9_]*$/.test(p.id)) throw new Error(`customVendors: id "${p.id}" должен быть [a-z][a-z0-9_]*`)
  if (p.tokenStyle && !["form", "json"].includes(p.tokenStyle)) throw new Error(`customVendors[${p.id}]: tokenStyle должен быть form|json`)
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