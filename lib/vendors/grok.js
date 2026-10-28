import { createHash } from 'node:crypto'
import { buildAuthorizeUrl } from '../oauth.js'
import { modelCatalog, codexResponsesBody } from '../messages.js'
import { formTokenRequest, codexResponsesStream, httpError, tokenBlobFromOAuth, readJson , readErrorBody } from '../wire.js'
import { emailFromToken, planFromToken, avatarFromToken, scopesFromToken } from '../jwt.js'
import { asUsageSnapshot, usageWindows, grokBillingPercent } from '../usage.js'

export const id = 'grok'

const AUTH = 'https://auth.x.ai/oauth2/authorize'
const TOKEN = 'https://auth.x.ai/oauth2/token'
const SCOPE = 'openid profile email offline_access grok-cli:access api:access conversations:read conversations:write'
const BILLING = 'https://cli-chat-proxy.grok.com/v1/billing?format=credits'
const MODELS = 'https://api.x.ai/v1/models'
const CLI_MODELS = 'https://cli-chat-proxy.grok.com/v1/models'
const CATALOG_TTL_MS = 5 * 60 * 1000
const CATALOG_CACHE_MAX = 32
const catalogCache = new Map()

function catalogKey(token) {
  return createHash('sha256').update(String(token || '')).digest('hex').slice(0, 16)
}

function pruneCatalogCache(now = Date.now()) {
  for (const [key, entry] of catalogCache) {
    if (now - entry.at >= CATALOG_TTL_MS) catalogCache.delete(key)
  }
  while (catalogCache.size > CATALOG_CACHE_MAX) {
    catalogCache.delete(catalogCache.keys().next().value)
  }
}

export function grokCatalogCacheSize() {
  return catalogCache.size
}

export function clearGrokCatalogCache() {
  catalogCache.clear()
}

async function cliCatalogCached(blob, cfg, fetchImpl) {
  const key = catalogKey(blob.accessToken)
  const now = Date.now()
  const hit = catalogCache.get(key)
  if (hit && now - hit.at < CATALOG_TTL_MS) return hit.map
  try {
    const map = await cliCatalog(blob, cfg, fetchImpl)
    if (map.size > 0) {
      catalogCache.set(key, { at: now, map })
      pruneCatalogCache(now)
      return map
    }
    // An empty response must not erase the last-known-good metadata.
    if (hit) return hit.map
    return map
  } catch (err) {
    if (hit) return hit.map
    throw err
  }
}

function grokFallbackReasoning(modelId) {
  if (!/^grok-4(?:[.-]|$)/i.test(String(modelId || ''))) return undefined
  return {
    efforts: [
      { id: 'high', name: 'High' },
      { id: 'medium', name: 'Medium' },
      { id: 'low', name: 'Low' },
    ],
    defaultEffort: 'high',
  }
}

function grokReasoningBody(modelId, effort, catalogMap) {
  const entry = catalogMap && catalogMap.get(modelId)
  const reasoning = (entry && entry.reasoning) || grokFallbackReasoning(modelId)
  if (!reasoning || !reasoning.efforts || !reasoning.efforts.length) return undefined
  const allowed = new Set(reasoning.efforts.map((row) => row.id))
  const pick = effort != null && effort !== '' ? String(effort) : ''
  if (pick && allowed.has(pick)) return { effort: pick }
  return undefined
}

function grokBodyForModel(modelId, body) {
  if (!/multi-agent/i.test(String(modelId || ''))) return body
  const next = { ...body }
  delete next.tools
  return next
}


export function providerInfo() {
  return { id, name: 'Grok' }
}

export function defaults() {
  return {
    clientId: 'b1a00492-073a-47ea-816f-4c329264a828',
    redirectUri: 'http://127.0.0.1:56121/callback',
    baseUrl: 'https://api.x.ai/v1',
    clientVersion: '0.2.103',
    models: [
      { id: 'grok-4', name: 'Grok 4' },
      { id: 'grok-4-fast-reasoning', name: 'Grok 4 Fast Reasoning' },
      { id: 'grok-code-fast-1', name: 'Grok Code Fast 1' },
    ],
  }
}

function isChatModel(modelId) {
  return !/imagine|image-|video|embed/i.test(String(modelId || ''))
}

function grokModalities(modelId) {
  return /code|embed/i.test(String(modelId || '')) ? ['text'] : ['text', 'image']
}

function identityHeaders(blob, config) {
  return {
    Authorization: `Bearer ${blob.accessToken}`,
    'X-XAI-Token-Auth': 'xai-grok-cli',
    'x-grok-client-identifier': 'grok-shell',
    'x-grok-client-version': config.clientVersion || defaults().clientVersion,
    'User-Agent': 'xai-grok-cli',
  }
}

const TRUSTED_AUTH_HOSTS = new Set(['api.x.ai', 'cli-chat-proxy.grok.com'])

