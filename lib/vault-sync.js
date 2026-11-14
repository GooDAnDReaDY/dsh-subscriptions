import { ignoreErr } from './catch-log.js'
// #562: Automated Encrypted Vault Sync via WebDAV, S3, or Private Gist
// Supports periodic or on-change backup and synchronization of credentials.

import { exportVault, importVault } from './vault.js'
import { normalizeSlots } from './accounts.js'
import { Config, plainConfig, revisionOf } from './config-schema.js'
import { validateCredentialBlob } from './blob.js'
import { defaultSnapshotStore } from './vault-snapshots.js'
import { resolveDeviceIdentity, devicePassphrase, deviceWebdavUrl, deviceGistName, deviceS3Key } from './device-identity.js'
import { sanitizeSecrets } from './secret-scan.js'
import {
  DEFAULT_SYNC_TIMEOUT_MS,
  pushToWebdav,
  pullFromWebdav,
  pushToGist,
  pullFromGist,
  pushToS3,
  pullFromS3,
} from './vault-sync/remote.js'

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


// #1059: transports live in ./vault-sync/remote.js; re-exported for the public surface.
export {
  DEFAULT_SYNC_TIMEOUT_MS,
  resolveOutboundTargetPinned,
  pushToWebdav,
  pullFromWebdav,
  pushToGist,
  pullFromGist,
  buildS3SigV4Headers,
  pushToS3,
  pullFromS3,
} from './vault-sync/remote.js'
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
    const classifyAbsent = async () => {
      let configured = false
      try {
        configured = Boolean((await store.describeRef(slot.ref))?.configured)
      } catch (err) {
        // #883: an unreadable state is a storage failure, not a logged-out slot.
        failures.push({ ref: slot.ref, reason: 'credential state unreadable: ' + sanitizeSecrets(String(err && err.message || err)) })
        return
      }
      if (configured) failures.push({ ref: slot.ref, reason: 'missing credential' })
      else missing.push(slot.ref)
    }
    try {
      const blob = await store.loadBlob(slot.ref)
      if (blob) {
        blobs[slot.ref] = blob
        continue
      }
      await classifyAbsent()
    } catch (err) {
      // A slot that was never logged in is fine to skip; a configured account
      // that cannot be read blocks the export so a full backup is not replaced
      // with an incomplete one.
      if (err && err.code === 'AUTH') await classifyAbsent()
      else failures.push({ ref: slot.ref, reason: sanitizeSecrets(String(err && err.message || err)) })
    }
  }
  if (failures.length) {
    const err = new Error(`Vault export incomplete: ${failures.map((f) => f.ref).join(', ')} (${failures.map((f) => f.reason).join('; ')})`)
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

    // Save blobs into store. #953: never resurrect a slot the user logged out
    // (persisted tombstone) and never replace a newer local token with an older
    // remote one.
    let blobCount = 0
    for (const [ref, blob] of Object.entries(remoteBlobs)) {
      if (typeof store.isCleared === 'function' && store.isCleared(ref)) continue
      const next = validateCredentialBlob(blob)
      const local = await store.loadBlob(ref).catch(() => null)
      if (local && local.accessToken && Number(local.expiresAt || 0) > Number(next.expiresAt || 0)) continue
      if (typeof store.mutateBlob === 'function') {
        try {
          await store.mutateBlob(ref, (current) => {
            if (typeof store.isCleared === 'function' && store.isCleared(ref)) return null
            if (current && current.accessToken) {
              const currentExp = Number(current.expiresAt || 0)
              const nextExp = Number(next.expiresAt || 0)
              if (currentExp > nextExp) {
                return { ...next, ...current }
              }
            }
            return { ...current, ...next }
          }, { preserveTombstone: true })
        } catch (err) {
          if (err && err.code === 'AUTH') {
            if (typeof store.isCleared === 'function' && store.isCleared(ref)) continue
            await store.saveBlob(ref, next, { preserveTombstone: true })
          } else throw err
        }
      } else {
        if (typeof store.isCleared === 'function' && store.isCleared(ref)) continue
        await store.saveBlob(ref, next, { preserveTombstone: true })
      }
      blobCount++
    }

    if (typeof syncAdapter === 'function') await syncAdapter()
    if (typeof refreshModels === 'function') refreshModels().catch(ignoreErr('vault-sync.js: refreshModels'))

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
