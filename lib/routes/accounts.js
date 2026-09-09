import { normalizeSlots } from '../accounts.js'
import { Config, publicConfig } from '../config-schema.js'
import { decryptWithPassphrase, encryptWithPassphrase } from '../crypto.js'
import { isTrustedSettingsRequest, queryOf, readBody, safeJsonHandler, writeJson } from '../http.js'
import { discoverLocalCliSessions, loadLocalCliBlob } from '../import-auth.js'
import { isProvider, oauthRef } from '../refs.js'

export function registerAccountsRoutes(ctx, state) {
  const {
    live,
    accountsView,
    getSettingsApi,
    syncCustomVendors,
    syncAdapter,
    stripLegacySlots,
    store,
    refreshModels,
    refForSlot,
    resetCredits,
    subscriptions,
  } = state


  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/reset-credits',
    handler: safeJsonHandler(async (req, res) => {
      if (req.method !== 'GET') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'GET only' } })
        return
      }
      const q = queryOf(req)
      const provider = q.get('provider') || ''
      const index = Number(q.get('index') || '1')
      const ref = refForSlot(provider, index)
      if (!ref) { writeJson(res, 404, { ok: false, error: { code: 'slot', message: 'slot not found' } }); return }
      try {
        writeJson(res, 200, { ok: true, ...(await resetCredits.inspect(ref)) })
      } catch (e) {
        writeJson(res, 200, { ok: false, error: { code: 'reset', message: String(e && e.message || e) } })
      }
    }),
  }), 'dsh-subscriptions: /reset-credits')


  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/reset-credits/prepare',
    handler: safeJsonHandler(async (req, res) => {
      if (req.method !== 'POST') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'POST only' } })
        return
      }
      if (!isTrustedSettingsRequest(req)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
        return
      }
      let payload
      try { payload = JSON.parse((await readBody(req, 4096)).toString('utf8') || '{}') } catch {
        writeJson(res, 400, { ok: false, error: { code: 'json', message: 'invalid json' } })
        return
      }
      const ref = refForSlot(String(payload.provider || ''), Number(payload.index) || 1)
      if (!ref) { writeJson(res, 404, { ok: false, error: { code: 'slot', message: 'slot not found' } }); return }
      try {
        writeJson(res, 200, { ok: true, ...(await resetCredits.prepare(ref)) })
      } catch (e) {
        writeJson(res, 200, { ok: false, error: { code: 'reset', message: String(e && e.message || e) } })
      }
    }),
  }), 'dsh-subscriptions: /reset-credits/prepare')


  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/reset-credits/consume',
    handler: safeJsonHandler(async (req, res) => {
      if (req.method !== 'POST') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'POST only' } })
        return
      }
      if (!isTrustedSettingsRequest(req)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
        return
      }
      let payload
      try { payload = JSON.parse((await readBody(req, 4096)).toString('utf8') || '{}') } catch {
        writeJson(res, 400, { ok: false, error: { code: 'json', message: 'invalid json' } })
        return
      }
      try {
        const result = await resetCredits.consume({ challengeId: payload.challengeId, acknowledged: payload.acknowledged })
        writeJson(res, 200, { ok: true, result })
        refreshModels().catch(() => {})
      } catch (e) {
        writeJson(res, 200, { ok: false, error: { code: 'reset', message: String(e && e.message || e) } })
      }
    }),
  }), 'dsh-subscriptions: /reset-credits/consume')


  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/discover-local',
    handler: safeJsonHandler(async (req, res) => {
      if (req.method !== 'GET') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'GET only' } })
        return
      }
      try {
        const detected = await discoverLocalCliSessions()
        writeJson(res, 200, { ok: true, detected })
      } catch (e) {
        writeJson(res, 500, { ok: false, error: { message: String(e && e.message || e) } })
      }
    }),
  }), 'dsh-subscriptions: /discover-local')


  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/import-local',
    handler: safeJsonHandler(async (req, res) => {
      if (req.method !== 'POST') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'POST only' } })
        return
      }
      if (!isTrustedSettingsRequest(req)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
        return
      }
      let body
      try {
        body = JSON.parse((await readBody(req, 16 * 1024)).toString('utf8') || '{}')
      } catch {
        body = null
      }
      if (!body || !body.provider) {
        writeJson(res, 400, { ok: false, error: { code: 'bad_request', message: 'missing provider' } })
        return
      }
      try {
        const blob = await loadLocalCliBlob(body.provider)
        const prov = body.provider
        const idx = Number(body.index) || 1
        const curSlots = Array.isArray(live().slots) ? live().slots.slice() : []
        const exists = curSlots.some((s) => s && s.provider === prov && Number(s.index) === idx)
        if (!exists && getSettingsApi()) {
          const nextSlots = curSlots.concat([{
            provider: prov,
            index: idx,
            label: blob.email || '',
          }])
          const parsed = Config({ ...live(), slots: stripLegacySlots(nextSlots) })
          await getSettingsApi().replace(parsed)
          syncCustomVendors()
        }
        const slot = normalizeSlots(live().slots).find((s) => s.provider === prov && s.index === idx)
        const ref = slot ? slot.ref : `${prov.toUpperCase()}_OAUTH_${idx}`
        await store.saveBlob(ref, blob)
        await syncAdapter()
        refreshModels().catch(() => {})
        writeJson(res, 200, {
          ok: true,
          ref,
          provider: prov,
          email: blob.email || '',
          accounts: await accountsView(),
          config: publicConfig(live()),
        })
      } catch (e) {
        writeJson(res, 400, { ok: false, error: { message: String(e && e.message || e) } })
      }
    }),
  }), 'dsh-subscriptions: /import-local')


  // Export of the encrypted token bundle. Tokens are never logged.
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/export',
    handler: safeJsonHandler(async (req, res) => {
      if (req.method !== 'POST') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'POST only' } })
        return
      }
      if (!isTrustedSettingsRequest(req)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
        return
      }
      let payload
      try { payload = JSON.parse((await readBody(req, 8 * 1024)).toString('utf8') || '{}') } catch {
        writeJson(res, 400, { ok: false, error: { code: 'json', message: 'invalid json' } })
        return
      }
      const passphrase = payload.passphrase
      if (!passphrase || typeof passphrase !== 'string') {
        writeJson(res, 400, { ok: false, error: { code: 'passphrase', message: 'нужен passphrase' } })
        return
      }
      try {
        const accounts = []
        for (const slot of normalizeSlots(live().slots)) {
          try {
            const blob = await store.loadBlob(slot.ref)
            accounts.push({ ref: slot.ref, provider: slot.provider, index: slot.index, label: slot.label || blob.label || '', blob })
          } catch { /* skip missing */ }
        }
        if (!accounts.length) {
          writeJson(res, 200, { ok: false, error: { code: 'empty', message: 'нет подключённых аккаунтов' } })
          return
        }
        const bundle = JSON.stringify({ v: 1, exportedAt: Date.now(), accounts })
        const encrypted = encryptWithPassphrase(bundle, passphrase)
        writeJson(res, 200, { ok: true, payload: encrypted, count: accounts.length })
      } catch (e) {
        writeJson(res, 500, { ok: false, error: { code: 'export', message: String(e && e.message || e) } })
      }
    }),
  }), 'dsh-subscriptions: /export')


  // Import of the encrypted bundle.
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/import',
    handler: safeJsonHandler(async (req, res) => {
      if (req.method !== 'POST') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'POST only' } })
        return
      }
      if (!isTrustedSettingsRequest(req)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
        return
      }
      let payload
      try { payload = JSON.parse((await readBody(req, 1024 * 1024)).toString('utf8') || '{}') } catch {
        writeJson(res, 400, { ok: false, error: { code: 'json', message: 'invalid json' } })
        return
      }
      const { passphrase, payload: encrypted } = payload
      if (!passphrase || !encrypted) {
        writeJson(res, 400, { ok: false, error: { code: 'params', message: 'нужны passphrase и payload' } })
        return
      }
      let bundle
      try {
        bundle = JSON.parse(decryptWithPassphrase(encrypted, passphrase))
      } catch (e) {
        writeJson(res, 400, { ok: false, error: { code: 'decrypt', message: 'неверный passphrase или повреждённый бандл' } })
        return
      }
      if (!bundle || !Array.isArray(bundle.accounts)) {
        writeJson(res, 400, { ok: false, error: { code: 'format', message: 'неверный формат бандла' } })
        return
      }
      let imported = 0
      for (const row of bundle.accounts) {
        try {
          await store.saveBlob(row.ref, row.blob)
          imported++
        } catch { /* skip broken */ }
      }
      await syncAdapter()
      writeJson(res, 200, { ok: true, imported, total: bundle.accounts.length, accounts: await accountsView() })
    }),
  }), 'dsh-subscriptions: /import')


  // #45: import an existing refresh token / API key without an OAuth flow.
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/import-token',
    handler: safeJsonHandler(async (req, res) => {
      if (req.method !== 'POST') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'POST only' } })
        return
      }
      if (!isTrustedSettingsRequest(req)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
        return
      }
      let payload
      try { payload = JSON.parse((await readBody(req, 64 * 1024)).toString('utf8') || '{}') } catch {
        writeJson(res, 400, { ok: false, error: { code: 'json', message: 'invalid json' } })
        return
      }
      const provider = payload.provider
      const index = Number(payload.index || '1')
      const refreshToken = payload.refreshToken
      const apiKey = payload.apiKey
      if (!isProvider(provider)) {
        writeJson(res, 400, { ok: false, error: { code: 'provider', message: 'unknown provider' } })
        return
      }
      if (!refreshToken && !apiKey) {
        writeJson(res, 400, { ok: false, error: { code: 'token', message: 'нужен refreshToken или apiKey' } })
        return
      }
      try {
        const ref = oauthRef(provider, index)
        const blob = { accessToken: apiKey || refreshToken, refreshToken: refreshToken || apiKey }
        if (apiKey) { blob.apiKey = apiKey; blob.apiKeyOnly = true }
        await store.saveBlob(ref, blob)
        await syncAdapter()
        refreshModels().catch(() => {})
        writeJson(res, 200, { ok: true, ref, accounts: await accountsView() })
      } catch (e) {
        writeJson(res, 400, { ok: false, error: { code: 'import', message: String(e && e.message || e) } })
      }
    }),
  }), 'dsh-subscriptions: /import-token')


  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/logout',
    handler: safeJsonHandler(async (req, res) => {
      if (req.method !== 'POST') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'POST only' } })
        return
      }
      if (!isTrustedSettingsRequest(req)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
        return
      }
      let payload
      try { payload = JSON.parse((await readBody(req, 8 * 1024)).toString('utf8') || '{}') } catch {
        writeJson(res, 400, { ok: false, error: { code: 'json', message: 'invalid json' } })
        return
      }
      try {
        const ref = oauthRef(payload.provider, payload.index)
        await store.clearRef(ref)
        await syncAdapter()
        refreshModels().catch(() => {})
        writeJson(res, 200, { ok: true, ref, accounts: await accountsView() })
      } catch (e) {
        writeJson(res, 400, { ok: false, error: { code: 'logout', message: String(e && e.message || e) } })
      }
    }),
  }), 'dsh-subscriptions: /logout')
}