function isTrustedAuthHost(hostname) {
  const host = String(hostname || '').toLowerCase()
  return TRUSTED_AUTH_HOSTS.has(host)
    || host === 'grok.com'
    || host.endsWith('.grok.com')
    || host === 'localhost'
    || host === '127.0.0.1'
    || host === '::1'
}

function isGrokHost(hostname) {
  const host = String(hostname || '').toLowerCase()
  return host === 'grok.com' || host.endsWith('.grok.com')
}

function streamHeaders(blob, config, extra) {
  const base = String(config.baseUrl || defaults().baseUrl)
  let hostname = ''
  try {
    hostname = new URL(base).hostname
  } catch {
    hostname = ''
  }
  if (!isTrustedAuthHost(hostname)) {
    /** @type {Error & { code?: string }} */
    const err = new Error(`Untrusted Grok baseUrl host: ${hostname || base}`)
    err.code = 'GROK_UNTRUSTED_HOST'
    throw err
  }
  const headers = {
    Authorization: `Bearer ${blob.accessToken}`,
    ...(extra || {}),
  }
  if (isGrokHost(hostname)) Object.assign(headers, identityHeaders(blob, config))
  return headers
}

export function authorizeUrl(cfg, pkce) {
  return buildAuthorizeUrl({
    authUrl: AUTH,
    clientId: cfg.clientId,
    redirectUri: cfg.redirectUri,
    challenge: pkce.challenge,
    state: pkce.state,
    scope: SCOPE,
  })
}

export async function exchangeCode(cfg, pkce, code, fetchImpl) {
  const json = await formTokenRequest(TOKEN, {
    grant_type: 'authorization_code',
    client_id: cfg.clientId,
    code,
    redirect_uri: cfg.redirectUri,
    code_verifier: pkce.verifier,
  }, fetchImpl)
  const blob = tokenBlobFromOAuth(json)
  const email = blob.email || emailFromToken(blob.idToken || blob.accessToken)
  const plan = blob.plan || planFromToken(blob.idToken || blob.accessToken)
  const avatarUrl = blob.avatarUrl || avatarFromToken(blob.idToken || blob.accessToken)
  const scopes = blob.scopes?.length ? blob.scopes : (json?.scope ? String(json.scope).split(/[\s,]+/).filter(Boolean) : scopesFromToken(blob.idToken || blob.accessToken))
  return { ...blob, email, plan, avatarUrl, scopes, label: blob.label || email || "Grok" }
}

export async function refresh(cfg, blob, fetchImpl) {
  const json = await formTokenRequest(TOKEN, {
    grant_type: 'refresh_token',
    client_id: cfg.clientId,
    refresh_token: blob.refreshToken,
  }, fetchImpl)
  return tokenBlobFromOAuth(json, { label: blob.label, email: blob.email })
}

async function cliCatalog(blob, cfg, fetchImpl) {
  const res = await fetchImpl(CLI_MODELS, {
    headers: { ...identityHeaders(blob, cfg), Accept: 'application/json' },
  })
  const json = await readJson(res)
  const map = new Map()
  for (const entry of json.data || []) {
    if (!entry || !entry.id) continue
    const efforts = (entry.reasoning_efforts || [])
      .map((level) => (typeof level === 'string' ? { id: level, name: level } : (level && level.value && {
        id: level.value,
        name: level.label || level.value,
      })))
      .filter(Boolean)
    const reasoning = entry.supports_reasoning_effort === true && efforts.length
      ? {
        efforts,
        ...(entry.reasoning_effort && efforts.some((row) => row.id === entry.reasoning_effort)
          ? { defaultEffort: entry.reasoning_effort }
          : {}),
      }
      : undefined
    map.set(entry.id, {
      name: entry.name || entry.id,
      ...(entry.description ? { description: entry.description } : {}),
      ...(entry.context_window ? { contextWindow: entry.context_window } : {}),
      ...(reasoning ? { reasoning } : {}),
    })
  }
  return map
}

export async function listModels(blob, cfg, fetchImpl) {
  const fallback = modelCatalog(id, (cfg.models || defaults().models).map((row) => (
    typeof row === 'string' ? row : { ...row, inputModalities: grokModalities(row.id) }
  )))
  const impl = fetchImpl || fetch
  try {
    const [res, extra] = await Promise.all([
      impl(MODELS, { headers: { Authorization: `Bearer ${blob.accessToken}`, Accept: 'application/json' } }),
      cliCatalogCached(blob, cfg, impl).catch(() => new Map()),
    ])
    const json = await readJson(res)
    const rows = []
    for (const entry of json.data || []) {
      const modelId = entry && entry.id
      if (!modelId || !isChatModel(modelId)) continue
      const enrich = extra.get(modelId) || {}
      const reasoning = enrich.reasoning || grokFallbackReasoning(modelId)
      const note = /multi-agent/i.test(modelId)
        ? 'Chat only in Harness until xAI grants multi-agent tool beta.'
        : ''
      rows.push({
        id: modelId,
        name: enrich.name || modelId,
        inputModalities: grokModalities(modelId),
        ...enrich,
        ...(reasoning ? { reasoning } : {}),
        ...(note ? { description: enrich.description ? `${enrich.description} ${note}` : note } : {}),
      })
    }
    if (!rows.length) throw new Error('empty grok catalog')
    return modelCatalog(id, rows)
  } catch {
    return fallback
  }
}


