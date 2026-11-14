import { ignoreError, ignoreErr } from '../catch-log.js'
import { createHmac, createHash } from 'node:crypto'
import { resolvePublicAddress, createPinnedDispatcher, validateOutboundUrl, isPrivateHostname } from '../webhook-url.js'
import { fetchWithPinnedDispatcher, envProxyForUrl } from '../http.js'

// #562 #1059: outbound transports for encrypted vault sync (WebDAV, Gist, S3).
// Split out of vault-sync.js so the orchestration module stays readable.
export async function resolveOutboundTargetPinned(raw, allowPrivate = false, lookupImpl) {
  const checked = validateOutboundUrl(raw, { allowPrivate })
  if (!checked.ok) throw new Error(checked.reason)
  if (allowPrivate) return { url: checked.url, address: null, family: null }
  const pinned = await resolvePublicAddress(checked.hostname, { lookupImpl })
  if (!pinned.ok) throw new Error(pinned.reason === 'DNS resolves to a private host'
    ? 'URL resolves to a private/loopback host'
    : `URL could not be safely resolved: ${pinned.reason}`)
  return { url: checked.url, address: pinned.address, family: pinned.family }
}
// --- Driver: WebDAV ---

export const DEFAULT_SYNC_TIMEOUT_MS = 30000

function timeoutError(label, timeoutMs) {
  const err = new Error(`${label} timed out after ${timeoutMs}ms`)
  err.code = 'VAULT_SYNC_TIMEOUT'
  return err
}

function closeDispatcher(res) {
  const dispatcher = res && res.__dshDispatcher
  if (!dispatcher || dispatcher.__dshClosed) return
  dispatcher.__dshClosed = true
  try { dispatcher.destroy() } catch (err) { ignoreError('vault-sync.js: close pinned dispatcher', err) }
}

function hasSensitiveHeaders(headers) {
  for (const key of Object.keys(headers || {})) {
    const name = key.toLowerCase()
    if (name === 'authorization' || name === 'cookie' || name === 'x-api-key' || name === 'x-goog-api-key') return true
    if (name.startsWith('x-amz-')) return true
  }
  return false
}

function withoutSensitiveHeaders(headers) {
  const out = {}
  for (const [key, value] of Object.entries(headers || {})) {
    const name = key.toLowerCase()
    if (name === 'authorization' || name === 'cookie' || name === 'x-api-key' || name === 'x-goog-api-key') continue
    if (name.startsWith('x-amz-')) continue
    out[key] = value
  }
  return out
}

