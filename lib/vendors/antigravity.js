import { randomUUID } from 'node:crypto'
import { buildAuthorizeUrl } from '../oauth.js'
import { googleContents } from '../messages.js'
import { formTokenRequest, googleStream, throwHttpError, tokenBlobFromOAuth , readErrorBody } from '../wire.js'
import { fetchWithTimeout } from '../http.js'
import { emailFromToken, avatarFromToken, scopesFromToken } from '../jwt.js'
import {
  CODE_ASSIST_STREAM,
  antigravityMetadata,
  antigravityIdentityHeaders,
  discoverProject,
  fetchAvailableModels,
  antigravityTieredAlias,
  retrieveQuotaPercent,
  streamEnvelope,
  assistHeaders,
} from '../code-assist.js'

export const id = 'antigravity'
export const DEFAULT_CLI_CLIENT_ID = ['681255809395', 'oo8ft2oprdrnp9e3aqf6av3hmdib135j'].join('-') + '.' + 'apps.googleusercontent.com'


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
    clientId: '',
    clientSecret: '',
    redirectUri: 'http://localhost:8085/oauth/callback',
    models: [
      'gemini-3.8-flash-high',
      'gemini-3.8-flash-medium',
      'gemini-3.8-flash-low',
      'gemini-3.8-flash-tiered',
      'gemini-3.7-flash-high',
      'gemini-3.7-flash-medium',
      'gemini-3.7-flash-low',
      'gemini-3.7-flash-tiered',
      'gemini-3.6-flash-high',
      'gemini-3.6-flash-medium',
      'gemini-3.6-flash-low',
      'gemini-3.1-pro-low',
      'gemini-3.1-pro-high',
      'claude-sonnet-4-6',
      'claude-opus-4-6-thinking',
      'gpt-oss-120b-medium',
      'gemini-3-flash',
      'gemini-2.5-pro',
      'gemini-2.5-flash',
    ],
  }
}

export function authorizeUrl(cfg, pkce) {
  if (!cfg || !cfg.clientId || !String(cfg.clientId).trim()) {
    throw new Error('Google OAuth requires a custom Client ID. Please configure antigravityClientId in plugin settings or use "From CLI" to import active credentials.')
  }
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
      accountNotice: found.accountNotice || blob.accountNotice || '',
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
  const blob = tokenBlobFromOAuth(json, {
    clientId: cfg.clientId,
    ...(cfg.clientSecret ? { clientSecret: cfg.clientSecret } : {}),
  })
  const email = blob.email || emailFromToken(blob.idToken || blob.accessToken)
  const avatarUrl = blob.avatarUrl || avatarFromToken(blob.idToken || blob.accessToken)
  const scopes = blob.scopes?.length ? blob.scopes : (json?.scope ? String(json.scope).split(/[\s,]+/).filter(Boolean) : scopesFromToken(blob.idToken || blob.accessToken))
  const labeled = {
    ...blob,
    email,
    avatarUrl,
    scopes,
    label: blob.label || email || "Antigravity",
  }
  return withProject(labeled, fetchImpl)
}