export async function check(blob, cfg, fetchImpl) {
  const impl = fetchImpl || fetch
  const res = await impl(MODELS, { headers: { Authorization: "Bearer " + blob.accessToken, Accept: "application/json" } })
  if (!res.ok) throw httpError(res.status, await readErrorBody(res))
  const json = await readJson(res)
  return { ok: true, raw: json }
}

export async function usage(blob, cfg, fetchImpl) {
  try {
    const impl = fetchImpl || fetch
    const res = await impl(BILLING, {
      headers: { ...identityHeaders(blob, cfg), Accept: 'application/json' },
    })
    const json = await readJson(res)
    const pct = grokBillingPercent(json)
    const snap = asUsageSnapshot(pct)
    if (snap) snap.windows = usageWindows(json)
    return snap
  } catch {
    return null
  }
}

const DEVICE_CODE_URL = 'https://auth.x.ai/oauth2/device/code'
const DEVICE_AUTH_URL = 'https://accounts.x.ai/oauth2/device'

export async function deviceStart(cfg, fetchImpl) {
  const impl = fetchImpl || fetch
  const clientId = (cfg && cfg.clientId) || defaults().clientId
  const params = new URLSearchParams({
    client_id: clientId,
    scope: SCOPE,
  })
  const res = await impl(DEVICE_CODE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: params.toString(),
  })
  if (!res.ok) throw httpError(res.status, await readErrorBody(res), 'DEVICE')
  const json = await readJson(res)
  if (!json || typeof json.user_code !== 'string' || typeof json.device_code !== 'string') {
    throw httpError(502, 'xAI device authorization response is incomplete', 'DEVICE')
  }
  return {
    userCode: json.user_code,
    deviceAuthId: json.device_code,
    intervalMs: Math.max(parseInt(json.interval, 10) || 5, 1) * 1000,
    authUrl: json.verification_uri_complete || json.verification_uri || DEVICE_AUTH_URL,
  }
}

export async function devicePoll(cfg, session, fetchImpl) {
  const impl = fetchImpl || fetch
  const clientId = (cfg && cfg.clientId) || defaults().clientId
  const params = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    client_id: clientId,
    device_code: session.deviceAuthId,
  })
  const res = await impl(TOKEN, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: params.toString(),
  })
  if (res.status === 400 || res.status === 403) {
    const rawText = await readErrorBody(res)
    let errJson = {}
    try {
      errJson = JSON.parse(rawText)
    } catch (err) {
      errJson = { error: String(err && err.message) }
    }
    if (errJson && (errJson.error === 'authorization_pending' || errJson.error === 'slow_down')) {
      return { status: 'pending' }
    }
    if (errJson && errJson.error === 'expired_token') {
      return { status: 'expired' }
    }
    if (errJson && errJson.error) {
      throw httpError(400, errJson.error_description || errJson.error, 'DEVICE')
    }
    throw httpError(res.status, rawText, 'DEVICE')
  }
  if (!res.ok) throw httpError(res.status, await readErrorBody(res), 'DEVICE')
  const json = await readJson(res)
  if (!json || typeof json.access_token !== 'string') {
    throw httpError(502, 'xAI device token response is incomplete', 'DEVICE')
  }
  const blob = tokenBlobFromOAuth(json)
  return {
    status: 'authorized',
    blob: { ...blob, email: blob.email || emailFromToken(blob.accessToken), label: blob.label || 'Grok' },
  }
}

export async function* streamOnce({ blob, options, fetchImpl, headers, config, signal }) {
  const base = (config.baseUrl || defaults().baseUrl).replace(/\/$/, '')
  let body = codexResponsesBody(options, '')
  if (!body.instructions) delete body.instructions
  // grok manages reasoning itself (cli catalog aware); drop the codex-level field
  delete body.reasoning
  // Thread the caller AbortSignal through the catalog pre-flight too.
  const catalog = await cliCatalogCached(blob, config, (u, i) => fetchImpl(u, { ...(i || {}), signal })).catch(() => new Map())
  const reasoning = grokReasoningBody(options.model, options.reasoningEffort, catalog)
  if (reasoning) body.reasoning = reasoning
  body = grokBodyForModel(options.model, body)
  const res = await fetchImpl(`${base}/responses`, {
    method: 'POST',
    headers: {
      ...headers,
      ...streamHeaders(blob, config, {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      }),
    },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) throw httpError(res.status, await readErrorBody(res))
  yield* codexResponsesStream(res.body)
}
