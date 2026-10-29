// #562: Automated Encrypted Vault Sync via WebDAV, S3, or Private Gist
// Supports periodic or on-change backup and synchronization of credentials.

import { createHmac, createHash } from 'node:crypto'
import { exportVault, importVault } from './vault.js'
import { normalizeSlots } from './accounts.js'
import { Config, plainConfig, revisionOf } from './config-schema.js'
import { validateCredentialBlob } from './blob.js'
import { defaultSnapshotStore } from './vault-snapshots.js'
import { resolveDeviceIdentity, devicePassphrase, deviceWebdavUrl, deviceGistName, deviceS3Key } from './device-identity.js'
import { resolvePublicHostname, validateOutboundUrl } from './webhook-url.js'

let syncStatus = {
  enabled: false,
  backend: 'webdav',
  lastPushAt: null,
  lastPullAt: null,
  lastPushStatus: 'idle',
  lastPullStatus: 'idle',
  lastExportedAt: null,
  lastError: null,
}

export async function resolveOutboundTarget(raw, allowPrivate = false, lookupImpl) {
  const checked = validateOutboundUrl(raw, { allowPrivate })
  if (!checked.ok) throw new Error(checked.reason)
  if (!allowPrivate && !(await resolvePublicHostname(checked.hostname, { lookupImpl }))) {
    throw new Error('URL resolves to a private/loopback host')
  }
  return checked.url
}

export function getVaultSyncStatus() {
  return { ...syncStatus }
}

export function resetVaultSyncStatus() {
  syncStatus = {
    enabled: false,
    backend: 'webdav',
    lastPushAt: null,
    lastPullAt: null,
    lastPushStatus: 'idle',
    lastPullStatus: 'idle',
    lastExportedAt: null,
    lastError: null,
  }
}

// --- Driver: WebDAV ---

export const DEFAULT_SYNC_TIMEOUT_MS = 30000

function timeoutError(label, timeoutMs) {
  const err = new Error(`${label} timed out after ${timeoutMs}ms`)
  err.code = 'VAULT_SYNC_TIMEOUT'
  return err
}

async function outboundFetch(fetchFn, url, init, { timeoutMs = DEFAULT_SYNC_TIMEOUT_MS, signal, label = 'Vault sync request' } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.max(1, Number(timeoutMs) || DEFAULT_SYNC_TIMEOUT_MS))
  const onAbort = () => controller.abort()
  if (signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener('abort', onAbort, { once: true })
  }
  try {
    return await fetchFn(url, { ...init, signal: controller.signal })
  } catch (err) {
    if (controller.signal.aborted) throw timeoutError(label, timeoutMs)
    throw err
  } finally {
    clearTimeout(timer)
    if (signal && typeof signal.removeEventListener === 'function') signal.removeEventListener('abort', onAbort)
  }
}

async function readBodyWithTimeout(res, kind, timeoutMs, label) {
  const ms = Math.max(1, Number(timeoutMs) || DEFAULT_SYNC_TIMEOUT_MS)
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      if (res && res.body && typeof res.body.cancel === 'function') res.body.cancel().catch(() => {})
      reject(timeoutError(label, ms))
    }, ms)
  })
  try {
    return await Promise.race([kind === 'json' ? res.json() : res.text(), timeout])
  } finally {
    clearTimeout(timer)
  }
}

export async function pushToWebdav({ url, username, password, encryptedData, fetchFn = fetch, allowPrivate = false, lookupImpl, timeoutMs = DEFAULT_SYNC_TIMEOUT_MS, signal }) {
  if (!url) throw new Error('WebDAV URL is required')
  const target = await resolveOutboundTarget(url, allowPrivate, lookupImpl)
  const headers = {
    'Content-Type': 'text/plain; charset=utf-8',
  }
  if (username || password) {
    headers['Authorization'] = 'Basic ' + Buffer.from(`${username || ''}:${password || ''}`).toString('base64')
  }
  const res = await outboundFetch(fetchFn, target, {
    method: 'PUT',
    headers,
    body: encryptedData,
  }, { timeoutMs, signal, label: 'WebDAV push' })
  if (!res.ok && res.status !== 201 && res.status !== 204) {
    throw new Error(`WebDAV push failed: HTTP ${res.status} ${res.statusText}`)
  }
  return { ok: true, status: res.status }
}