export async function refresh(cfg, blob, fetchImpl) {
  const clientId = (cfg?.clientId && String(cfg.clientId).trim()) || (blob?.clientId && String(blob.clientId).trim()) || ''
  let clientSecret = (cfg?.clientSecret && String(cfg.clientSecret).trim()) || (blob?.clientSecret && String(blob.clientSecret).trim()) || ''

  if (!clientSecret && clientId === DEFAULT_CLI_CLIENT_ID) {
    throw new Error('Google OAuth refresh requires a client secret for the default Gemini CLI client. Configure antigravityClientSecret in plugin settings.')
  }

  if (!clientId) {
    throw new Error('Google OAuth refresh requires a Client ID. Configure antigravityClientId in plugin settings or re-import credentials with valid OAuth client metadata.')
  }

  let json
  try {
    json = await formTokenRequest(TOKEN, {
      client_id: clientId,
      ...(clientSecret ? { client_secret: clientSecret } : {}),
      grant_type: 'refresh_token',
      refresh_token: blob.refreshToken,
    }, fetchImpl)
  } catch (err) {
    const msg = String(err && err.message ? err.message : err)
    if (msg.includes('client_secret is missing') || (!clientSecret && msg.includes('400'))) {
      throw new Error(`Google OAuth refresh rejected: client_secret is missing. Please configure antigravityClientSecret in plugin settings. Original error: ${msg}`)
    }
    if (msg.includes('invalid_client') || msg.includes('401')) {
      throw new Error(`Google OAuth refresh rejected: invalid client credentials. Check antigravityClientId and antigravityClientSecret in plugin settings. Original error: ${msg}`)
    }
    throw err
  }

  return tokenBlobFromOAuth(json, {
    label: blob.label,
    email: blob.email,
    projectId: blob.projectId,
    paidTierId: blob.paidTierId,
    paidTierName: blob.paidTierName,
    sessionId: blob.sessionId,
    clientId,
    ...(clientSecret ? { clientSecret } : {}),
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

const RESPONSE_TIMEOUT_MS = 30000

function isTransientFailure(err) {
  return err?.name === 'TimeoutError' || err?.code === 'TIMEOUT' || err?.code === 'EMPTY_RESPONSE' || err instanceof TypeError
}

export async function* streamOnce({ blob, options, fetchImpl, headers, signal, saveBlob }) {
  const impl = fetchImpl || fetch
  // Abort must cover the project pre-flight as well as the stream.
  const preflight = (u, i) => fetchWithTimeout(impl, u, { ...(i || {}), signal }, { timeoutMs: RESPONSE_TIMEOUT_MS })
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let emitted = false
    try {
      const ready = await withProject(blob, preflight, saveBlob)
      const tiered = antigravityTieredAlias(options.model)
      const request = googleContents(options)
      if (tiered) {
        if (!request.generationConfig) request.generationConfig = {}
        request.generationConfig.thinkingConfig = /** @type {any} */ ({ thinkingLevel: tiered.thinkingLevel })
      }
      const { envelope, sessionId } = streamEnvelope({
        projectId: ready.projectId,
        model: tiered ? tiered.model : options.model,
        request,
        userAgent: 'antigravity',
        sessionId: ready.sessionId,
        paidTierId: ready.paidTierId,
      })
      const res = await fetchWithTimeout(impl, `${CODE_ASSIST_STREAM}:streamGenerateContent?alt=sse`, {
        method: 'POST',
        headers: {
          ...headers,
          ...assistHeaders(ready.accessToken, { ...headersFor(ready.projectId || ''), Accept: 'text/event-stream' }),
        },
        body: JSON.stringify(envelope),
        signal,
      }, { timeoutMs: RESPONSE_TIMEOUT_MS })
      if (!res.ok) throwHttpError(res.status, await readErrorBody(res))
      if (saveBlob && sessionId && sessionId !== ready.sessionId) {
        await saveBlob({ ...ready, sessionId })
      }
      const pending = []
      let hasContent = false
      for await (const event of googleStream(res.body, { signal, idleTimeoutMs: RESPONSE_TIMEOUT_MS })) {
        if (!hasContent) {
          if (event.type === 'text-delta' || event.type === 'tool-call-delta' || event.type === 'reasoning-delta') {
            hasContent = true
            for (const item of pending) { emitted = true; yield item }
          } else if (event.type !== 'finish') {
            pending.push(event)
            continue
          } else {
            continue
          }
        }
        emitted = true
        yield event
      }
      if (!hasContent) {
        const err = /** @type {any} */ (new Error('Antigravity returned no content'))
        err.code = 'EMPTY_RESPONSE'
        throw err
      }
      return
    } catch (err) {
      if (emitted || signal?.aborted || attempt === 1 || !isTransientFailure(err)) throw err
    }
  }
}
