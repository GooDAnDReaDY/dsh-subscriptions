// #563: Perplexity Pro Subscription OAuth Vendor
// Supports OAuth PKCE authentication, token refresh, and Pro subscription models.

import { LlmError } from '@deepseek-ai/dsh-llm'
import { buildAuthorizeUrl } from '../oauth.js'
import { openaiMessages, modelCatalog } from '../messages.js'
import { jsonTokenRequest, tokenBlobFromOAuth, openaiChatStream, httpError, readJson , readErrorBody } from '../wire.js'
import { emailFromToken, planFromToken, avatarFromToken, scopesFromToken } from '../jwt.js'

export const id = 'perplexity'

const AUTH = 'https://www.perplexity.ai/oauth/authorize'
const TOKEN = 'https://api.perplexity.ai/oauth/token'
const PERPLEXITY_API_BASE = 'https://api.perplexity.ai'
const PROFILE = 'https://api.perplexity.ai/api/v1/user/profile'
const USAGE = 'https://api.perplexity.ai/api/v1/user/usage'
const SCOPE = 'openid profile email pro:search offline_access'

const PERPLEXITY_MODELS = [
  {
    id: 'sonar-reasoning-pro',
    name: 'Sonar Reasoning Pro',
    contextWindow: 128000,
    maxTokens: 8192,
    reasoning: {
      efforts: [
        { id: 'low', name: 'low' },
        { id: 'medium', name: 'medium' },
        { id: 'high', name: 'high' },
      ],
    },
    inputModalities: ['text'],
  },
  {
    id: 'sonar-pro',
    name: 'Sonar Pro',
    contextWindow: 200000,
    maxTokens: 8192,
    inputModalities: ['text'],
  },
  {
    id: 'sonar-reasoning',
    name: 'Sonar Reasoning',
    contextWindow: 128000,
    maxTokens: 8192,
    inputModalities: ['text'],
  },
  {
    id: 'sonar',
    name: 'Sonar',
    contextWindow: 128000,
    maxTokens: 8192,
    inputModalities: ['text'],
  },
  {
    id: 'r1-1776',
    name: 'DeepSeek R1 (Perplexity)',
    contextWindow: 128000,
    maxTokens: 8192,
    inputModalities: ['text'],
  },
]

export function providerInfo() {
  return { id, name: 'Perplexity Pro' }
}

export function defaults() {
  return {
    clientId: 'perplexity-cli-oauth',
    redirectUri: 'http://localhost:1455/auth/callback',
    apiBase: PERPLEXITY_API_BASE,
    models: PERPLEXITY_MODELS.map((m) => m.id),
  }
}

export function authorizeUrl(cfg = {}, pkce = {}) {
  const c = cfg || {}
  const p = pkce || {}
  if (!p.challenge || !p.state) {
    throw new Error('Perplexity OAuth requires PKCE challenge and state')
  }
  return buildAuthorizeUrl({
    authUrl: AUTH,
    clientId: c.clientId || defaults().clientId,
    redirectUri: c.redirectUri || defaults().redirectUri,
    challenge: p.challenge,
    state: p.state,
    scope: SCOPE,
  })
}

async function decorate(blob, fetchImpl) {
  let email = blob.email || emailFromToken(blob.accessToken) || emailFromToken(blob.idToken)
  let plan = blob.plan || planFromToken(blob.accessToken)
  let avatarUrl = blob.avatarUrl || avatarFromToken(blob.accessToken)
  let scopes = blob.scopes || scopesFromToken(blob.accessToken)

  if (fetchImpl && blob.accessToken && (!email || !plan)) {
    try {
      const res = await fetchImpl(PROFILE, {
        headers: {
          Authorization: `Bearer ${blob.accessToken}`,
          Accept: 'application/json',
        },
      })
      if (res.ok) {
        const json = await readJson(res)
        email = email || json.email || ''
        plan = plan || json.plan || (json.has_pro ? 'Perplexity Pro' : 'Free')
        avatarUrl = avatarUrl || json.picture || json.avatar_url || ''
        if (json.scope && !scopes.length) scopes = String(json.scope).split(/[\s,]+/).filter(Boolean)
      }
    } catch { /* profile is optional */ }
  }

  return {
    ...blob,
    email: email || '',
    plan: plan || 'Perplexity Pro',
    avatarUrl: avatarUrl || '',
    scopes,
    label: blob.label || email || 'Perplexity Pro',
  }
}

export async function exchangeCode(cfg, pkce, code, fetchImpl) {
  const json = await jsonTokenRequest(TOKEN, {
    grant_type: 'authorization_code',
    client_id: cfg.clientId || defaults().clientId,
    code,
    redirect_uri: cfg.redirectUri || defaults().redirectUri,
    code_verifier: pkce.verifier,
    state: pkce.state,
  }, fetchImpl)
  return decorate(tokenBlobFromOAuth(json), fetchImpl)
}

export async function refresh(cfg, blob, fetchImpl) {
  const json = await jsonTokenRequest(TOKEN, {
    grant_type: 'refresh_token',
    client_id: cfg.clientId || defaults().clientId,
    refresh_token: blob.refreshToken,
  }, fetchImpl)
  return decorate(tokenBlobFromOAuth(json, { label: blob.label, email: blob.email }), fetchImpl)
}

export async function listModels(_blob, cfg) {
  const customModels = (cfg && Array.isArray(cfg.models) && cfg.models.length) ? cfg.models : null
  if (customModels) {
    const enriched = customModels.map((m) => {
      const mid = typeof m === 'string' ? m : m.id
      const found = PERPLEXITY_MODELS.find((p) => p.id === mid)
      return found ? { ...found, ...(typeof m === 'object' ? m : {}) } : (typeof m === 'string' ? { id: m, name: m } : m)
    })
    return modelCatalog(id, enriched)
  }
  return modelCatalog(id, PERPLEXITY_MODELS)
}

export async function usage(blob, _cfg, fetchImpl) {
  if (!blob || (!blob.accessToken && !blob.apiKey)) return null
  const key = blob.accessToken || blob.apiKey
  const impl = fetchImpl || fetch
  try {
    const res = await impl(USAGE, {
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: 'application/json',
      },
    })
    if (res.ok) {
      const d = await readJson(res)
      if (typeof d.used_percent !== 'number') return null
      return {
        usedPercent: d.used_percent,
        plan: d.plan || blob.plan || 'Perplexity Pro',
        timestamp: Date.now(),
        quota: d.quota ? { used: d.quota.used, limit: d.quota.limit, resetAt: d.quota.reset_at } : undefined,
      }
    }
  } catch { /* usage endpoint is optional */ }
  return null
}

export async function* streamOnce({ blob, options, fetchImpl, headers, config, signal }) {
  const impl = fetchImpl || fetch
  const key = blob && (blob.accessToken || blob.apiKey)
  if (!key) throw new LlmError('Perplexity API key or session token required', 'AUTH')

  const url = `${(config && config.apiBase) || PERPLEXITY_API_BASE}/chat/completions`
  const body = {
    model: options.model || 'sonar-pro',
    messages: openaiMessages(options),
    stream: true,
  }

  const res = await impl(url, {
    method: 'POST',
    headers: {
      ...headers,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  })

  if (!res.ok) throw httpError(res.status, await readErrorBody(res))
  yield* openaiChatStream(res.body)
}
