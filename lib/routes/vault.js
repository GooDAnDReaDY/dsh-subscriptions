import { Config, plainConfig, revisionOf } from '../config-schema.js'
import { isTrustedSettingsRequest, readBody, safeJsonHandler, writeJson } from '../http.js'
import { capturePrePullSnapshot, collectVaultBlobs, restoreSnapshotWithConfig, resolveVaultKey } from '../vault-sync.js'
import { defaultSnapshotStore } from '../vault-snapshots.js'
import { validateCredentialBlob } from '../blob.js'

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