export async function pullFromWebdav({ url, username, password, fetchFn = fetch, allowPrivate = false, lookupImpl, timeoutMs = DEFAULT_SYNC_TIMEOUT_MS, signal }) {
  if (!url) throw new Error('WebDAV URL is required')
  const target = await resolveOutboundTarget(url, allowPrivate, lookupImpl)
  const headers = {}
  if (username || password) {
    headers['Authorization'] = 'Basic ' + Buffer.from(`${username || ''}:${password || ''}`).toString('base64')
  }
  const res = await outboundFetch(fetchFn, target, {
    method: 'GET',
    headers,
  }, { timeoutMs, signal, label: 'WebDAV pull' })
  if (!res.ok) {
    throw new Error(`WebDAV pull failed: HTTP ${res.status} ${res.statusText}`)
  }
  return readBodyWithTimeout(res, 'text', timeoutMs, 'WebDAV pull response')
}

// --- Driver: Gist (GitHub / Gitea) ---

export async function pushToGist({ baseUrl = 'https://api.github.com', gistId, token, encryptedData, fileName = 'dsh-subscriptions-vault.enc', fetchFn = fetch, allowPrivate = false, lookupImpl, timeoutMs = DEFAULT_SYNC_TIMEOUT_MS, signal }) {
  if (!token) throw new Error('Gist access token is required')
  const cleanBase = await resolveOutboundTarget(baseUrl, allowPrivate, lookupImpl)
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
    }, { timeoutMs, signal, label: 'Gist update' })
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
  }, { timeoutMs, signal, label: 'Gist creation' })
  if (!res.ok) throw new Error(`Gist creation failed: HTTP ${res.status} ${res.statusText}`)
  const json = await readBodyWithTimeout(res, 'json', timeoutMs, 'Gist creation response')
  return { ok: true, gistId: json.id }
}

export async function pullFromGist({ baseUrl = 'https://api.github.com', gistId, token, fileName = 'dsh-subscriptions-vault.enc', fetchFn = fetch, allowPrivate = false, lookupImpl, timeoutMs = DEFAULT_SYNC_TIMEOUT_MS, signal }) {
  if (!gistId) throw new Error('Gist ID is required')
  const cleanBase = await resolveOutboundTarget(baseUrl, allowPrivate, lookupImpl)
  const headers = {
    'Accept': 'application/vnd.github.v3+json, application/json',
    'User-Agent': 'dsh-subscriptions-vault-sync',
  }
  if (token) headers['Authorization'] = `token ${token}`

  const res = await outboundFetch(fetchFn, `${cleanBase}/gists/${gistId}`, {
    method: 'GET',
    headers,
  }, { timeoutMs, signal, label: 'Gist pull' })
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
  let cleanEndpoint = await resolveOutboundTarget(endpoint, allowPrivate, lookupImpl)
  let targetUrl = bucket ? `${cleanEndpoint.replace(/\/+$/, '')}/${bucket}/${key.replace(/^\/+/, '')}` : `${cleanEndpoint.replace(/\/+$/, '')}/${key.replace(/^\/+/, '')}`

  const headers = buildS3SigV4Headers({
    method: 'PUT',
    url: targetUrl,
    region,
    accessKey,
    secretKey,
    body: encryptedData,
  })
  headers['Content-Type'] = 'text/plain; charset=utf-8'

  const res = await outboundFetch(fetchFn, targetUrl, {
    method: 'PUT',
    headers,
    body: encryptedData,
  }, { timeoutMs, signal, label: 'S3 push' })
  if (!res.ok && res.status !== 200 && res.status !== 204) {
    throw new Error(`S3 push failed: HTTP ${res.status} ${res.statusText}`)
  }
  return { ok: true, status: res.status }
}

