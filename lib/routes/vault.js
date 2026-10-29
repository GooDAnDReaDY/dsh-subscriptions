import { Config, plainConfig, revisionOf } from '../config-schema.js'
import { isTrustedSettingsRequest, readBody, safeJsonHandler, writeJson } from '../http.js'
import { capturePrePullSnapshot, collectVaultBlobs, restoreSnapshotWithConfig, resolveVaultKey, syncVaultPush, syncVaultPull, getVaultSyncStatus } from '../vault-sync.js'
import { defaultSnapshotStore } from '../vault-snapshots.js'
import { validateCredentialBlob } from '../blob.js'
import { exportVault, importVault } from '../vault.js'

export function registerVaultRoutes(ctx, state) {
  const { live, getSettingsApi, syncAdapter, stripLegacySlots, store } = state

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/vault/snapshots',
    handler: safeJsonHandler(async (req, res) => {
      if (!isTrustedSettingsRequest(req, ctx)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
        return
      }
      if (req.method === 'GET') {
        writeJson(res, 200, { ok: true, snapshots: defaultSnapshotStore.list(), stats: defaultSnapshotStore.stats() })
        return
      }
      if (req.method !== 'POST') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'GET or POST' } })
        return
      }
      let body = {}
      try { body = JSON.parse((await readBody(req, 4096)).toString('utf8') || '{}') } catch {
        writeJson(res, 400, { ok: false, error: { code: 'json', message: 'invalid json' } })
        return
      }
      const passphrase = String(live().vaultSyncPassphrase || '').trim()
      if (!passphrase) {
        writeJson(res, 400, { ok: false, error: { code: 'vault', message: 'vaultSyncPassphrase is required' } })
        return
      }
      try {
        const key = resolveVaultKey(live(), passphrase)
        const { blobs } = await collectVaultBlobs(store, live().slots || [])
        const snapshot = capturePrePullSnapshot(live().slots || [], key.passphrase, String(body.label || 'manual'), {
          keyMode: key.keyMode,
          deviceId: key.deviceId,
        }, blobs)
        writeJson(res, 200, { ok: true, snapshot })
      } catch (err) {
        writeJson(res, 400, { ok: false, error: { code: 'vault', message: String(err && err.message || err) } })
      }
    }),
  }), 'dsh-subscriptions: /vault/snapshots')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/vault/snapshots/restore',
    handler: safeJsonHandler(async (req, res) => {
      if (req.method !== 'POST') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'POST only' } })
        return
      }
      if (!isTrustedSettingsRequest(req, ctx)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
        return
      }
      let body = {}
      try { body = JSON.parse((await readBody(req, 4096)).toString('utf8') || '{}') } catch {
        writeJson(res, 400, { ok: false, error: { code: 'json', message: 'invalid json' } })
        return
      }
      const snapshot = defaultSnapshotStore.get(String(body.id || ''))
      if (!snapshot) {
        writeJson(res, 404, { ok: false, error: { code: 'snapshot', message: 'snapshot not found' } })
        return
      }
      const passphrase = String(live().vaultSyncPassphrase || '').trim()
      if (!passphrase) {
        writeJson(res, 400, { ok: false, error: { code: 'vault', message: 'vaultSyncPassphrase is required' } })
        return
      }
      const api = getSettingsApi()
      if (!api) {
        writeJson(res, 503, { ok: false, error: { code: 'settings', message: 'settings not ready' } })
        return
      }
      try {
        const restored = restoreSnapshotWithConfig(snapshot, live())
        const cfg = live()
        const slots = stripLegacySlots(restored.slots || [])
        let blobCount = 0
        for (const [ref, blob] of Object.entries(restored.blobs || {})) {
          await store.saveBlob(ref, validateCredentialBlob(blob))
          blobCount++
        }
        await api.replace(plainConfig(Config({ ...cfg, slots })), revisionOf(api))
        if (typeof syncAdapter === 'function') await syncAdapter()
        writeJson(res, 200, { ok: true, id: snapshot.id, slotCount: slots.length, blobCount })
      } catch (err) {
        writeJson(res, 400, { ok: false, error: { code: 'vault', message: String(err && err.message || err) } })
      }
    }),
  }), 'dsh-subscriptions: /vault/snapshots/restore')
}

