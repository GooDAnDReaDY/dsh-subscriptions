import { buildAuthorizeUrl } from '../oauth.js'
import { anthropicPayload, modelCatalog } from '../messages.js'
import { jsonTokenRequest, anthropicStream, httpError, tokenBlobFromOAuth, readJson } from '../wire.js'
import { emailFromToken } from '../jwt.js'
import { asUsageSnapshot, usageWindows, deepestUsedPercent } from '../usage.js'

export const id = 'claude'

const AUTH = 'https://claude.ai/oauth/authorize'
const TOKEN = 'https://platform.claude.com/v1/oauth/token'
const API = 'https://api.anthropic.com/v1/messages?beta=true'
const PROFILE = 'https://api.anthropic.com/api/oauth/profile'
const USAGE = 'https://api.anthropic.com/api/oauth/usage'
const SCOPE = 'org:create_api_key user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload'
const IDENTITY = "You are Claude Code, Anthropic's official CLI for Claude."
const BETA = 'oauth-2025-04-20,claude-code-20250219'

export function providerInfo() {
  return { id, name: 'Claude' }
}

export function defaults() {
  return {
    clientId: '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
    redirectUri: 'https://console.anthropic.com/oauth/code/callback',
    models: [
      { id: 'claude-opus-5', name: 'Claude Opus 5' },
      { id: 'claude-sonnet-5', name: 'Claude Sonnet 5' },
      { id: 'claude-fable-5', name: 'Claude Fable 5' },
      { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5' },
    ],
    systemPrefix: IDENTITY,
  }
}

// Thinking-effort support follows Anthropic's current semantics:
// - Adaptive thinking (`thinking: { type: 'adaptive' }`) is the recommended /
//   only on-mode for current generations; depth and token spend are steered by
//   `output_config: { effort }`.
// - Effort is accepted on Opus 4.6+ and Sonnet 4.6+; `xhigh` was added on
//   Opus 4.7; `max` is Opus-tier only.
// - Sonnet 4.5 / Haiku / Fable families reject effort (400), and models older
//   than the adaptive generation use the legacy budget_tokens knob, so no
//   effort control is advertised there. Model ids with a major version only
//   (e.g. `claude-opus-5`) are treated as the latest of their family.
const BASE_EFFORT_LEVELS = ['low', 'medium', 'high']

export function effortLevelsForModel(modelId) {
  const m = /^claude-(opus|sonnet|haiku|fable)(?:-(\d+))?(?:-(\d+))?/.exec(String(modelId || ''))
  if (!m) return null
  const [, family, majorRaw, minorRaw] = m
  if (family === 'haiku' || family === 'fable') return null
  const major = majorRaw ? Number(majorRaw) : null
  const minor = minorRaw ? Number(minorRaw) : null
  const atLeast = (wantMajor, wantMinor) => (
    major === null || major > wantMajor || (major === wantMajor && (minor === null || minor >= wantMinor))
  )
  // Adaptive thinking / effort exist from Opus 4.6 and Sonnet 4.6 onward.
  if (!atLeast(4, 6)) return null
  const levels = [...BASE_EFFORT_LEVELS]
  if (family === 'opus') {
    if (atLeast(4, 7)) levels.push('xhigh')
    levels.push('max')
  }
  return levels
}

function oauthHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'anthropic-version': '2023-06-01',
    'anthropic-beta': BETA,
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
    extra: { code: 'true' },
  })
}

async function decorate(blob, fetchImpl) {
  let email = blob.email || emailFromToken(blob.accessToken)
  if (!email && fetchImpl && blob.accessToken) {
    try {
      const res = await fetchImpl(PROFILE, { headers: oauthHeaders(blob.accessToken) })
      const json = await readJson(res)
      email = json.email || (json.account && json.account.email) || email
    } catch { /* profile is optional */ }
  }
  return { ...blob, email, label: blob.label || email || 'Claude' }
}

export async function exchangeCode(cfg, pkce, code, fetchImpl) {
  const json = await jsonTokenRequest(TOKEN, {
    grant_type: 'authorization_code',
    client_id: cfg.clientId,
    code,
    redirect_uri: cfg.redirectUri,
    code_verifier: pkce.verifier,
    state: pkce.state,
  }, fetchImpl)
  return decorate(tokenBlobFromOAuth(json), fetchImpl)
}

export async function refresh(cfg, blob, fetchImpl) {
  const json = await jsonTokenRequest(TOKEN, {
    grant_type: 'refresh_token',
    client_id: cfg.clientId,
    refresh_token: blob.refreshToken,
  }, fetchImpl)
  return decorate(tokenBlobFromOAuth(json, { label: blob.label, email: blob.email }), fetchImpl)
}

export async function listModels(blob, cfg) {
  const raw = cfg.models && cfg.models.length ? cfg.models : defaults().models
  const entries = raw.map((entry) => {
    const model = typeof entry === 'string' ? { id: entry, name: entry } : { ...entry }
    const levels = effortLevelsForModel(model.id || model.name)
    if (!levels) return model
    return { ...model, reasoning: { efforts: levels.map((level) => ({ id: level, name: level })) } }
  })
  return modelCatalog(id, entries)
}

// Advertise adaptive thinking + effort only for models whose capability table
// declares the chosen level; anything else (unsupported family, 'off', no
// selection) leaves the request untouched so behavior stays opt-in.
export function applyClaudeThinking(payload, options) {
  const effort = options && String(options.reasoningEffort || '')
  if (!effort || effort === 'off') return payload
  const levels = effortLevelsForModel(payload && payload.model)
  if (!levels || !levels.includes(effort)) return payload
  payload.thinking = { type: 'adaptive' }
  payload.output_config = { effort }
  return payload
}


export async function check(blob, _cfg, fetchImpl) {
  const impl = fetchImpl || fetch
  const res = await impl(PROFILE, { headers: oauthHeaders(blob.accessToken) })
  if (!res.ok) throw httpError(res.status, await res.text())
  const json = await readJson(res)
  return { ok: true, raw: json }
}

export async function usage(blob, _cfg, fetchImpl) {
  try {
    const res = await (fetchImpl || fetch)(USAGE, { headers: oauthHeaders(blob.accessToken) })
    const json = await readJson(res)
    const snap = asUsageSnapshot(deepestUsedPercent(json))
    if (snap) snap.windows = usageWindows(json)
    return snap
  } catch {
    return null
  }
}

export async function* streamOnce({ blob, options, fetchImpl, headers, config, signal }) {
  const payload = anthropicPayload(options, config.systemPrefix || IDENTITY)
  applyClaudeThinking(payload, options)
  const res = await fetchImpl(API, {
    method: 'POST',
    headers: {
      ...headers,
      ...oauthHeaders(blob.accessToken),
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(payload),
    signal,
  })
  if (!res.ok) throw httpError(res.status, await res.text())
  yield* anthropicStream(res.body)
}