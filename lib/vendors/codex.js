import { randomUUID } from 'node:crypto'
import { buildAuthorizeUrl } from '../oauth.js'
import { codexResponsesBody, modelCatalog } from '../messages.js'
import { chatgptAccountId, emailFromToken } from '../jwt.js'
import { formTokenRequest, codexResponsesStream, readJson, tokenBlobFromOAuth, httpError } from '../wire.js'
import { asUsageSnapshot, deepestUsedPercent } from '../usage.js'

export const id = 'codex'

const AUTH = 'https://auth.openai.com/oauth/authorize'
const TOKEN = 'https://auth.openai.com/oauth/token'
const USAGE = 'https://chatgpt.com/backend-api/wham/usage'
const SCOPE = 'openid profile email offline_access api.connectors.read api.connectors.invoke'
const INSTRUCTIONS = 'You are a coding assistant using a ChatGPT Codex subscription.'

export function providerInfo() {
  return { id, name: 'ChatGPT Codex' }
}

export function defaults() {
  return {
    clientId: 'app_EMoamEEZ73f0CkXaXp7hrann',
    redirectUri: 'http://localhost:1455/auth/callback',
    baseUrl: 'https://chatgpt.com/backend-api/codex',
    originator: 'codex_cli_rs',
    models: [
      { id: 'gpt-5.1-codex', name: 'GPT-5.1 Codex' },
      { id: 'gpt-5.1-codex-mini', name: 'GPT-5.1 Codex Mini' },
      { id: 'gpt-5.1', name: 'GPT-5.1' },
    ],
    clientVersion: '0.147.0',
  }
}

export function authorizeUrl(cfg, pkce) {
  return buildAuthorizeUrl({
    authUrl: AUTH,
    clientId: cfg.clientId,
    redirectUri: cfg.redirectUri,
    challenge: pkce.challenge,
    state: pkce.state,
    scope: SCOPE,
    extra: {
      id_token_add_organizations: 'true',
      codex_cli_simplified_flow: 'true',
      originator: cfg.originator || 'codex_cli_rs',
    },
  })
}

function identityHeaders(blob, config, extra) {
  const originator = config.originator || 'codex_cli_rs'
  return {
    Authorization: `Bearer ${blob.accessToken}`,
    originator,
    'chatgpt-account-id': blob.accountId || '',
    'ChatGPT-Account-ID': blob.accountId || '',
    'User-Agent': `${originator}/0.0.1`,
    'OpenAI-Beta': 'responses=experimental',
    ...(extra || {}),
  }
}

function decorate(blob, json) {
  const idToken = (json && json.id_token) || blob.idToken || ''
  return {
    ...blob,
    accountId: blob.accountId || chatgptAccountId(idToken) || chatgptAccountId(blob.accessToken),
    email: blob.email || emailFromToken(idToken) || emailFromToken(blob.accessToken),
    label: blob.label || emailFromToken(idToken) || emailFromToken(blob.accessToken) || 'ChatGPT',
  }
}

export async function exchangeCode(cfg, pkce, code, fetchImpl) {
  const json = await formTokenRequest(TOKEN, {
    grant_type: 'authorization_code',
    client_id: cfg.clientId,
    code,
    redirect_uri: cfg.redirectUri,
    code_verifier: pkce.verifier,
  }, fetchImpl)
  return decorate(tokenBlobFromOAuth(json), json)
}

export async function refresh(cfg, blob, fetchImpl) {
  const json = await formTokenRequest(TOKEN, {
    grant_type: 'refresh_token',
    client_id: cfg.clientId,
    refresh_token: blob.refreshToken,
  }, fetchImpl)
  return decorate(tokenBlobFromOAuth(json, {
    label: blob.label,
    email: blob.email,
    accountId: blob.accountId,
  }), json)
}

export async function listModels(blob, cfg, fetchImpl) {
  const catalog = modelCatalog(id, cfg.models || defaults().models)
  const impl = fetchImpl || fetch
  try {
    const base = (cfg.baseUrl || defaults().baseUrl).replace(/\/$/, '')
    const version = cfg.clientVersion || defaults().clientVersion
    const res = await impl(`${base}/models?client_version=${encodeURIComponent(version)}`, {
      headers: identityHeaders(blob, cfg, { Accept: 'application/json' }),
    })
    const json = await readJson(res)
    const rows = []
    for (const entry of json.models || json.data || []) {
      const slug = entry && (entry.slug || entry.id)
      if (!slug) continue
      if (entry.visibility === 'hide' || entry.visibility === 'none') continue
      const efforts = (entry.supported_reasoning_levels || [])
        .map((level) => (typeof level === 'string' ? level : level && level.effort))
        .filter(Boolean)
        .map((effort) => ({ id: effort, name: effort }))
      rows.push({
        id: slug,
        name: entry.display_name || slug,
        priority: Number(entry.priority) || 0,
        ...(entry.description ? { description: entry.description } : {}),
        ...(entry.context_window ? { contextWindow: entry.context_window } : {}),
        ...(efforts.length ? { reasoning: { efforts } } : {}),
      })
    }
    if (!rows.length) throw new Error('empty codex catalog')
    rows.sort((a, b) => a.priority - b.priority)
    return modelCatalog(id, rows.map(({ priority, ...row }) => row))
  } catch { /* catalog fallback */ }
  return catalog
}


export async function check(blob, cfg, fetchImpl) {
  const base = (cfg.baseUrl || defaults().baseUrl).replace(/\/$/, "")
  const version = cfg.clientVersion || defaults().clientVersion
  const impl = fetchImpl || fetch
  const res = await impl(base + "/models?client_version=" + encodeURIComponent(version), {
    headers: identityHeaders(blob, cfg, { Accept: "application/json" }),
  })
  if (!res.ok) throw httpError(res.status, await res.text())
  const json = await readJson(res)
  // quota headers may contain limits
  return { ok: true, raw: json }
}

export async function usage(blob, cfg, fetchImpl) {
  try {
    const res = await (fetchImpl || fetch)(USAGE, {
      headers: identityHeaders(blob, cfg, { Accept: 'application/json' }),
    })
    const json = await readJson(res)
    return asUsageSnapshot(deepestUsedPercent(json))
  } catch {
    return null
  }
}

export async function* streamOnce({ blob, options, fetchImpl, headers, config, signal }) {
  const base = (config.baseUrl || defaults().baseUrl).replace(/\/$/, '')
  const body = codexResponsesBody(options, INSTRUCTIONS)
  const res = await fetchImpl(`${base}/responses`, {
    method: 'POST',
    headers: {
      ...headers,
      ...identityHeaders(blob, config, {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        'session-id': randomUUID(),
      }),
    },
    body: JSON.stringify(body),
    signal,
  })
  if (!res.ok) throw httpError(res.status, await res.text())
  yield* codexResponsesStream(res.body)
}