export function registerVaultTransferRoutes(ctx, state) {
  const { live, getSettingsApi, syncCustomVendors, syncAdapter, stripLegacySlots, store, refreshModels, accountsView } = state

  const handleVaultExport = safeJsonHandler(async (req, res) => {
    if (req.method !== 'POST') {
      writeJson(res, 405, { ok: false, error: { code: 'method', message: 'POST only' } })
      return
    }
    if (!isTrustedSettingsRequest(req, ctx)) {
      writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
      return
    }
    let payload
    try { payload = JSON.parse((await readBody(req, 8 * 1024)).toString('utf8') || '{}') } catch {
      writeJson(res, 400, { ok: false, error: { code: 'json', message: 'invalid json' } })
      return
    }
    const passphrase = payload.passphrase
    const algorithm = payload.algorithm || 'pbkdf2'
    try {
      const slots = live().slots || []
      const { blobs } = await collectVaultBlobs(store, slots)
      const result = exportVault({ slots, blobs, algorithm }, passphrase)
      writeJson(res, 200, result)
    } catch (e) {
      writeJson(res, 400, { ok: false, error: { code: 'vault_export', message: String(e && e.message || e) } })
    }
  })

  // #353 & #396: Encrypted Vault export
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/vault/export',
    handler: handleVaultExport,
  }), 'dsh-subscriptions: /vault/export')

  const handleVaultImport = safeJsonHandler(async (req, res) => {
    if (req.method !== 'POST') {
      writeJson(res, 405, { ok: false, error: { code: 'method', message: 'POST only' } })
      return
    }
    if (!isTrustedSettingsRequest(req, ctx)) {
      writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
      return
    }
    let payload
    try { payload = JSON.parse((await readBody(req, 2 * 1024 * 1024)).toString('utf8') || '{}') } catch {
      writeJson(res, 400, { ok: false, error: { code: 'json', message: 'invalid json' } })
      return
    }
    const { passphrase, vault } = payload
    try {
      const result = importVault(vault, passphrase)
      const settings = getSettingsApi()
      const revision = revisionOf(settings)
      let parsed
      if (result.slots.length) {
        if (!settings) throw new Error('settings are unavailable for vault import')
        const curSlots = Array.isArray(live().slots) ? live().slots.slice() : []
        for (const s of result.slots) {
          const idx = curSlots.findIndex((c) => c.provider === s.provider && Number(c.index) === Number(s.index))
          if (idx >= 0) {
            curSlots[idx] = { ...curSlots[idx], ...s }
          } else {
            curSlots.push(s)
          }
        }
        parsed = plainConfig(Config({ ...live(), slots: stripLegacySlots(curSlots) }))
      }
      let blobCount = 0
      for (const [ref, blob] of Object.entries(result.blobs)) {
        await store.saveBlob(ref, validateCredentialBlob(blob))
        blobCount++
      }
      if (parsed) {
        await settings.replace(parsed, revision)
        syncCustomVendors()
      }
      await syncAdapter()
      refreshModels().catch(() => {})
      writeJson(res, 200, {
        ok: true,
        slotCount: result.slots.length,
        blobCount,
        exportedAt: result.exportedAt,
        accounts: await accountsView(),
      })
    } catch (e) {
      writeJson(res, 400, { ok: false, error: { code: 'vault_import', message: String(e && e.message || e) } })
    }
  })

  // #353 & #396: Encrypted Vault import
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/vault/import',
    handler: handleVaultImport,
  }), 'dsh-subscriptions: /vault/import')


  // #562: Remote Vault Sync Push
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/vault/sync/push',
    handler: safeJsonHandler(async (req, res) => {
      if (req.method !== 'POST') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'POST only' } })
        return
      }
      if (!isTrustedSettingsRequest(req, ctx)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
        return
      }
      try {
        const result = await syncVaultPush({ live: live(), store })
        writeJson(res, 200, { ok: true, result, status: getVaultSyncStatus() })
      } catch (e) {
        writeJson(res, 400, { ok: false, error: { code: 'vault_sync_push', message: String(e && e.message || e) } })
      }
    }),
  }), 'dsh-subscriptions: /vault/sync/push')

  // #562: Remote Vault Sync Pull
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/vault/sync/pull',
    handler: safeJsonHandler(async (req, res) => {
      if (req.method !== 'POST') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'POST only' } })
        return
      }
      if (!isTrustedSettingsRequest(req, ctx)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
        return
      }
      try {
        const result = await syncVaultPull({
          live: live(),
          store,
          settingsApi: getSettingsApi(),
          syncAdapter,
          refreshModels,
        })
        writeJson(res, 200, { ok: true, result, status: getVaultSyncStatus(), accounts: await accountsView() })
      } catch (e) {
        writeJson(res, 400, { ok: false, error: { code: 'vault_sync_pull', message: String(e && e.message || e) } })
      }
    }),
  }), 'dsh-subscriptions: /vault/sync/pull')

  // #562: Remote Vault Sync Status
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/vault/sync/status',
    handler: safeJsonHandler(async (req, res) => {
      if (req.method !== 'GET') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'GET only' } })
        return
      }
      if (!isTrustedSettingsRequest(req, ctx)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
        return
      }
      writeJson(res, 200, { ok: true, status: getVaultSyncStatus() })
    }),
  }), 'dsh-subscriptions: /vault/sync/status')
}