export async function pullFromS3({ endpoint, bucket, key = 'dsh-subscriptions-vault.enc', region = 'us-east-1', accessKey, secretKey, fetchFn = fetch, allowPrivate = false, lookupImpl, timeoutMs = DEFAULT_SYNC_TIMEOUT_MS, signal }) {
  if (!endpoint || !accessKey || !secretKey) throw new Error('S3 endpoint, access key, and secret key are required')
  let cleanEndpoint = await resolveOutboundTarget(endpoint, allowPrivate, lookupImpl)
  let targetUrl = bucket ? `${cleanEndpoint.replace(/\/+$/, '')}/${bucket}/${key.replace(/^\/+/, '')}` : `${cleanEndpoint.replace(/\/+$/, '')}/${key.replace(/^\/+/, '')}`

  const headers = buildS3SigV4Headers({
    method: 'GET',
    url: targetUrl,
    region,
    accessKey,
    secretKey,
    body: '',
  })

  const res = await outboundFetch(fetchFn, targetUrl, {
    method: 'GET',
    headers,
  }, { timeoutMs, signal, label: 'S3 pull' })
  if (!res.ok) {
    throw new Error(`S3 pull failed: HTTP ${res.status} ${res.statusText}`)
  }
  return readBodyWithTimeout(res, 'text', timeoutMs, 'S3 pull response')
}

// #691: v2 sync primitives — deterministic slot merge, encrypted snapshots and
// provider-level selection. Remote wins on conflicts, but conflicting rows are
// reported so the caller can surface them instead of silently dropping local state.
export function mergeVaultSlots(localSlots, remoteSlots) {
  const out = (Array.isArray(localSlots) ? localSlots : []).map((slot) => ({ ...slot }))
  const keyOf = (slot) => slot && (slot.ref || (slot.provider + ':' + (slot.index == null ? 1 : slot.index)))
  const indexByKey = new Map(out.map((slot, idx) => [keyOf(slot), idx]))
  const conflicts = []
  for (const remote of (Array.isArray(remoteSlots) ? remoteSlots : [])) {
    if (!remote) continue
    const key = keyOf(remote)
    const idx = indexByKey.get(key)
    if (idx == null) {
      out.push({ ...remote })
      indexByKey.set(key, out.length - 1)
      continue
    }
    if (JSON.stringify(out[idx]) !== JSON.stringify(remote)) conflicts.push({ key, local: out[idx], remote })
    out[idx] = { ...out[idx], ...remote }
  }
  return { slots: out, conflicts }
}

export function createVaultSnapshot({ slots, blobs = {} }, passphrase, label = '', meta = {}) {
  if (!passphrase) throw new Error('passphrase is required for a vault snapshot')
  const { vault, slotCount, blobCount } = exportVault({ slots: slots || [], blobs }, passphrase)
  return { version: 2, label: String(label || ''), createdAt: new Date().toISOString(), vault, slotCount, blobCount, ...meta }
}

export function capturePrePullSnapshot(slots, passphrase, label = 'pre-pull', meta = {}, blobs = {}) {
  return defaultSnapshotStore.add(createVaultSnapshot({ slots: slots || [], blobs }, passphrase, label, meta))
}

export function resolveVaultKey(cfg, passphrase) {
  const perDevice = cfg && cfg.vaultPerDeviceKeys !== false
  const device = resolveDeviceIdentity({ id: cfg && cfg.vaultDeviceId, label: cfg && cfg.vaultDeviceLabel })
  return {
    passphrase: perDevice ? devicePassphrase(passphrase, device.id) : passphrase,
    keyMode: perDevice ? 'device' : 'base',
    deviceId: perDevice ? device.id : '',
  }
}

