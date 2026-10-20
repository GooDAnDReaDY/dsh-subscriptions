import { createHash } from 'node:crypto'
import { fetchWithTimeout } from '../http.js'
import { buildAuthorizeUrl } from '../oauth.js'
import { anthropicPayload, modelCatalog } from '../messages.js'
import { jsonTokenRequest, anthropicStream, httpError, tokenBlobFromOAuth, readJson , readErrorBody } from '../wire.js'
import { emailFromToken, planFromToken, avatarFromToken, scopesFromToken } from '../jwt.js'
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
  const s = String(modelId || '').toLowerCase()
  let m = /^claude-(opus|sonnet|haiku|fable)(?:-(\d+))?(?:-(\d+))?/.exec(s)
  let family, major, minor
  if (m) {
    family = m[1]
    major = m[2] ? Number(m[2]) : null
    minor = m[3] ? Number(m[3]) : null
  } else {
    m = /^claude-(\d+)[-.](\d+)-(opus|sonnet|haiku|fable)/.exec(s)
    if (m) {
      major = Number(m[1])
      minor = Number(m[2])
      family = m[3]
    }
  }
  if (!family || family === 'haiku' || family === 'fable') return null
  const atLeast = (wantMajor, wantMinor) => (
    major === null || major > wantMajor || (major === wantMajor && (minor === null || minor >= wantMinor))
  )
  // Claude 3.7+ Sonnet supports extended thinking
  if (family === 'sonnet' && major === 3 && minor !== null && minor >= 7) {
    return [...BASE_EFFORT_LEVELS]
  }
  // Adaptive thinking / effort exist from Opus 4.6 and Sonnet 4.6 onward.
  if (!atLeast(4, 6)) return null
  const levels = [...BASE_EFFORT_LEVELS]
  if (family === 'opus') {
    if (atLeast(4, 7)) levels.push('xhigh')
    levels.push('max')
  }
  return levels
}

