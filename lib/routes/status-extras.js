import { diagnoseVendorError } from '../doctor.js'
import { INSTRUCTIONS } from '../instructions.js'
import {
  getModelReasoningCapabilities,
  setSessionReasoning,
  getSessionReasoning,
  clearSessionReasoning,
  DEFAULT_VENDOR_EFFORTS,
  validateReasoningEffort,
} from '../reasoning-effort.js'
import { defaultConcurrencyQueue } from '../concurrency-queue.js'
import { calculateAnalytics } from '../analytics.js'
import { setSpeedMode, getSpeedMode, clearSpeedMode } from '../speed-mode.js'
import { runDiagnosticWizard } from '../diagnostic-wizard.js'
import { getRecentAlerts } from '../alerts.js'
import { vendorConfig } from '../accounts.js'
import { isTrustedSettingsRequest, queryOf, readBody, safeJsonHandler, writeJson, vendorFetch } from '../http.js'
import { quotaSnapshot } from '../ratelimit.js'
import { isProvider, oauthRef } from '../refs.js'
import { getVendor } from '../vendors/index.js'

export function registerStatusExtraRoutes(ctx, state) {
  const {
    live,
    store,
    history,
    fetchForRef,
    accountsView,
    pmL = (s) => s,
    pmE = (s) => s,
  } = state

  // Live smoke ping test for active subscription providers
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/smoke',
    handler: safeJsonHandler(async (req, res) => {
      if (req.method !== 'POST') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'POST only' } })
        return
      }
      if (!isTrustedSettingsRequest(req, ctx)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
        return
      }
      let payload = {}
      try { payload = JSON.parse((await readBody(req, 64 * 1024)).toString('utf8') || '{}') } catch { /* ignore status inspection error */ }

      let provider = payload.provider
      let index = payload.index || 1

      if (!provider) {
        const accounts = await accountsView()
        const connected = accounts.find((a) => a.configured)
        if (connected) {
          provider = connected.provider
          index = connected.index || 1
        }
      }

      if (!provider || !isProvider(provider)) {
        writeJson(res, 400, { ok: false, error: { code: 'no_connected_accounts', message: 'No connected subscription account found to test' } })
        return
      }

      const ref = oauthRef(provider, index)
      const info = await store.describeRef(ref)
      if (!info.configured) {
        writeJson(res, 400, { ok: false, provider, index, ref, error: { code: 'not_connected', message: 'Account is not connected' } })
        return
      }

      const t0 = Date.now()
      let blob
      try {
        blob = await store.loadBlob(ref)
        blob = await store.ensureFresh(provider, blob, ref)
      } catch (e) {
        const latencyMs = Math.max(1, Date.now() - t0)
        const latencyGrade = latencyMs < 250 ? 'good' : (latencyMs < 750 ? 'fair' : 'poor')
        if (typeof store.rememberPing === "function") store.rememberPing(ref, { latencyMs, latencyGrade })
        const docVerdict = diagnoseVendorError(e, provider, blob)
        if (typeof store.rememberDoctorVerdict === "function") store.rememberDoctorVerdict(ref, docVerdict)
        history.add({ provider, ref, path: "/smoke", status: 401, ms: latencyMs })
        writeJson(res, 502, { ok: false, provider, index, ref, latencyMs, latencyGrade, doctor: docVerdict, error: { code: 'auth_failed', message: String(e && e.message || e) } })
        return
      }

      const vendor = getVendor(provider)
      if (typeof vendor.check === 'function') {
        let capturedQuota = null
        const probeFetch = async (url, init = {}) => {
          const doFetch = (typeof fetchForRef === "function" && fetchForRef(ref)) || fetch
          const res2 = await vendorFetch(doFetch, 15_000)(url, init)
          try {
            const snap = quotaSnapshot(provider, res2.headers, null, Date.now())
            if (snap) { capturedQuota = snap; store.rememberQuota(ref, snap) }
          } catch { /* ignore status inspection error */ }
          return res2
        }
        try {
          await vendor.check(blob, vendorConfig(provider, live()), probeFetch)
          const latencyMs = Math.max(1, Date.now() - t0)
          const latencyGrade = latencyMs < 250 ? 'good' : (latencyMs < 750 ? 'fair' : 'poor')
          if (typeof store.rememberPing === "function") store.rememberPing(ref, { latencyMs, latencyGrade })
          if (typeof store.rememberDoctorVerdict === "function") store.rememberDoctorVerdict(ref, null)
          history.add({ provider, ref, path: "/smoke", status: 200, ms: latencyMs })
          writeJson(res, 200, {
            ok: true,
            provider,
            index,
            ref,
            latencyMs,
            latencyGrade,
            label: pmL(blob.label),
            email: pmE(blob.email),
            quota: capturedQuota || info.quota || null,
            usagePercent: info.usagePercent ?? null,
          })
          return
        } catch (e) {
          const latencyMs = Math.max(1, Date.now() - t0)
          const latencyGrade = latencyMs < 250 ? 'good' : (latencyMs < 750 ? 'fair' : 'poor')
          if (typeof store.rememberPing === "function") store.rememberPing(ref, { latencyMs, latencyGrade })
          const docVerdict = diagnoseVendorError(e, provider, blob)
          if (typeof store.rememberDoctorVerdict === "function") store.rememberDoctorVerdict(ref, docVerdict)
          history.add({ provider, ref, path: "/smoke", status: 502, ms: latencyMs })
          writeJson(res, 502, {
            ok: false,
            provider,
            index,
            ref,
            latencyMs,
            latencyGrade,
            doctor: docVerdict,
            error: { code: e && e.code ? e.code : 'VENDOR', message: String(e && e.message || e).slice(0, 300) },
          })
          return
        }
      }

      const latencyMs = Math.max(1, Date.now() - t0)
      const latencyGrade = latencyMs < 250 ? 'good' : (latencyMs < 750 ? 'fair' : 'poor')
      if (typeof store.rememberPing === "function") store.rememberPing(ref, { latencyMs, latencyGrade })
      if (typeof store.rememberDoctorVerdict === "function") store.rememberDoctorVerdict(ref, null)
      history.add({ provider, ref, path: "/smoke", status: 200, ms: latencyMs })
      writeJson(res, 200, {
        ok: true,
        provider,
        index,
        ref,
        latencyMs,
        latencyGrade,
        label: pmL(blob.label),
        email: pmE(blob.email),
        quota: info.quota || null,
      })
    }),
  }), 'dsh-subscriptions: /smoke')

  // Issue #542: Latency RTT ping test endpoint
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/ping',
    handler: safeJsonHandler(async (req, res) => {
      if (req.method !== 'POST') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'POST only' } })
        return
      }
      if (!isTrustedSettingsRequest(req, ctx)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
        return
      }
      let payload = {}
      try { payload = JSON.parse((await readBody(req, 64 * 1024)).toString('utf8') || '{}') } catch { /* ignore ping payload */ }
      const provider = payload.provider
      const index = payload.index || 1
      if (!provider || !isProvider(provider)) {
        writeJson(res, 400, { ok: false, error: { code: 'invalid_provider', message: 'Provider required' } })
        return
      }
      const ref = oauthRef(provider, index)
      const info = await store.describeRef(ref)
      if (!info.configured) {
        writeJson(res, 400, { ok: false, error: { code: 'not_configured', message: 'Account is not configured' } })
        return
      }
      const t0 = Date.now()
      let latencyMs = 0
      let latencyGrade = 'good'
      try {
        const blob = await store.loadBlob(ref)
        const vendor = getVendor(provider)
        const cfg = vendorConfig(provider, live())
        const doFetch = (typeof fetchForRef === 'function' && fetchForRef(ref)) || fetch
        if (typeof vendor.check === 'function') {
          await vendor.check(blob, cfg, doFetch)
        } else if (typeof vendor.listModels === 'function') {
          await vendor.listModels(blob, cfg, doFetch)
        }
        latencyMs = Math.max(1, Date.now() - t0)
        latencyGrade = latencyMs < 250 ? 'good' : (latencyMs < 750 ? 'fair' : 'poor')
        if (typeof store.rememberPing === 'function') store.rememberPing(ref, { latencyMs, latencyGrade })
        if (typeof store.rememberDoctorVerdict === 'function') store.rememberDoctorVerdict(ref, null)
        writeJson(res, 200, { ok: true, provider, index, ref, latencyMs, latencyGrade })
      } catch (err) {
        latencyMs = Math.max(1, Date.now() - t0)
        latencyGrade = 'poor'
        const doc = diagnoseVendorError(err, provider)
        if (typeof store.rememberPing === 'function') store.rememberPing(ref, { latencyMs, latencyGrade })
        if (typeof store.rememberDoctorVerdict === 'function') store.rememberDoctorVerdict(ref, doc)
        writeJson(res, 502, { ok: false, provider, index, ref, latencyMs, latencyGrade, doctor: doc, error: { message: String(err && err.message || err) } })
      }
    }),
  }), 'dsh-subscriptions: /ping')

  // Issue #540: Dynamic vendor instructions API
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/instructions',
    handler: safeJsonHandler(async (req, res) => {
      if (req.method !== 'GET') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'GET only' } })
        return
      }
      if (!isTrustedSettingsRequest(req, ctx)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
        return
      }
      writeJson(res, 200, { ok: true, instructions: INSTRUCTIONS })
    }),
  }), 'dsh-subscriptions: /instructions')


  // #351: Quota and session alerts API
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/alerts',
    handler: safeJsonHandler(async (req, res) => {
      if (req.method !== 'GET') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'GET only' } })
        return
      }
      if (!isTrustedSettingsRequest(req, ctx)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
        return
      }
      const limit = Math.max(1, Math.min(Number(queryOf(req).get('limit') || '50'), 100))
      writeJson(res, 200, { ok: true, alerts: getRecentAlerts(limit) })
    }),
  }), 'dsh-subscriptions: /alerts')


  // #511: Detailed cache and subscription analytics endpoint
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/analytics',
    handler: safeJsonHandler(async (req, res) => {
      if (req.method !== 'GET') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'GET only' } })
        return
      }
      if (!isTrustedSettingsRequest(req, ctx)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
        return
      }
      const accounts = await accountsView()
      const analytics = typeof history.getAnalytics === 'function'
        ? history.getAnalytics(accounts)
        : calculateAnalytics(history.all(), accounts)
      writeJson(res, 200, { ok: true, analytics })
    }),
  }), 'dsh-subscriptions: /analytics')

  // #518: Concurrency and request queue status
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/queue',
    handler: safeJsonHandler(async (req, res) => {
      if (req.method !== 'GET') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'GET only' } })
        return
      }
      if (!isTrustedSettingsRequest(req, ctx)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
        return
      }
      const queueStats = defaultConcurrencyQueue.stats()
      writeJson(res, 200, { ok: true, queue: queueStats })
    }),
  }), 'dsh-subscriptions: /queue')

  // #681: per-session Codex Speed/Fast toggle.
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/speed',
    handler: safeJsonHandler(async (req, res) => {
      if (!isTrustedSettingsRequest(req, ctx)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
        return
      }
      if (req.method === 'GET') {
        const sid = queryOf(req).get('sessionId') || 'default'
        writeJson(res, 200, { ok: true, sessionId: sid, mode: getSpeedMode(sid) || 'standard' })
        return
      }
      if (req.method !== 'POST') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'GET or POST only' } })
        return
      }
      let body = {}
      try { body = JSON.parse((await readBody(req, 16 * 1024)).toString('utf8') || '{}') } catch {
        writeJson(res, 400, { ok: false, error: { code: 'json', message: 'invalid json' } })
        return
      }
      const sid = String(body.sessionId || 'default').slice(0, 200)
      const mode = String(body.mode || '').toLowerCase()
      if (mode !== 'fast' && mode !== 'standard' && mode !== 'off') {
        writeJson(res, 400, { ok: false, error: { code: 'mode', message: 'mode must be fast or standard' } })
        return
      }
      if (mode === 'fast') setSpeedMode(sid, 'fast')
      else clearSpeedMode(sid)
      writeJson(res, 200, { ok: true, sessionId: sid, mode: mode === 'fast' ? 'fast' : 'standard' })
    }),
  }), 'dsh-subscriptions: /speed')

  // #519: Interactive Diagnostic Wizard for accounts and connectivity
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/diagnostic-wizard',
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
      try { body = JSON.parse((await readBody(req, 64 * 1024)).toString('utf8') || '{}') } catch { /* ignore */ }
      const accounts = await accountsView()
      const targetAccount = accounts.find((a) => {
        if (body.ref && (a.ref === body.ref || a.id === body.ref)) return true
        if (body.provider && body.index !== undefined && a.provider === body.provider && a.index === Number(body.index)) return true
        return false
      }) || (body.provider ? { provider: body.provider, index: Number(body.index) || 1 } : (accounts[0] || {}))

      const report = await runDiagnosticWizard({
        account: targetAccount,
        store,
        live,
        includeNetwork: Boolean(body.includeNetwork),
        fetchImpl: fetch,
      })
      writeJson(res, 200, { ok: true, report })
    }),
  }), 'dsh-subscriptions: /diagnostic-wizard')

  // #505: Session-scoped reasoning effort management
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/session-reasoning',
    handler: safeJsonHandler(async (req, res) => {
      if (!isTrustedSettingsRequest(req, ctx)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
        return
      }

      const q = queryOf(req)
      if (req.method === 'GET') {
        const sessionId = q.get('sessionId') || ''
        const provider = q.get('provider') || ''
        const model = q.get('model') || ''
        const current = sessionId ? getSessionReasoning(sessionId) : null
        const caps = model ? getModelReasoningCapabilities(provider, model) : { supported: false, levels: [] }
        writeJson(res, 200, {
          ok: true,
          sessionId: sessionId || null,
          effort: (current && current.effort) || (caps.supported ? caps.defaultEffort : null),
          budgetTokens: (current && current.budgetTokens) || null,
          capabilities: caps,
          defaults: DEFAULT_VENDOR_EFFORTS,
  validateReasoningEffort,
        })
        return
      }

      if (req.method === 'POST') {
        let body = {}
        try { body = JSON.parse((await readBody(req, 64 * 1024)).toString('utf8') || '{}') } catch { /* ignore */ }
        const { sessionId, provider, model, effort, budgetTokens } = body
        if (!sessionId) {
          writeJson(res, 400, { ok: false, error: { code: 'bad_request', message: 'sessionId is required' } })
          return
        }
        const val = validateReasoningEffort(provider, model, effort)
        if (!val.valid) {
          writeJson(res, 400, { ok: false, error: { code: val.reason || 'invalid_effort', message: 'invalid reasoning effort for model' } })
          return
        }
        const result = setSessionReasoning(sessionId, { provider, model, effort, budgetTokens })
        if (!result.ok) {
          writeJson(res, 400, { ok: false, error: { code: result.error || 'validation_failed', message: 'invalid reasoning effort for model' } })
          return
        }
        writeJson(res, 200, { ok: true, sessionId, effort: effort || 'off', model: model || null })
        return
      }

      if (req.method === 'DELETE') {
        let body = {}
        try { body = JSON.parse((await readBody(req, 64 * 1024)).toString('utf8') || '{}') } catch { /* ignore */ }
        const sessionId = q.get('sessionId') || body.sessionId
        if (!sessionId) {
          writeJson(res, 400, { ok: false, error: { code: 'bad_request', message: 'sessionId is required' } })
          return
        }
        const cleared = clearSessionReasoning(sessionId)
        writeJson(res, 200, { ok: true, sessionId, cleared })
        return
      }

      writeJson(res, 405, { ok: false, error: { code: 'method', message: 'GET, POST, DELETE only' } })
    }),
  }), 'dsh-subscriptions: /session-reasoning')
}