async function outboundFetch(fetchFn, url, init, { timeoutMs = DEFAULT_SYNC_TIMEOUT_MS, signal, label = 'Vault sync request', pin, allowPrivate = false, lookupImpl, resignHeaders } = {}) {
  let currentUrl = url
  let currentPin = pin
  let method = String(init && init.method || 'GET').toUpperCase()
  let headers = (init && init.headers) || {}
  let body = init && init.body
  for (let hop = 0; hop < 5; hop += 1) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), Math.max(1, Number(timeoutMs) || DEFAULT_SYNC_TIMEOUT_MS))
    const onAbort = () => controller.abort()
    if (signal) {
      if (signal.aborted) controller.abort()
      else signal.addEventListener('abort', onAbort, { once: true })
    }
    // #927, #1001: keep the env proxy working; the proxy resolves the target, so the
    // pinned dispatcher is only bypassed when a proxy is actually used for this URL.
    const useProxy = envProxyForUrl(currentUrl)
    const dispatcher = currentPin && currentPin.address && !useProxy
      ? createPinnedDispatcher(currentPin.address, currentPin.family)
      : null
    let res
    try {
      const { body: _initialBody, ...requestInit } = init || {}
      res = await fetchWithPinnedDispatcher(fetchFn, dispatcher)(currentUrl, {
        ...requestInit,
        method,
        headers,
        ...(body === undefined ? {} : { body }),
        signal: controller.signal,
        redirect: 'manual',
      })
    } catch (err) {
      if (dispatcher) closeDispatcher({ __dshDispatcher: dispatcher })
      if (controller.signal.aborted) throw timeoutError(label, timeoutMs)
      throw err
    } finally {
      clearTimeout(timer)
      if (signal && typeof signal.removeEventListener === 'function') signal.removeEventListener('abort', onAbort)
    }

    const status = Number(res && res.status) || 0
    const location = res && res.headers && typeof res.headers.get === 'function' ? res.headers.get('location') : null
    if (status >= 300 && status < 400 && location) {
      if (dispatcher) closeDispatcher({ __dshDispatcher: dispatcher })
      let next
      try { next = new URL(location, res.url || currentUrl) } catch { throw new Error(`${label}: invalid redirect target`) }
      if (next.protocol !== 'http:' && next.protocol !== 'https:') throw new Error(`${label}: redirect must use http(s)`)
      const currentOrigin = new URL(currentUrl).origin
      // #924: never carry credentials, uploads or signed headers to another
      // origin, and never downgrade https to http.
      if (currentOrigin !== next.origin) {
        if (method !== 'GET' && method !== 'HEAD') {
          throw new Error(`${label}: cross-origin redirect blocked for ${method}`)
        }
        if (hasSensitiveHeaders(headers)) {
          throw new Error(`${label}: cross-origin redirect blocked for an authorized request`)
        }
        headers = withoutSensitiveHeaders(headers)
      }
      if (new URL(currentUrl).protocol === 'https:' && next.protocol === 'http:') {
        throw new Error(`${label}: redirect downgrade to http blocked`)
      }
      // HTTP semantics: 303 always switches to a body-less GET; 301/302 switch
      // only POST to GET; 307/308 preserve both method and body.
      if (status === 303 || ((status === 301 || status === 302) && method === 'POST')) {
        if (method !== 'GET' && method !== 'HEAD') {
          method = 'GET'
          body = undefined
          const stripped = {}
          for (const [key, value] of Object.entries(headers)) {
            if (key.toLowerCase() !== 'content-type' && key.toLowerCase() !== 'content-length') stripped[key] = value
          }
          headers = stripped
        }
      }
      if (!allowPrivate) {
        if (isPrivateHostname(next.hostname)) throw new Error(`${label}: redirect points to a private/loopback host`)
        const nextPin = await resolvePublicAddress(next.hostname, { lookupImpl })
        if (!nextPin.ok) throw new Error(`${label}: redirect could not be safely resolved`)
        currentPin = nextPin
      } else {
        currentPin = null
      }
      currentUrl = next.toString()
      // SigV4 covers the request path, so a redirected S3 call must be signed
      // again for the trusted same-origin target instead of reusing the old one.
      if (typeof resignHeaders === 'function') headers = resignHeaders(currentUrl)
      continue
    }

    if (dispatcher) {
      try { Object.defineProperty(res, '__dshDispatcher', { value: dispatcher, configurable: true }) } catch (err) { ignoreError('vault-sync.js: attach dispatcher', err) }
    }
    return res
  }
  throw new Error(`${label}: too many redirects`)
}

async function readBodyWithTimeout(res, kind, timeoutMs, label) {
  const ms = Math.max(1, Number(timeoutMs) || DEFAULT_SYNC_TIMEOUT_MS)
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      if (res && res.body && typeof res.body.cancel === 'function') res.body.cancel().catch(ignoreErr('vault-sync.js: cancel response body'))
      reject(timeoutError(label, ms))
    }, ms)
  })
  try {
    return await Promise.race([kind === 'json' ? res.json() : res.text(), timeout])
  } finally {
    clearTimeout(timer)
    closeDispatcher(res)
  }
}

export async function pushToWebdav({ url, username, password, encryptedData, fetchFn = fetch, allowPrivate = false, lookupImpl, timeoutMs = DEFAULT_SYNC_TIMEOUT_MS, signal }) {
  if (!url) throw new Error('WebDAV URL is required')
  const target = await resolveOutboundTargetPinned(url, allowPrivate, lookupImpl)
  const headers = {
    'Content-Type': 'text/plain; charset=utf-8',
  }
  if (username || password) {
    headers['Authorization'] = 'Basic ' + Buffer.from(`${username || ''}:${password || ''}`).toString('base64')
  }
  const res = await outboundFetch(fetchFn, target.url, {
    method: 'PUT',
    headers,
    body: encryptedData,
  }, { timeoutMs, signal, label: 'WebDAV push', pin: target, allowPrivate, lookupImpl })
  if (!res.ok && res.status !== 201 && res.status !== 204) {
    closeDispatcher(res)
    throw new Error(`WebDAV push failed: HTTP ${res.status} ${res.statusText}`)
  }
  closeDispatcher(res)
  return { ok: true, status: res.status }
}