export function restoreSnapshotWithConfig(snapshot, cfg) {
  const base = String((cfg && cfg.vaultSyncPassphrase) || '').trim()
  if (!base) throw new Error('vaultSyncPassphrase is required to restore a snapshot')
  const attempts = []
  if (snapshot && snapshot.keyMode === 'device') {
    attempts.push(devicePassphrase(base, snapshot.deviceId || resolveVaultKey(cfg, base).deviceId))
  } else if (snapshot && snapshot.keyMode === 'base') {
    attempts.push(base)
  } else {
    // Snapshots written before #749/#754 have no keyMode. Try the legacy
    // base key first, then the current device key.
    attempts.push(base, resolveVaultKey(cfg, base).passphrase)
  }
  let lastError = null
  for (const pass of attempts) {
    try { return restoreVaultSnapshot(snapshot, pass) } catch (err) { lastError = err }
  }
  throw lastError || new Error('unable to restore snapshot')
}

export function restoreVaultSnapshot(snapshot, passphrase) {
  if (!snapshot || typeof snapshot.vault !== 'string' || !snapshot.vault) throw new Error('snapshot is missing its encrypted vault')
  return importVault(snapshot.vault, passphrase)
}

export async function collectVaultBlobs(store, slots) {
  const blobs = {}
  const missing = []
  const failures = []
  for (const slot of normalizeSlots(slots)) {
    try {
      const blob = await store.loadBlob(slot.ref)
      if (blob) {
        blobs[slot.ref] = blob
        continue
      }
      let configured = false
      try { configured = Boolean((await store.describeRef(slot.ref))?.configured) } catch { /* keep unknown */ }
      if (configured) failures.push({ ref: slot.ref, reason: 'missing credential' })
      else missing.push(slot.ref)
    } catch (err) {
      failures.push({ ref: slot.ref, reason: String(err && err.message || err) })
    }
  }
  if (failures.length) {
    const err = new Error(`Vault export incomplete: ${failures.map((f) => f.ref).join(', ')}`)
    err.code = 'VAULT_PARTIAL'
    err.failures = failures
    throw err
  }
  return { blobs, missing }
}

// --- Sync Coordination: Push & Pull ---

