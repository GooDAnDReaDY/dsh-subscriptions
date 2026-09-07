import { PROVIDERS, parseOauthRef, displayName, droppedCredentialRefs, oauthRef, isProvider } from './refs.js'
import { writeJson, writeHtml, readBody, isTrustedSettingsRequest, queryOf } from './http.js'
import { parseCallbackInput, requestOrigin, webCallbackUri } from './oauth.js'
import { createPkce } from './pkce.js'
import { startLoopback } from './loopback.js'
import { maskEmail, maskLabel, maskText } from './mask.js'
import { parseBlob } from './blob.js'
import { encryptWithPassphrase, decryptWithPassphrase } from './crypto.js'
import { analyzeSessionEvents } from './analyze-session.js'
import { discoverLocalCliSessions, loadLocalCliBlob } from './import-auth.js'
import { proxyFetch } from './proxy.js'
import { Config, publicConfig } from './config-schema.js'
import { quotaSnapshot } from './ratelimit.js'
import { getVendor } from './vendors/index.js'
import { vendorConfig, normalizeSlots } from './accounts.js'

export function registerRoutes(ctx, state) {
  const {
    NS,
    live,
    accountsView,
    getSettingsApi,
    syncCustomVendors,
    syncAdapter,
    stripLegacySlots,
    store,
    PENDING_TTL_MS,
    redirectFor,
    OK_HTML,
    refreshModels,
    history,
    refForSlot,
    resetCredits,
    diagnosticsReport,
    pending,
    completeOAuth,
    fetchForRef,
    sweepPending,
    subscriptions,
    pmL,
    pmE,
  } = state

  async function configResponse() {
    return {
      ok: true,
      config: publicConfig(live()),
      accounts: await accountsView(),
      providers: PROVIDERS.map((id) => ({ id, name: displayName(id) })),
    }
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/config',
    handler: async (req, res) => {
      if (req.method === 'GET') {
        writeJson(res, 200, await configResponse())
        return
      }
      if (req.method !== 'PUT') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'GET or PUT' } })
        return
      }
      if (!isTrustedSettingsRequest(req)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'settings writes are same-origin only' } })
        return
      }
      if (!getSettingsApi()) {
        writeJson(res, 503, { ok: false, error: { code: 'settings', message: 'settings not ready' } })
        return
      }
      let payload
      try { payload = JSON.parse((await readBody(req, 256 * 1024)).toString('utf8') || '{}') } catch {
        writeJson(res, 400, { ok: false, error: { code: 'json', message: 'invalid json' } })
        return
      }
      if (payload && typeof payload.config === 'object') payload = payload.config
      try {
        if (Array.isArray(payload.slots)) payload.slots = stripLegacySlots(payload.slots)
        const parsed = Config(payload)
        const dropped = droppedCredentialRefs(live().slots, parsed.slots)
        await getSettingsApi().replace(parsed)
        syncCustomVendors()
        for (const ref of dropped) await store.clearRef(ref)
        await syncAdapter()
        writeJson(res, 200, await configResponse())
      } catch (e) {
        writeJson(res, 400, { ok: false, error: { code: 'save', message: String(e && e.message || e) } })
      }
    },

  

  }), 'dsh-subscriptions: /config')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/status',
    handler: async (req, res) => {
      if (req.method !== 'GET') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'GET only' } })
        return
      }
      const logged = await store.loggedInProviders()
      // #66/#67: usagePercent (максимум по аккаунтам) и expiresAt для чипа.
      const usage = {}
      const expires = {}
      const labels = {}
      for (const slot of normalizeSlots(live().slots)) {
        try {
          const info = await store.describeRef(slot.ref)
          if (info.usagePercent != null) {
            usage[slot.provider] = Math.max(usage[slot.provider] || 0, info.usagePercent)
          }
          // #67: дата окончания подписки берётся из слота (вводится в настройках).
          if (slot.expiresAt) {
            expires[slot.provider] = Math.max(expires[slot.provider] || 0, slot.expiresAt)
            labels[slot.provider] = pmL(slot.label || info.label || slot.provider)
          }
        } catch {}
      }
      // #69/#72: активная подписка = последний успешный запрос (новые сверху).
      let active = null
      const last = history.recent(1)
      if (last.length) {
        const lastRow = last[0]
        const accts = await store.listAccounts(lastRow.provider)
        const acct = accts.find((a) => a.ref === lastRow.ref) || accts[0]
        let plan = ''
        let index = acct && acct.ref ? Number(String(acct.ref).split('_').pop()) || null : null
        let status = 'ok'
        let windows = []
        try {
          const info = await store.describeRef(lastRow.ref)
          plan = info.paidTierName || ''
          if (info.validationUrl) status = 'verify'
          else if (info.cooldownUntil && info.cooldownUntil > Date.now()) status = 'cooldown'
          if (Array.isArray(info.usage)) {
            windows = info.usage
              .filter((w) => w && typeof w.usedPercent === 'number')
              .map((w) => ({ id: w.id || w.en || w.ru, label: w.en || w.ru || w.id, usedPercent: w.usedPercent }))
          }
        } catch {}
        active = {
          provider: lastRow.provider,
          index,
          model: lastRow.model || null,
          path: lastRow.path || null,
          plan,
          windows,
          usagePercent: usage[lastRow.provider] != null ? usage[lastRow.provider] : null,
          status,
          at: lastRow.ts,
        }
      }
      writeJson(res, 200, {
        ok: true,
        loggedIn: Object.fromEntries(PROVIDERS.map((id) => [id, logged.includes(id)])),
        usagePercent: usage,
        expiresAt: expires,
        labels,
        expiryNotifyDays: live().expiryNotifyDays,
        fastMode: !!live().codexFastMode,
        composerQuota: String(live().composerQuota || 'off'),
        active,
      })
    },
  }), 'dsh-subscriptions: /status')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/reset-credits',
    handler: async (req, res) => {
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
    },
  }), 'dsh-subscriptions: /reset-credits')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/reset-credits/prepare',
    handler: async (req, res) => {
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
    },
  }), 'dsh-subscriptions: /reset-credits/prepare')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/reset-credits/consume',
    handler: async (req, res) => {
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
    },
  }), 'dsh-subscriptions: /reset-credits/consume')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/diagnostics',
    handler: async (req, res) => {
      if (req.method !== 'GET') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'GET only' } })
        return
      }
      writeJson(res, 200, { ok: true, report: await diagnosticsReport() })
    },
  }), 'dsh-subscriptions: /diagnostics')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/oauth/start',
    handler: async (req, res) => {
      if (req.method !== 'GET') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'GET only' } })
        return
      }
      const q = queryOf(req)
      const provider = q.get('provider') || ''
      const index = Number(q.get('index') || '1')
      if (!isProvider(provider)) {
        writeJson(res, 400, { ok: false, error: { code: 'provider', message: 'unknown provider' } })
        return
      }
      const origin = requestOrigin(req)
      const redirectUri = redirectFor(provider, live(), origin)
      const pkce = await createPkce()
      pending.set(pkce.state, {
        provider,
        index,
        verifier: pkce.verifier,
        challenge: pkce.challenge,
        state: pkce.state,
        redirectUri,
        createdAt: Date.now(),
      })
      const cfg = { ...vendorConfig(provider, live()), redirectUri }
      const url = getVendor(provider).authorizeUrl(cfg, pkce)
      // #89: если redirect_uri loopback — поднять временный сервер перехвата.
      let autoCatch = false
      if (live().autoLoopback) {
        try {
          const cb = new URL(redirectUri)
          if (cb.hostname === 'localhost' || cb.hostname === '127.0.0.1') {
            autoCatch = true
            startLoopback({
              redirectUri,
              onCode: async (params) => {
                const code = params.get('code') || ''
                const state = params.get('state') || ''
                if (!code) throw new Error('no code')
                await completeOAuth({ provider, index, code, state })
                return OK_HTML
              },
            }).catch(() => {})
          }
        } catch { autoCatch = false }
      }
      writeJson(res, 200, { ok: true, url, state: pkce.state, redirectUri, autoCatch })
    },
  }), 'dsh-subscriptions: /oauth/start')

  // #90: Device-code login (headless/VPS). Codex-only: auth.openai.com mints an
  // authorization_code + code_verifier server-side; we finish with the normal
  // PKCE exchange using the device redirect URI. Device code stays server-side
  // in the pending map (same lifetime as PKCE pending rows).
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/oauth/device/start',
    handler: async (req, res) => {
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
        body = JSON.parse((await readBody(req, 16 * 1024)).toString('utf8'))
      } catch {
        writeJson(res, 400, { ok: false, error: { code: 'json', message: 'invalid json' } })
        return
      }
      const provider = String(body.provider || '')
      const index = Number(body.index || 1)
      if (!isProvider(provider)) {
        writeJson(res, 400, { ok: false, error: { code: 'provider', message: 'unknown provider' } })
        return
      }
      const vendor = getVendor(provider)
      if (typeof vendor.deviceStart !== 'function') {
        writeJson(res, 400, { ok: false, error: { code: 'device', message: 'device login not supported for ' + provider } })
        return
      }
      try {
        const cfg = vendorConfig(provider, live())
        const start = await vendor.deviceStart(cfg, (fetchForRef(oauthRef(provider, index)) || fetch))
        const state = 'dev-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10)
        sweepPending(Date.now())
        pending.set(state, {
          kind: 'device',
          provider,
          index,
          ref: oauthRef(provider, index),
          deviceAuthId: start.deviceAuthId,
          userCode: start.userCode,
          intervalMs: start.intervalMs,
          createdAt: Date.now(),
        })
        writeJson(res, 200, { ok: true, state, userCode: start.userCode, authUrl: start.authUrl, intervalMs: start.intervalMs })
      } catch (e) {
        writeJson(res, 502, { ok: false, error: { code: e && e.code || 'DEVICE', message: String(e && e.message || e).slice(0, 300) } })
      }
    },
  }), 'dsh-subscriptions: /oauth/device/start')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/oauth/device/poll',
    handler: async (req, res) => {
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
        body = JSON.parse((await readBody(req, 16 * 1024)).toString('utf8'))
      } catch {
        writeJson(res, 400, { ok: false, error: { code: 'json', message: 'invalid json' } })
        return
      }
      const state = String(body.state || '')
      sweepPending(Date.now())
      const row = pending.get(state)
      if (!row || row.kind !== 'device') {
        writeJson(res, 404, { ok: false, error: { code: 'expired', message: 'device login session expired; start again' } })
        return
      }
      const vendor = getVendor(row.provider)
      try {
        const cfg = vendorConfig(row.provider, live())
        const out = await vendor.devicePoll(cfg, { deviceAuthId: row.deviceAuthId, userCode: row.userCode }, (fetchForRef(row.ref) || fetch))
        if (out.status !== 'authorized') {
          writeJson(res, 200, { ok: true, status: out.status })
          return
        }
        const slots = normalizeSlots(live().slots)
        const slot = slots.find((s) => s.ref === row.ref)
        const blob = out.blob
        if (slot && slot.label) blob.label = slot.label
        await store.saveBlob(row.ref, blob)
        pending.delete(state)
        await syncAdapter()
        refreshModels().catch(() => {})
        writeJson(res, 200, { ok: true, status: 'authorized', ref: row.ref, label: pmL(blob.label || blob.email) || displayName(row.provider) })
      } catch (e) {
        writeJson(res, 502, { ok: false, error: { code: e && e.code || 'DEVICE', message: String(e && e.message || e).slice(0, 300) } })
      }
    },
  }), 'dsh-subscriptions: /oauth/device/poll')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/oauth/callback',
    handler: async (req, res) => {
      if (req.method !== 'GET') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'GET only' } })
        return
      }
      const q = queryOf(req)
      const code = q.get('code') || ''
      const state = q.get('state') || ''
      const row = pending.get(state)
      if (!code || !row) {
        writeHtml(res, 400, '<!doctype html><meta charset="utf-8"><title>Subscriptions</title><p>Login session missing. Return to Settings and paste the redirected URL.</p>')
        return
      }
      try {
        await completeOAuth({ provider: row.provider, index: row.index, code, state })
        writeHtml(res, 200, '<!doctype html><meta charset="utf-8"><title>Subscriptions</title><p>Signed in. You can close this tab and return to Settings.</p>')
      } catch (e) {
        writeHtml(res, 400, `<!doctype html><meta charset="utf-8"><title>Subscriptions</title><p>${escapeHtml(String(e && e.message || e))}</p>`)
      }
    },
  }), 'dsh-subscriptions: /oauth/callback')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/oauth/complete',
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'POST only' } })
        return
      }
      if (!isTrustedSettingsRequest(req)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
        return
      }
      let payload
      try { payload = JSON.parse((await readBody(req, 16 * 1024)).toString('utf8') || '{}') } catch {
        writeJson(res, 400, { ok: false, error: { code: 'json', message: 'invalid json' } })
        return
      }
      const parsed = parseCallbackInput(payload.url || payload.code || '')
      const provider = payload.provider
      const index = payload.index
      const code = parsed.code
      const state = parsed.state || payload.state || ''
      if (!code) {
        writeJson(res, 400, { ok: false, error: { code: 'code', message: 'paste the redirected URL or the code' } })
        return
      }
      try {
        const result = await completeOAuth({ provider, index, code, state })
        writeJson(res, 200, { ok: true, ...result, accounts: await accountsView() })
      } catch (e) {
        writeJson(res, 400, { ok: false, error: { code: 'oauth', message: String(e && e.message || e) } })
      }
    },
  }), 'dsh-subscriptions: /oauth/complete')

  // ponytail: cheap per-vendor probe; never sets cooldown, never returns tokens
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/check',
    handler: async (req, res) => {
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
      const provider = payload.provider
      if (!isProvider(provider)) {
        writeJson(res, 200, { ok: false, provider, error: { code: 'provider', message: 'unknown provider' } })
        return
      }
      const ref = oauthRef(provider, payload.index)
      const info = await store.describeRef(ref)
      if (!info.configured) {
        writeJson(res, 200, { ok: false, provider, index: payload.index, ref, error: { code: 'not_connected', message: 'not connected' } })
        return
      }
      let blob
      try { blob = await store.loadBlob(ref) } catch (e) {
        writeJson(res, 200, { ok: false, provider, index: payload.index, ref, error: { code: 'auth', message: String(e && e.message || e) } })
        return
      }
      try { blob = await store.ensureFresh(provider, blob, ref) } catch (e) {
        writeJson(res, 200, {
          ok: false, provider, index: payload.index, ref,
          email: pmE(blob.email), label: pmL(blob.label), expiresAt: blob.expiresAt || null,
          quota: info.quota || null,
          error: { code: 'refresh', message: String(e && e.message || e) },
        })
        return
      }
      const vendor = getVendor(provider)
      if (typeof vendor.check !== 'function') {
        writeJson(res, 200, { ok: true, provider, index: payload.index, ref, email: pmE(blob.email), label: pmL(blob.label), expiresAt: blob.expiresAt || null, quota: info.quota || null })
        return
      }
      let capturedQuota = null
      const probeFetch = async (url, init) => {
        const res2 = await fetch(url, init)
        try {
          const snap = quotaSnapshot(provider, res2.headers, null, Date.now())
          if (snap) { capturedQuota = snap; store.rememberQuota(ref, snap) }
        } catch {}
        return res2
      }
      try {
        await vendor.check(blob, vendorConfig(provider, live()), probeFetch)
        writeJson(res, 200, { ok: true, provider, index: payload.index, ref, email: pmE(blob.email), label: pmL(blob.label), expiresAt: blob.expiresAt || null, quota: capturedQuota || info.quota || null, usagePercent: info.usagePercent ?? null })
      } catch (e) {
        writeJson(res, 200, {
          ok: false, provider, index: payload.index, ref,
          email: pmE(blob.email), label: pmL(blob.label), expiresAt: blob.expiresAt || null,
          quota: capturedQuota || info.quota || null,
          error: { code: e && e.code ? e.code : 'VENDOR', message: String(e && e.message || e).slice(0, 300) },
        })
      }
    },
  }), 'dsh-subscriptions: /check')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/discover-local',
    handler: async (req, res) => {
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
    },
  }), 'dsh-subscriptions: /discover-local')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/import-local',
    handler: async (req, res) => {
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
    },
  }), 'dsh-subscriptions: /import-local')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/analyze-session',
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'POST only' } })
        return
      }
      try {
        const body = await readBody(req).catch(() => ({}))
        const events = Array.isArray(body && body.events) ? body.events : []
        const analysis = analyzeSessionEvents(events)
        writeJson(res, 200, { ok: true, analysis })
      } catch (e) {
        writeJson(res, 500, { ok: false, error: { message: String(e && e.message || e) } })
      }
    },
  }), 'dsh-subscriptions: /analyze-session')



  // HTTP-прокси к API провайдера через subscriptions.request.
  // Same-origin only, allowlist путей, ротация и квота как у моделей.
  // Токен наружу не отдаётся — наружу только ответ провайдера.
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/dsh-subscriptions/proxy',
    handler: async (req, res) => {
      if (req.method !== 'POST' && req.method !== 'GET') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'GET or POST' } })
        return
      }
      if (!isTrustedSettingsRequest(req)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
        return
      }
      const url = new URL(req.url || '/', 'http://localhost')
      const parts = url.pathname.replace(/^\/dsh-subscriptions\/proxy\//, '').split('/').filter(Boolean)
      const provider = parts[0]
      const restPath = '/' + parts.slice(1).join('/')
      if (!isProvider(provider)) {
        writeJson(res, 404, { ok: false, error: { code: 'provider', message: 'unknown provider' } })
        return
      }
      let body
      if (req.method === 'POST') {
        try {
          body = JSON.parse((await readBody(req, 1024 * 1024)).toString('utf8'))
        } catch {
          writeJson(res, 400, { ok: false, error: { code: 'json', message: 'invalid json' } })
          return
        }
      }
      try {
        const out = await subscriptions.request({
          provider,
          path: restPath,
          method: req.method === 'POST' ? 'POST' : 'GET',
          body,
          headers: {},
        })
        const text = await out.text()
        try {
          const json = JSON.parse(text)
          writeJson(res, out.status || 200, json)
        } catch {
          res.writeHead(out.status || 200, { 'Content-Type': 'application/json' })
          res.end(text)
        }
      } catch (e) {
        const status = e && e.status ? e.status : (e && e.code === 'FORBIDDEN' ? 403 : (e && e.code === 'AUTH' ? 401 : 502))
        writeJson(res, status, { ok: false, error: { code: e && e.code || 'VENDOR', message: String(e && e.message || e).slice(0, 300) } })
      }
    },
  }), 'dsh-subscriptions: proxy')

  // #88: проверка прокси аккаунта — реальный запрос к эндпоинту провайдера с замером задержки.
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/proxy-check',
    handler: async (req, res) => {
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
        body = JSON.parse((await readBody(req, 16 * 1024)).toString('utf8'))
      } catch {
        writeJson(res, 400, { ok: false, error: { code: 'json', message: 'invalid json' } })
        return
      }
      const provider = String(body.provider || '')
      const index = Number(body.index || 1)
      if (!isProvider(provider)) {
        writeJson(res, 400, { ok: false, error: { code: 'provider', message: 'unknown provider' } })
        return
      }
      const slots = normalizeSlots(live().slots)
      const slot = slots.find((s) => s.provider === provider && s.index === index)
      const proxyUrl = (slot && slot.proxyUrl) || ''
      const DEFAULT_BASE = {
        codex: 'https://chatgpt.com/backend-api/codex',
        claude: 'https://api.anthropic.com',
        grok: 'https://api.x.ai/v1',
        antigravity: 'https://cloudcode-pa.googleapis.com',
      }
      const base = String((vendorConfig(provider, live()) || {}).baseUrl || DEFAULT_BASE[provider] || '').replace(/\/$/, '')
      const started = Date.now()
      try {
        const impl = (proxyUrl && proxyFetch(proxyUrl)) || fetch
        if (proxyUrl && impl === fetch) throw new Error('invalid proxy URL')
        const out = await impl(base + '/models', {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(10000),
        })
        // Любой HTTP-ответ (включая 401/403) = прокси и эндпоинт доступны.
        writeJson(res, 200, { ok: true, status: out.status, latencyMs: Date.now() - started, viaProxy: !!proxyUrl })
      } catch (e) {
        writeJson(res, 200, {
          ok: false,
          latencyMs: Date.now() - started,
          viaProxy: !!proxyUrl,
          error: { code: (e && e.code) || 'NETWORK', message: String((e && e.message) || e).slice(0, 200) },
        })
      }
    },
  }), 'dsh-subscriptions: proxy-check')

  // Экспорт зашифрованного бандла токенов. Токены не логгируются.
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/export',
    handler: async (req, res) => {
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
    },
  }), 'dsh-subscriptions: /export')

  // Импорт зашифрованного бандла.
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/import',
    handler: async (req, res) => {
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
    },
  }), 'dsh-subscriptions: /import')

  // #45: импорт существующего refresh token / API key без OAuth-флоу.
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/import-token',
    handler: async (req, res) => {
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
    },
  }), 'dsh-subscriptions: /import-token')

  // #50: сводная страница /subscriptions (localhost-only).
  // #65: история запросов и стоимости (JSON).
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/history',
    handler: async (req, res) => {
      if (req.method !== 'GET') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'GET only' } })
        return
      }
      const host = (req.headers.host || '').split(':')[0]
      if (host !== 'localhost' && host !== '127.0.0.1') {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'localhost only' } })
        return
      }
      const limit = Math.min(Number(queryOf(req).get('limit') || '10'), 100)
      writeJson(res, 200, { ok: true, total: history.size(), items: history.recent(limit) })
    },
  }), 'dsh-subscriptions: /history')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/subscriptions',
    handler: async (req, res) => {
      if (req.method !== 'GET') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'GET only' } })
        return
      }
      const host = (req.headers.host || '').split(':')[0]
      if (host !== 'localhost' && host !== '127.0.0.1') {
        writeHtml(res, 403, '<!doctype html><meta charset="utf-8"><p>Subscriptions overview is localhost-only.</p>')
        return
      }
      let cfg, accounts
      try {
        const out = await configResponse()
        cfg = out.config
        accounts = out.accounts || []
      } catch (e) {
        writeHtml(res, 500, '<!doctype html><meta charset="utf-8"><p>Failed to load: ' + escapeHtml(String(e && e.message || e)) + '</p>')
        return
      }
      const rows = accounts.map((a) => {
        const pct = a.usagePercent != null ? a.usagePercent : (a.quota && a.quota.usedPercent) || null
        const rem = a.quota && a.quota.remaining != null ? a.quota.remaining : null
        const lim = a.quota && a.quota.limit != null ? a.quota.limit : null
        const reset = a.quota && a.quota.resetAt ? new Date(a.quota.resetAt).toLocaleString() : ''
        const status = a.validationUrl ? 'verify' : (a.cooldownUntil && a.cooldownUntil > Date.now() ? 'cooldown' : (a.configured ? 'ok' : 'none'))
        return '<tr><td>' + escapeHtml(a.provider) + '</td><td>' + (a.index||1) + '</td>' +
          '<td>' + escapeHtml(a.label || a.email || '') + '</td><td>' + status + '</td>' +
          '<td>' + (pct != null ? Math.round(pct) + '%' : '—') + '</td>' +
          '<td>' + (rem != null ? (rem + (lim != null ? '/' + lim : '')) : '—') + '</td>' +
          '<td>' + escapeHtml(reset) + '</td><td>' + escapeHtml(a.refreshError || '') + '</td></tr>'
      })
      const body = rows.length
        ? '<div class="grid">' + rows.join('') + '</div>'
        : '<p class="empty">No accounts connected yet.</p>'
      const slots = cfg.slots || []
      const connected = accounts.filter((a) => a.configured).length
      writeHtml(res, 200, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Subscriptions</title>
<style>
body{font-family:system-ui,sans-serif;margin:0;padding:24px;background:#0d1117;color:#e6edf3}
h1{font-size:20px} .dim{color:#8b949e;font-size:13px}
.stats{display:flex;gap:24px;margin:16px 0;font-size:13px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px}
.card{border:1px solid #30363d;border-radius:10px;padding:14px;background:#161b22}
.card b{display:block;margin-bottom:4px}
.status{font-size:11px;padding:2px 8px;border-radius:999px;border:1px solid #30363d}
.status.ok{color:#3fb950;border-color:#238636} .status.none{color:#8b949e}
.status.cooldown{color:#d29922;border-color:#9e6a03} .status.verify{color:#d29922;border-color:#9e6a03}
.meta{color:#8b949e;font-size:12px}
</style></head><body>
<h1>Subscriptions</h1>
<div class="dim">/subscriptions — localhost only</div>
<div class="stats"><span><b>${connected}</b> connected</span><span><b>${accounts.length}</b> accounts</span><span><b>${slots.length}</b> slots</span></div>
${body}
<h2>History</h2>
<div class="dim">last 10 · <a href="/dsh-subscriptions/history?limit=100">show 100</a></div>
<div class="hist" id="hist"></div>
<script>
fetch('/dsh-subscriptions/history?limit=10').then(r=>r.json()).then(d=>{
  const el=document.getElementById('hist')
  if(!d||!d.items||!d.items.length){el.textContent='No requests yet.';return}
  el.innerHTML='<table class="grid"><tr><th>time</th><th>provider</th><th>model</th><th>path</th><th>status</th></tr>'+
    d.items.map(i=>'<tr><td>'+new Date(i.ts).toLocaleString()+'</td><td>'+esc(i.provider)+'</td><td>'+esc(i.model||'')+'</td><td>'+esc(i.path)+'</td><td>'+i.status+'</td></tr>').join('')+'</table>'
}).catch(()=>{})
function esc(x){return String(x==null?'':x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
</script>
</body></html>`)
    },
  }), 'dsh-subscriptions: /subscriptions')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/logout',
    handler: async (req, res) => {
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
    },
  }), 'dsh-subscriptions: /logout')
}

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