export async function pullFromWebdav({ url, username, password, fetchFn = fetch, allowPrivate = false, lookupImpl, timeoutMs = DEFAULT_SYNC_TIMEOUT_MS, signal }) {
  if (!url) throw new Error('WebDAV URL is required')
  const target = await resolveOutboundTargetPinned(url, allowPrivate, lookupImpl)
  const headers = {}
  if (username || password) {
    headers['Authorization'] = 'Basic ' + Buffer.from(`${username || ''}:${password || ''}`).toString('base64')
  }
  const res = await outboundFetch(fetchFn, target.url, {
    method: 'GET',
    headers,
  }, { timeoutMs, signal, label: 'WebDAV pull', pin: target, allowPrivate, lookupImpl })
  if (!res.ok) {
    throw new Error(`WebDAV pull failed: HTTP ${res.status} ${res.statusText}`)
  }
  return readBodyWithTimeout(res, 'text', timeoutMs, 'WebDAV pull response')
}

// --- Driver: Gist (GitHub / Gitea) ---

export async function pushToGist({ baseUrl = 'https://api.github.com', gistId, token, encryptedData, fileName = 'dsh-subscriptions-vault.enc', fetchFn = fetch, allowPrivate = false, lookupImpl, timeoutMs = DEFAULT_SYNC_TIMEOUT_MS, signal }) {
  if (!token) throw new Error('Gist access token is required')
  const target = await resolveOutboundTargetPinned(baseUrl, allowPrivate, lookupImpl)
  const cleanBase = target.url.replace(/\/+$/, '')
  const headers = {
    'Authorization': `token ${token}`,
    'Accept': 'application/vnd.github.v3+json, application/json',
    'Content-Type': 'application/json',
    'User-Agent': 'dsh-subscriptions-vault-sync',
  }

  const files = {
    [fileName]: { content: encryptedData },
  }

  if (gistId) {
    const res = await outboundFetch(fetchFn, `${cleanBase}/gists/${gistId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        description: 'dsh-subscriptions encrypted vault',
        files,
      }),
    }, { timeoutMs, signal, label: 'Gist update', pin: target, allowPrivate, lookupImpl })
    if (!res.ok) throw new Error(`Gist update failed: HTTP ${res.status} ${res.statusText}`)
    const json = await readBodyWithTimeout(res, 'json', timeoutMs, 'Gist update response')
    return { ok: true, gistId: json.id || gistId }
  }

  // Create new secret gist
  const res = await outboundFetch(fetchFn, `${cleanBase}/gists`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      description: 'dsh-subscriptions encrypted vault',
      public: false,
      files,
    }),
  }, { timeoutMs, signal, label: 'Gist creation', pin: target, allowPrivate, lookupImpl })
  if (!res.ok) throw new Error(`Gist creation failed: HTTP ${res.status} ${res.statusText}`)
  const json = await readBodyWithTimeout(res, 'json', timeoutMs, 'Gist creation response')
  return { ok: true, gistId: json.id }
}

export async function pullFromGist({ baseUrl = 'https://api.github.com', gistId, token, fileName = 'dsh-subscriptions-vault.enc', fetchFn = fetch, allowPrivate = false, lookupImpl, timeoutMs = DEFAULT_SYNC_TIMEOUT_MS, signal }) {
  if (!gistId) throw new Error('Gist ID is required')
  const target = await resolveOutboundTargetPinned(baseUrl, allowPrivate, lookupImpl)
  const cleanBase = target.url.replace(/\/+$/, '')
  const headers = {
    'Accept': 'application/vnd.github.v3+json, application/json',
    'User-Agent': 'dsh-subscriptions-vault-sync',
  }
  if (token) headers['Authorization'] = `token ${token}`

  const res = await outboundFetch(fetchFn, `${cleanBase}/gists/${gistId}`, {
    method: 'GET',
    headers,
  }, { timeoutMs, signal, label: 'Gist pull', pin: target, allowPrivate, lookupImpl })
  if (!res.ok) throw new Error(`Gist pull failed: HTTP ${res.status} ${res.statusText}`)
  const json = await readBodyWithTimeout(res, 'json', timeoutMs, 'Gist pull response')
  const file = json.files && json.files[fileName]
  if (!file || !file.content) {
    throw new Error(fileName + ' not found in Gist')
  }
  return file.content
}

// --- Driver: S3 (SigV4) ---

function hmac(key, str) {
  return createHmac('sha256', key).update(str, 'utf8').digest()
}

function sha256Hex(data) {
  return createHash('sha256').update(data, 'utf8').digest('hex')
}

export function buildS3SigV4Headers({ method, url, region = 'us-east-1', accessKey, secretKey, body = '', date = new Date() }) {
  const parsed = new URL(url)
  const host = parsed.host
  const path = parsed.pathname || '/'

  const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)

  const payloadHash = sha256Hex(body)
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date'

  const canonicalReq = [
    method.toUpperCase(),
    path,
    parsed.search.slice(1),
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n')

  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalReq),
  ].join('\n')

  const kDate = hmac('AWS4' + secretKey, dateStamp)
  const kRegion = hmac(kDate, region)
  const kService = hmac(kRegion, 's3')
  const kSigning = hmac(kService, 'aws4_request')
  const signature = createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex')

  const authHeader = `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  return {
    'host': host,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash,
    'Authorization': authHeader,
  }
}

export async function pushToS3({ endpoint, bucket, key = 'dsh-subscriptions-vault.enc', region = 'us-east-1', accessKey, secretKey, encryptedData, fetchFn = fetch, allowPrivate = false, lookupImpl, timeoutMs = DEFAULT_SYNC_TIMEOUT_MS, signal }) {
  if (!endpoint || !accessKey || !secretKey) throw new Error('S3 endpoint, access key, and secret key are required')
  const target = await resolveOutboundTargetPinned(endpoint, allowPrivate, lookupImpl)
  const cleanEndpoint = target.url
  let targetUrl = bucket ? `${cleanEndpoint.replace(/\/+$/, '')}/${bucket}/${key.replace(/^\/+/, '')}` : `${cleanEndpoint.replace(/\/+$/, '')}/${key.replace(/^\/+/, '')}`

  const signFor = (url) => ({
    ...buildS3SigV4Headers({
      method: 'PUT',
      url,
      region,
      accessKey,
      secretKey,
      body: encryptedData,
    }),
    'Content-Type': 'text/plain; charset=utf-8',
  })
  const headers = signFor(targetUrl)

  const res = await outboundFetch(fetchFn, targetUrl, {
    method: 'PUT',
    headers,
    body: encryptedData,
  }, { timeoutMs, signal, label: 'S3 push', pin: target, allowPrivate, lookupImpl, resignHeaders: signFor })
  if (!res.ok && res.status !== 200 && res.status !== 204) {
    closeDispatcher(res)
    throw new Error(`S3 push failed: HTTP ${res.status} ${res.statusText}`)
  }
  closeDispatcher(res)
  return { ok: true, status: res.status }
}

export async function pullFromS3({ endpoint, bucket, key = 'dsh-subscriptions-vault.enc', region = 'us-east-1', accessKey, secretKey, fetchFn = fetch, allowPrivate = false, lookupImpl, timeoutMs = DEFAULT_SYNC_TIMEOUT_MS, signal }) {
  if (!endpoint || !accessKey || !secretKey) throw new Error('S3 endpoint, access key, and secret key are required')
  const target = await resolveOutboundTargetPinned(endpoint, allowPrivate, lookupImpl)
  const cleanEndpoint = target.url
  let targetUrl = bucket ? `${cleanEndpoint.replace(/\/+$/, '')}/${bucket}/${key.replace(/^\/+/, '')}` : `${cleanEndpoint.replace(/\/+$/, '')}/${key.replace(/^\/+/, '')}`

  const signFor = (url) => buildS3SigV4Headers({
    method: 'GET',
    url,
    region,
    accessKey,
    secretKey,
    body: '',
  })
  const headers = signFor(targetUrl)

  const res = await outboundFetch(fetchFn, targetUrl, {
    method: 'GET',
    headers,
  }, { timeoutMs, signal, label: 'S3 pull', pin: target, allowPrivate, lookupImpl, resignHeaders: signFor })
  if (!res.ok) {
    throw new Error(`S3 pull failed: HTTP ${res.status} ${res.statusText}`)
  }
  return readBodyWithTimeout(res, 'text', timeoutMs, 'S3 pull response')
}

// #691: v2 sync primitives — deterministic slot merge, encrypted snapshots and
// provider-level selection. Remote wins on conflicts, but conflicting rows are
// reported so the caller can surface them instead of silently dropping local state.
