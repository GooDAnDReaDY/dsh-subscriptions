// #563: JetBrains AI Assistant Subscription OAuth Vendor
// Supports OAuth PKCE authentication, token refresh, and JetBrains AI models.

import { LlmError } from '@deepseek-ai/dsh-llm'
import { buildAuthorizeUrl } from '../oauth.js'
import { openaiMessages, modelCatalog } from '../messages.js'
import { jsonTokenRequest, tokenBlobFromOAuth, openaiChatStream, httpError, readJson , readErrorBody } from '../wire.js'
import { emailFromToken, planFromToken, avatarFromToken, scopesFromToken } from '../jwt.js'

export const id = 'jetbrains'

const AUTH = 'https://account.jetbrains.com/oauth2/auth'
const TOKEN = 'https://oauth.jetbrains.com/oauth2/token'
const JETBRAINS_API_BASE = 'https://api.jetbrains.ai'
const USER_INFO = 'https://account.jetbrains.com/api/user'
const SCOPE = 'openid profile email ai.assistant offline_access'

const JETBRAINS_MODELS = [
  {
    id: 'jb-claude-3.5-sonnet',
    name: 'Claude 3.5 Sonnet (JetBrains AI)',
    contextWindow: 200000,
    maxTokens: 8192,
    inputModalities: ['text'],
  },
  {
    id: 'jb-claude-3.7-sonnet',
    name: 'Claude 3.7 Sonnet (JetBrains AI)',
    contextWindow: 200000,
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
    id: 'jb-gpt-4o',
    name: 'GPT-4o (JetBrains AI)',
    contextWindow: 128000,
    maxTokens: 8192,
    inputModalities: ['text'],
  },
  {
    id: 'jb-o3-mini',
    name: 'o3-mini (JetBrains AI)',
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
    id: 'jb-deepseek-r1',
    name: 'DeepSeek R1 (JetBrains AI)',
    contextWindow: 128000,
    maxTokens: 8192,
    inputModalities: ['text'],
  },
]

export function providerInfo() {
  return { id, name: 'JetBrains AI' }
}

export function defaults() {
  return {
    clientId: 'jetbrains-ai-assistant',
    redirectUri: 'http://localhost:1455/auth/callback',
    apiBase: JETBRAINS_API_BASE,
    models: JETBRAINS_MODELS.map((m) => m.id),
  }
}

export function authorizeUrl(cfg = {}, pkce = {}) {
  const c = cfg || {}
  const p = pkce || {}
  if (!p.challenge || !p.state) {
    throw new Error('JetBrains OAuth requires PKCE challenge and state')
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
      const res = await fetchImpl(USER_INFO, {
        headers: {
          Authorization: `Bearer ${blob.accessToken}`,
          Accept: 'application/json',
        },
      })
      if (res.ok) {
        const json = await readJson(res)
        email = email || json.email || json.username || ''
        plan = plan || json.plan || (json.has_ai_assistant ? 'JetBrains AI Pro' : 'JetBrains Account')
        avatarUrl = avatarUrl || json.picture || json.avatar_url || ''
        if (json.scope && !scopes.length) scopes = String(json.scope).split(/[\s,]+/).filter(Boolean)
      }
    } catch { /* user info is optional */ }
  }

  return {
    ...blob,
    email: email || '',
    plan: plan || 'JetBrains AI Pro',
    avatarUrl: avatarUrl || '',
    scopes,
    label: blob.label || email || 'JetBrains AI',
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
      const found = JETBRAINS_MODELS.find((p) => p.id === mid)
      return found ? { ...found, ...(typeof m === 'object' ? m : {}) } : (typeof m === 'string' ? { id: m, name: m } : m)
    })
    return modelCatalog(id, enriched)
  }
  return modelCatalog(id, JETBRAINS_MODELS)
}

export async function usage() {
  return null
}

export async function* streamOnce({ blob, options, fetchImpl, headers, config, signal }) {
  const impl = fetchImpl || fetch
  const token = blob && (blob.accessToken || blob.token)
  if (!token) throw new LlmError('JetBrains AI Assistant not authenticated', 'AUTH')

  const url = `${(config && config.apiBase) || JETBRAINS_API_BASE}/v1/chat/completions`
  const model = (options.model || 'jb-claude-3.5-sonnet').replace(/^jb-/, '')
  const body = {
    model,
    messages: openaiMessages(options),
    stream: true,
  }

  const res = await impl(url, {
    method: 'POST',
    headers: {
      ...headers,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'IntelliJ-IDEA/2026.1',
    },
    body: JSON.stringify(body),
    signal,
  })

  if (!res.ok) throw httpError(res.status, await readErrorBody(res))
  yield* openaiChatStream(res.body)
}
