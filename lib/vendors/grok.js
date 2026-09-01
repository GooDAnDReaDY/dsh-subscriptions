import { buildAuthorizeUrl } from '../oauth.js'
import { modelCatalog, codexResponsesBody } from '../messages.js'
import { formTokenRequest, codexResponsesStream, httpError, tokenBlobFromOAuth, readJson } from '../wire.js'
import { emailFromToken } from '../jwt.js'
import { asUsageSnapshot, usageWindows, grokBillingPercent } from '../usage.js'

export const id = 'grok'

const AUTH = 'https://auth.x.ai/oauth2/authorize'
const TOKEN = 'https://auth.x.ai/oauth2/token'
const SCOPE = 'openid profile email offline_access grok-cli:access api:access conversations:read conversations:write'
const BILLING = 'https://cli-chat-proxy.grok.com/v1/billing?format=credits'
const MODELS = 'https://api.x.ai/v1/models'
const CLI_MODELS = 'https://cli-chat-proxy.grok.com/v1/models'
const CATALOG_TTL_MS = 5 * 60 * 1000
const catalogCache = new Map()

async function cliCatalogCached(blob, cfg, fetchImpl) {
  const key = String(blob.accessToken || '').slice(-24)
  const hit = catalogCache.get(key)
  if (hit && Date.now() - hit.at < CATALOG_TTL_MS) return hit.map
  const map = await cliCatalog(blob, cfg, fetchImpl)
  if (map.size > 0) catalogCache.set(key, { at: Date.now(), map })
  return map
}

function grokReasoningBody(modelId, effort, catalogMap) {
  const entry = catalogMap && catalogMap.get(modelId)
  const reasoning = entry && entry.reasoning
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

function streamHeaders(blob, config, extra) {
  const base = String(config.baseUrl || defaults().baseUrl)
  const headers = {
    Authorization: `Bearer ${blob.accessToken}`,
    ...(extra || {}),
  }
  if (/grok\.com/i.test(base)) Object.assign(headers, identityHeaders(blob, config))
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
  return { ...blob, email: blob.email || emailFromToken(blob.accessToken), label: blob.label || 'Grok' }
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
      cliCatalog(blob, cfg, impl).catch(() => new Map()),
    ])
    const json = await readJson(res)
    const rows = []
    for (const entry of json.data || []) {
      const modelId = entry && entry.id
      if (!modelId || !isChatModel(modelId)) continue
      const enrich = extra.get(modelId) || {}
      const note = /multi-agent/i.test(modelId)
        ? 'Chat only in Harness until xAI grants multi-agent tool beta.'
        : ''
      rows.push({
        id: modelId,
        name: enrich.name || modelId,
        inputModalities: grokModalities(modelId),
        ...enrich,
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
  if (!res.ok) throw httpError(res.status, await res.text())
  const json = await readJson(res)
  return { ok: true, raw: json }
}

export async function usage(blob, cfg, fetchImpl) {
  try {
    const res = await (fetchImpl || fetch)(BILLING, {
      headers: { ...identityHeaders(blob, cfg), Accept: 'application/json' },
    })
    const json = await readJson(res)
    const snap = asUsageSnapshot(grokBillingPercent(json))
    if (snap) snap.windows = usageWindows(json)
    return snap
  } catch {
    return null
  }
}

export async function* streamOnce({ blob, options, fetchImpl, headers, config, signal }) {
  const base = (config.baseUrl || defaults().baseUrl).replace(/\/$/, '')
  let body = codexResponsesBody(options, '')
  if (!body.instructions) delete body.instructions
  // grok manages reasoning itself (cli catalog aware); drop the codex-level field
  delete body.reasoning
  const catalog = await cliCatalogCached(blob, config, fetchImpl).catch(() => new Map())
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
  if (!res.ok) throw httpError(res.status, await res.text())
  yield* codexResponsesStream(res.body)
}