export function defaults() {
  return {
    clientId: '9d1c250a-e61b-44d9-88ed-5944d1962f5e',
    redirectUri: 'https://console.anthropic.com/oauth/code/callback',
    claudeCcVersion: '2.1.289.7e2',
    models: [
      { id: 'claude-opus-5', name: 'Claude Opus 5' },
      { id: 'claude-sonnet-5', name: 'Claude Sonnet 5' },
      { id: 'claude-fable-5', name: 'Claude Fable 5' },
      { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5' },
    ],
    systemPrefix: IDENTITY,
  }
}

function oauthHeaders(token, blob) {
  const h = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'anthropic-version': '2023-06-01',
    'anthropic-beta': BETA,
  }
  const org = blob && (blob.selectedOrgId || blob.organizationId)
  if (org) {
    h['anthropic-organization-id'] = String(org)
    h['x-anthropic-organization'] = String(org)
  }
  return h
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
  let plan = blob.plan || planFromToken(blob.accessToken)
  let avatarUrl = blob.avatarUrl || avatarFromToken(blob.accessToken)
  let scopes = blob.scopes || scopesFromToken(blob.accessToken)
  let orgs = Array.isArray(blob.organizations) ? [...blob.organizations] : []
  if (fetchImpl && blob.accessToken && (!email || !plan || !orgs.length)) {
    try {
      const res = await fetchImpl(PROFILE, { headers: oauthHeaders(blob.accessToken, blob) })
      const json = await readJson(res)
      email = email || json.email || (json.account && json.account.email) || ""
      plan = plan || json.plan || (json.account && (json.account.plan_type || (json.account.has_team ? "Team" : (json.account.has_pro ? "Pro" : "Free")))) || ""
      avatarUrl = avatarUrl || json.picture || (json.account && json.account.picture) || ""
      if (json.scope && !scopes.length) scopes = String(json.scope).split(/[\s,]+/).filter(Boolean)
      if (Array.isArray(json.organizations)) {
        for (const o of json.organizations) {
          if (o && (o.id || o.uuid)) orgs.push({ id: String(o.id || o.uuid), name: String(o.name || o.title || o.id) })
        }
      } else if (Array.isArray(json.workspaces)) {
        for (const w of json.workspaces) {
          if (w && (w.id || w.uuid)) orgs.push({ id: String(w.id || w.uuid), name: String(w.name || w.title || w.id) })
        }
      } else if (json.account && Array.isArray(json.account.memberships)) {
        for (const m of json.account.memberships) {
          const o = m.organization || m
          if (o && (o.id || o.uuid)) orgs.push({ id: String(o.id || o.uuid), name: String(o.name || o.title || o.id), role: m.role ? String(m.role) : undefined })
        }
      }
    } catch { /* profile is optional */ }
  }
  const dedupedOrgs = []
  const seen = new Set()
  for (const o of orgs) {
    if (!seen.has(o.id)) {
      seen.add(o.id)
      dedupedOrgs.push(o)
    }
  }
  const selectedOrgId = blob.selectedOrgId || blob.organizationId || (dedupedOrgs[0] ? dedupedOrgs[0].id : '')
  const selectedOrgName = blob.selectedOrgName || (dedupedOrgs.find(o => o.id === selectedOrgId)?.name || selectedOrgId)
  return {
    ...blob,
    email: email || "",
    plan: plan || "Claude Pro",
    avatarUrl: avatarUrl || "",
    scopes,
    selectedOrgId,
    selectedOrgName,
    organizationId: selectedOrgId,
    organizations: dedupedOrgs,
    label: blob.label || email || "Claude",
  }
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

export async function listModels(blob, cfg, fetchImpl) {
  const impl = fetchImpl || fetch
  const rawDefault = (cfg && cfg.models && cfg.models.length) ? cfg.models : defaults().models
  const defaultCatalog = modelCatalog(id, rawDefault.map((entry) => {
    const model = typeof entry === "string" ? { id: entry, name: entry } : { ...entry }
    const levels = effortLevelsForModel(model.id || model.name)
    if (!levels) return model
    return { ...model, reasoning: { efforts: levels.map((level) => ({ id: level, name: level })) } }
  }))

  if (!blob || !blob.accessToken) return defaultCatalog

  try {
    const headers = {
      "Accept": "application/json",
      "anthropic-version": "2023-06-01",
    }
    if (blob.accessToken.startsWith("sk-ant-oat") || blob.accessToken.startsWith("sk-ant-ort")) {
      headers["Authorization"] = `Bearer ${blob.accessToken}`
    } else if (blob.accessToken.startsWith("sk-ant-")) {
      headers["x-api-key"] = blob.accessToken
    } else {
      headers["Authorization"] = `Bearer ${blob.accessToken}`
    }

    const res = await fetchWithTimeout(impl, "https://api.anthropic.com/v1/models", { headers }, { timeoutMs: 15000 })
    if (!res.ok) return defaultCatalog
    const json = await readJson(res)
    const items = json && json.data
    if (!Array.isArray(items) || !items.length) return defaultCatalog
    const rows = []
    for (const item of items) {
      const modelId = item.id || item.display_name
      if (!modelId) continue
      const levels = effortLevelsForModel(modelId)
      rows.push({
        id: modelId,
        name: item.display_name || modelId,
        ...(levels ? { reasoning: { efforts: levels.map((level) => ({ id: level, name: level })) } } : {}),
      })
    }
    if (!rows.length) return defaultCatalog
    return modelCatalog(id, rows)
  } catch {
    return defaultCatalog
  }
}

// Advertise adaptive thinking + effort only for models whose capability table
// declares the chosen level; anything else (unsupported family, 'off', no
// selection) leaves the request untouched so behavior stays opt-in.
function applyClaudeThinking(payload, options) {
  const effort = options && String(options.reasoningEffort || '')
  const budget = options && (options.thinkingBudget || options.budgetTokens || (options.thinking && options.thinking.budget_tokens))
  if (budget && Number(budget) > 0) {
    payload.thinking = { type: 'enabled', budget_tokens: Math.max(1024, Number(budget)) }
    return payload
  }
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
  if (!res.ok) throw httpError(res.status, await readErrorBody(res))
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

const billingAccountState = new Map()
const MAX_BILLING_ACCOUNTS = 256

export function resolveAccountKey(cfg, context) {
  const explicit = (context && context.accountId) || (cfg && cfg.accountId)
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim()
  const blob = (context && context.blob) || (cfg && cfg.blob)
  if (blob && typeof blob === 'object') {
    const id = blob.accountId || blob.id || blob.email
    if (typeof id === 'string' && id.trim()) return id.trim()
    if (typeof blob.accessToken === 'string' && blob.accessToken.length >= 8) {
      return 'token:' + createHash('sha256').update(String(blob.accessToken)).digest('hex').slice(0, 16)
    }
  }
  return 'default'
}

function resolvePromptIndex(cfg, context) {
  const explicit = (context && context.promptIndex !== undefined)
    ? context.promptIndex
    : (cfg && cfg.promptIndex !== undefined ? cfg.promptIndex : undefined)
  if (typeof explicit === 'number' && Number.isFinite(explicit) && explicit >= 0) {
    return Math.floor(explicit)
  }
  const messages = (context && context.options && Array.isArray(context.options.messages))
    ? context.options.messages
    : (context && Array.isArray(context.messages) ? context.messages : null)
  if (messages) {
    const userTurns = messages.filter((m) => m && m.role === 'user').length
    return Math.max(0, userTurns - 1)
  }
  return 0
}

export function makeClaudeBillingHeader(cfg, context) {
  const ccVersion = (cfg && cfg.claudeCcVersion) || '2.1.289.7e2'
  const accountKey = resolveAccountKey(cfg, context)
  let state = billingAccountState.get(accountKey)
  if (!state) {
    if (billingAccountState.size >= MAX_BILLING_ACCOUNTS) {
      const oldestKey = billingAccountState.keys().next().value
      if (oldestKey !== undefined) billingAccountState.delete(oldestKey)
    }
    state = {
      cch: Math.random().toString(16).slice(2, 6).padEnd(4, '0'),
      turnIndex: 0,
    }
    billingAccountState.set(accountKey, state)
  }
  state.turnIndex += 1
  const promptIndex = resolvePromptIndex(cfg, context)
  return `x-anthropic-billing-header: cc_version=${ccVersion}; cc_entrypoint=sdk-cli; cch=${state.cch}; cc_turn_origin=sdk; cc_prompt_index=${promptIndex}; cc_turn_index=${state.turnIndex};`
}

export function applyClaudeBillingHeader(payload, cfg, context) {
  if (process.env.CLAUDE_CODE_ATTRIBUTION_HEADER === '0') return payload
  if (cfg && cfg.disableBillingHeader === true) return payload
  if (!payload) return payload
  const headerText = makeClaudeBillingHeader(cfg, context)
  const headerBlock = { type: 'text', text: headerText }
  if (Array.isArray(payload.system)) {
    if (!payload.system.some((b) => typeof b === 'object' && b && typeof b.text === 'string' && b.text.startsWith('x-anthropic-billing-header:'))) {
      payload.system = [headerBlock, ...payload.system]
    }
  } else if (typeof payload.system === 'string' && payload.system.trim()) {
    payload.system = [headerBlock, { type: 'text', text: payload.system }]
  } else if (!payload.system) {
    payload.system = [headerBlock]
  }
  return payload
}

export async function* streamOnce({ blob, options, fetchImpl, headers, config, signal, accountId }) {
  const payload = anthropicPayload(options, config.systemPrefix || IDENTITY)
  applyClaudeThinking(payload, options)
  applyClaudeBillingHeader(payload, config, { accountId, blob, options })
  const res = await fetchImpl(API, {
    method: 'POST',
    headers: {
      ...headers,
      ...oauthHeaders(blob.accessToken, blob),
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(payload),
    signal,
  })
  if (!res.ok) throw httpError(res.status, await readErrorBody(res))
  yield* anthropicStream(res.body)
}