export async function syncVaultPush({ live, store, fetchFn = fetch, lookupImpl }) {
  const cfg = live && typeof live === 'function' ? live() : (live || {})
  const passphrase = String(cfg.vaultSyncPassphrase || '').trim()
  if (!passphrase) {
    throw new Error('vaultSyncPassphrase is required to sync vault')
  }

  syncStatus.enabled = Boolean(cfg.vaultSyncEnabled)
  syncStatus.backend = cfg.vaultSyncBackend || 'webdav'
  syncStatus.lastPushStatus = 'running'

  try {
    const providerFilter = new Set((cfg.vaultSyncProviders || []).map((p) => String(p)))
    const allSlots = cfg.slots || []
    const slots = providerFilter.size ? allSlots.filter((slot) => providerFilter.has(String(slot && slot.provider))) : allSlots
    const blobs = {}
    const { blobs: collected } = await collectVaultBlobs(store, slots)
    Object.assign(blobs, collected)

    const device = resolveDeviceIdentity({ id: cfg.vaultDeviceId, label: cfg.vaultDeviceLabel })
    const perDevice = cfg.vaultPerDeviceKeys !== false
    const timeoutMs = Number(cfg.vaultSyncTimeoutMs) || DEFAULT_SYNC_TIMEOUT_MS
    const activePass = resolveVaultKey(cfg, passphrase).passphrase
    const { vault, slotCount, blobCount } = exportVault({ slots, blobs }, activePass)
    const backend = cfg.vaultSyncBackend || 'webdav'

    if (backend === 'webdav') {
      await pushToWebdav({
        url: perDevice ? deviceWebdavUrl(cfg.vaultSyncWebdavUrl, device.id) : cfg.vaultSyncWebdavUrl,
        username: cfg.vaultSyncWebdavUsername,
        password: cfg.vaultSyncWebdavPassword,
        encryptedData: vault,
        fetchFn,
        allowPrivate: Boolean(cfg.vaultSyncAllowPrivate),
        lookupImpl,
        timeoutMs,
      })
    } else if (backend === 'gist') {
      const res = await pushToGist({
        baseUrl: cfg.vaultSyncGistBaseUrl || 'https://api.github.com',
        gistId: cfg.vaultSyncGistId,
        token: cfg.vaultSyncGistToken,
        encryptedData: vault,
        fileName: perDevice ? deviceGistName(device.id) : undefined,
        fetchFn,
        allowPrivate: Boolean(cfg.vaultSyncAllowPrivate),
        lookupImpl,
        timeoutMs,
      })
      if (res.gistId && !cfg.vaultSyncGistId) {
        syncStatus.lastGistId = res.gistId
      }
    } else if (backend === 's3') {
      await pushToS3({
        endpoint: cfg.vaultSyncS3Endpoint,
        bucket: cfg.vaultSyncS3Bucket,
        key: perDevice ? deviceS3Key(cfg.vaultSyncS3Key || 'dsh-subscriptions-vault.enc', device.id) : (cfg.vaultSyncS3Key || 'dsh-subscriptions-vault.enc'),
        region: cfg.vaultSyncS3Region || 'us-east-1',
        accessKey: cfg.vaultSyncS3AccessKey,
        secretKey: cfg.vaultSyncS3SecretKey,
        encryptedData: vault,
        fetchFn,
        allowPrivate: Boolean(cfg.vaultSyncAllowPrivate),
        lookupImpl,
        timeoutMs,
      })
    } else {
      throw new Error(`unsupported vault sync backend: ${backend}`)
    }

    syncStatus.lastPushAt = new Date().toISOString()
    syncStatus.lastPushStatus = 'ok'
    syncStatus.lastError = null

    return {
      ok: true,
      backend,
      slotCount,
      blobCount,
      timestamp: syncStatus.lastPushAt,
    }
  } catch (err) {
    syncStatus.lastPushStatus = 'error'
    syncStatus.lastError = String(err && err.message || err)
    throw err
  }
}

