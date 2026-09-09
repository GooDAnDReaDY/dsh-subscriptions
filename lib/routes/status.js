import { normalizeSlots, vendorConfig } from '../accounts.js'
import { Config, publicConfig } from '../config-schema.js'
import { isTrustedSettingsRequest, queryOf, readBody, safeJsonHandler, writeJson } from '../http.js'
import { quotaSnapshot } from '../ratelimit.js'
import { PROVIDERS, displayName, droppedCredentialRefs, isProvider, oauthRef } from '../refs.js'
import { getVendor } from '../vendors/index.js'

export function registerStatusRoutes(ctx, state) {
  const {
    accountsView,
    live,
    getSettingsApi,
    syncCustomVendors,
    syncAdapter,
    stripLegacySlots,
    store,
    history,
    diagnosticsReport,
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
    handler: safeJsonHandler(async (req, res) => {
      if (req.method !== 'GET') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'GET only' } })
        return
      }
      const logged = await store.loggedInProviders()
      // #66/#67: usagePercent (max across accounts) and expiresAt for the chip.
      const usage = {}
      const expires = {}
      const labels = {}
      for (const slot of normalizeSlots(live().slots)) {
        try {
          const info = await store.describeRef(slot.ref)
          if (info.usagePercent != null) {
            usage[slot.provider] = Math.max(usage[slot.provider] || 0, info.usagePercent)
          }
          // #67: subscription expiry date comes from the slot (entered in settings).
          if (slot.expiresAt) {
            expires[slot.provider] = Math.max(expires[slot.provider] || 0, slot.expiresAt)
            labels[slot.provider] = pmL(slot.label || info.label || slot.provider)
          }
        } catch {}
      }
      // #69/#72: active subscription = last successful request (newest first).
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
    }),
  }), 'dsh-subscriptions: /status')


  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/diagnostics',
    handler: safeJsonHandler(async (req, res) => {
      if (req.method !== 'GET') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'GET only' } })
        return
      }
      writeJson(res, 200, { ok: true, report: await diagnosticsReport() })
    }),
  }), 'dsh-subscriptions: /diagnostics')


  // ponytail: cheap per-vendor probe; never sets cooldown, never returns tokens
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/check',
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
    }),
  }), 'dsh-subscriptions: /check')


  // #50: summary page /subscriptions (localhost-only).
  // #65: request and cost history (JSON).
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
}
