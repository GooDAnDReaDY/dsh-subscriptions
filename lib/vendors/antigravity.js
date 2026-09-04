import { randomUUID } from 'node:crypto'
import { buildAuthorizeUrl } from '../oauth.js'
import { googleContents } from '../messages.js'
import { formTokenRequest, googleStream, throwHttpError, tokenBlobFromOAuth } from '../wire.js'
import { emailFromToken } from '../jwt.js'
import {
  CODE_ASSIST_STREAM,
  antigravityMetadata,
  antigravityIdentityHeaders,
  discoverProject,
  fetchAvailableModels,
  retrieveQuotaPercent,
  streamEnvelope,
  assistHeaders,
} from '../code-assist.js'

export const id = 'antigravity'

const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN = 'https://oauth2.googleapis.com/token'
const SCOPE = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/cclog',
  'https://www.googleapis.com/auth/experimentsandconfigs',
].join(' ')

export function providerInfo() {
  return { id, name: 'Antigravity' }
}

export function defaults() {
  return {
    clientId: 'ANTIGRAVITY_CLIENT_ID_REMOVED',
    clientSecret: 'ANTIGRAVITY_CLIENT_SECRET_REMOVED',
    redirectUri: 'http://localhost:8085/oauth/callback',
    models: [
      'gemini-3.1-pro-high-vertex',
      'gemini-3.1-pro-low',
      'gemini-3-flash',
      'gemini-3.1-flash-lite',
      'gemini-2.5-pro',
      'gemini-2.5-flash',
    ],
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
    extra: { access_type: 'offline', prompt: 'consent' },
  })
}

function headersFor(projectId) {
  return antigravityIdentityHeaders(projectId)
}

function metadataFor(projectId) {
  return antigravityMetadata(projectId)
}

async function withProject(blob, fetchImpl, saveBlob) {
  const impl = fetchImpl || fetch
  if (blob.projectId && blob.paidTierId) {
    return { ...blob, sessionId: blob.sessionId || randomUUID() }
  }
  try {
    const meta = metadataFor(blob.projectId || '')
    const found = await discoverProject(impl, blob.accessToken, meta, headersFor(blob.projectId || ''))
    const next = {
      ...blob,
      projectId: found.projectId || blob.projectId || '',
      paidTierId: found.paidTierId || blob.paidTierId || '',
      paidTierName: found.paidTierName || blob.paidTierName || '',
      sessionId: blob.sessionId || randomUUID(),
    }
    if (saveBlob) await saveBlob(next)
    return next
  } catch (e) {
    if (e && e.code === 'VALIDATION_REQUIRED' && e.validationUrl) {
      return { ...blob, validationUrl: e.validationUrl, validationMessage: String(e.message || '') }
    }
    return blob
  }
}

export async function exchangeCode(cfg, pkce, code, fetchImpl) {
  const json = await formTokenRequest(TOKEN, {
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret || '',
    grant_type: 'authorization_code',
    code,
    redirect_uri: cfg.redirectUri,
    code_verifier: pkce.verifier,
  }, fetchImpl)
  const blob = tokenBlobFromOAuth(json)
  const labeled = { ...blob, email: blob.email || emailFromToken(blob.accessToken), label: blob.label || 'Antigravity' }
  return withProject(labeled, fetchImpl)
}

export async function refresh(cfg, blob, fetchImpl) {
  const json = await formTokenRequest(TOKEN, {
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret || '',
    grant_type: 'refresh_token',
    refresh_token: blob.refreshToken,
  }, fetchImpl)
  return tokenBlobFromOAuth(json, {
    label: blob.label,
    email: blob.email,
    projectId: blob.projectId,
    paidTierId: blob.paidTierId,
    paidTierName: blob.paidTierName,
    sessionId: blob.sessionId,
  })
}


export async function check(blob, cfg, fetchImpl) {
  const impl = fetchImpl || fetch
  try {
    const models = await fetchAvailableModels(impl, blob.accessToken, headersFor(blob.projectId || ""), cfg.models || defaults().models, id)
    return { ok: true, raw: { models } }
  } catch (e) {
    // fallback to quota check
    throw e
  }
}

export async function listModels(blob, cfg, fetchImpl) {
  const fallback = cfg.models || defaults().models
  return fetchAvailableModels(fetchImpl || fetch, blob.accessToken, headersFor(blob.projectId || ''), fallback, id)
}

export async function usage(blob, _cfg, fetchImpl) {
  return retrieveQuotaPercent(fetchImpl || fetch, blob.accessToken, headersFor(blob.projectId || ''))
}

export async function* streamOnce({ blob, options, fetchImpl, headers, config, signal, saveBlob }) {
  const ready = await withProject(blob, fetchImpl, saveBlob)
  const { envelope, sessionId } = streamEnvelope({
    projectId: ready.projectId,
    model: options.model,
    request: googleContents(options),
    userAgent: 'antigravity',
    sessionId: ready.sessionId,
    paidTierId: ready.paidTierId,
  })
  const res = await fetchImpl(`${CODE_ASSIST_STREAM}:streamGenerateContent?alt=sse`, {
    method: 'POST',
    headers: {
      ...headers,
      ...assistHeaders(ready.accessToken, { ...headersFor(ready.projectId || ''), Accept: 'text/event-stream' }),
    },
    body: JSON.stringify(envelope),
    signal,
  })
  if (!res.ok) throwHttpError(res.status, await res.text())
  if (saveBlob && sessionId && sessionId !== ready.sessionId) {
    await saveBlob({ ...ready, sessionId })
  }
  yield* googleStream(res.body)
}