export async function syncVaultPull({ live, store, settingsApi, syncAdapter, refreshModels, fetchFn = fetch, lookupImpl }) {
  const cfg = live && typeof live === 'function' ? live() : (live || {})
  const passphrase = String(cfg.vaultSyncPassphrase || '').trim()
  if (!passphrase) {
    throw new Error('vaultSyncPassphrase is required to sync vault')
  }

  syncStatus.enabled = Boolean(cfg.vaultSyncEnabled)
  syncStatus.backend = cfg.vaultSyncBackend || 'webdav'
  syncStatus.lastPullStatus = 'running'

  try {
    const backend = cfg.vaultSyncBackend || 'webdav'
    const device = resolveDeviceIdentity({ id: cfg.vaultDeviceId, label: cfg.vaultDeviceLabel })
    const perDevice = cfg.vaultPerDeviceKeys !== false
    const timeoutMs = Number(cfg.vaultSyncTimeoutMs) || DEFAULT_SYNC_TIMEOUT_MS
    let activePass = perDevice ? devicePassphrase(passphrase, device.id) : passphrase
    let snapshotKeyMode = perDevice ? 'device' : 'base'
    let usedLegacy = false
    const load = async (deviceMode) => {
      const allowPrivate = Boolean(cfg.vaultSyncAllowPrivate)
      if (backend === 'webdav') {
        return pullFromWebdav({
          url: deviceMode ? deviceWebdavUrl(cfg.vaultSyncWebdavUrl, device.id) : cfg.vaultSyncWebdavUrl,
          username: cfg.vaultSyncWebdavUsername,
          password: cfg.vaultSyncWebdavPassword,
          fetchFn,
          allowPrivate,
          lookupImpl,
          timeoutMs,
        })
      }
      if (backend === 'gist') {
        return pullFromGist({
          baseUrl: cfg.vaultSyncGistBaseUrl || 'https://api.github.com',
          gistId: cfg.vaultSyncGistId,
          token: cfg.vaultSyncGistToken,
          fileName: deviceMode ? deviceGistName(device.id) : undefined,
          fetchFn,
          allowPrivate,
          lookupImpl,
          timeoutMs,
        })
      }
      if (backend === 's3') {
        return pullFromS3({
          endpoint: cfg.vaultSyncS3Endpoint,
          bucket: cfg.vaultSyncS3Bucket,
          key: deviceMode ? deviceS3Key(cfg.vaultSyncS3Key || 'dsh-subscriptions-vault.enc', device.id) : (cfg.vaultSyncS3Key || 'dsh-subscriptions-vault.enc'),
          region: cfg.vaultSyncS3Region || 'us-east-1',
          accessKey: cfg.vaultSyncS3AccessKey,
          secretKey: cfg.vaultSyncS3SecretKey,
          fetchFn,
          allowPrivate,
          lookupImpl,
          timeoutMs,
        })
      }
      throw new Error(`unsupported vault sync backend: ${backend}`)
    }
    let encryptedData
    try {
      encryptedData = await load(perDevice)
    } catch (err) {
      if (!perDevice) throw err
      encryptedData = await load(false)
      activePass = passphrase
      snapshotKeyMode = 'base'
      usedLegacy = true
    }

    const { blobs: snapshotBlobs } = await collectVaultBlobs(store, cfg.slots || [])
    capturePrePullSnapshot(cfg.slots || [], activePass, 'pre-pull', {
      keyMode: snapshotKeyMode,
      deviceId: snapshotKeyMode === 'device' ? device.id : '',
    }, snapshotBlobs)
    const result = importVault(encryptedData, activePass)
    const providerFilter = new Set((cfg.vaultSyncProviders || []).map((p) => String(p)))
    const remoteSlots = providerFilter.size
      ? result.slots.filter((slot) => providerFilter.has(String(slot && slot.provider)))
      : result.slots
    const allowedRefs = new Set(remoteSlots.map((slot) => slot && slot.ref))
    const remoteBlobs = Object.fromEntries(Object.entries(result.blobs || {}).filter(([ref]) =>
      !providerFilter.size || allowedRefs.has(ref)))

    // Merge slots into live configuration; keep local-only rows and report conflicts.
    let conflicts = []
    if (remoteSlots.length && settingsApi) {
      const revision = revisionOf(settingsApi)
      const merged = mergeVaultSlots(Array.isArray(cfg.slots) ? cfg.slots.slice() : [], remoteSlots)
      conflicts = merged.conflicts
      const parsed = plainConfig(Config({ ...cfg, slots: merged.slots }))
      await settingsApi.replace(parsed, revision)
    }

    // Save blobs into store
    let blobCount = 0
    for (const [ref, blob] of Object.entries(remoteBlobs)) {
      await store.saveBlob(ref, validateCredentialBlob(blob))
      blobCount++
    }

    if (typeof syncAdapter === 'function') await syncAdapter()
    if (typeof refreshModels === 'function') refreshModels().catch(() => {})

    syncStatus.lastPullAt = new Date().toISOString()
    syncStatus.lastExportedAt = result.exportedAt
    syncStatus.lastPullStatus = 'ok'
    syncStatus.lastError = null

    return {
      ok: true,
      backend,
      slotCount: result.slots.length,
      blobCount,
      conflicts: conflicts.length,
      deviceId: device.id,
      perDevice,
      legacy: usedLegacy,
      exportedAt: result.exportedAt,
      timestamp: syncStatus.lastPullAt,
    }
  } catch (err) {
    syncStatus.lastPullStatus = 'error'
    syncStatus.lastError = String(err && err.message || err)
    throw err
  }
}
