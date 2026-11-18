import { ignoreError } from '../catch-log.js'
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
import { calculateSavingsReport } from '../pricing.js'
import { normalizeSlots } from '../accounts-config.js'
import { vendorConfig } from '../accounts.js'
import { setSpeedMode, getSpeedMode, clearSpeedMode } from '../speed-mode.js'
import { REASON_MANUAL_PARK } from '../quarantine.js'
import { runDiagnosticWizard } from '../diagnostic-wizard.js'
import { getRecentAlerts } from '../alerts.js'
import { isTrustedSettingsRequest, queryOf, readBody, safeJsonHandler, writeJson, isTimeoutError, vendorFetch } from '../http.js'
import { forecastWindows } from '../quota-windows.js'
import { quotaSnapshot } from '../ratelimit.js'
import { buildPassport, renderPassportMarkdown, renderPassportHtml } from '../passport.js'
import { isProvider, oauthRef } from '../refs.js'
import { getVendor } from '../vendors/index.js'

export function registerStatusExtraRoutes(ctx, state) {
  const {
    live,
    store,
    history,
    accountsView,
    syncAdapter,
    fetchForRef,
    pmL = (s) => s,
    pmE = (s) => s,
  } = state

  // #1041: window-aligned quota forecast - "will this window survive to reset?"
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/quota-forecast',
    handler: safeJsonHandler(async (req, res) => {
      if (req.method !== 'GET') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'GET only' } })
        return
      }
      if (!isTrustedSettingsRequest(req, ctx)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
        return
      }
      const q = queryOf(req)
      const provider = q.get('provider') || ''
      const wantRef = q.get('ref') || ''
      const safetyFloor = Number(q.get('safetyFloor'))
      const slots = normalizeSlots(live().slots)
        .filter((slot) => (!provider || slot.provider === provider) && (!wantRef || slot.ref === wantRef))
      const accounts = []
      for (const slot of slots) {
        let quota = null
        try {
          quota = typeof store.getQuota === 'function' ? store.getQuota(slot.ref) : null
        } catch (err) { ignoreError('status-extras.js: quota snapshot read failed', err) }
        accounts.push({
          ref: slot.ref,
          provider: slot.provider,
          index: slot.index,
          windows: forecastWindows({ quota, safetyFloor: Number.isFinite(safetyFloor) ? safetyFloor : undefined }),
        })
      }
      writeJson(res, 200, { ok: true, generatedAt: Date.now(), accounts })
    }),
  }), 'dsh-subscriptions: /quota-forecast')

  // #1048: shareable subscriptions passport. Labels are masked through the
  // existing privacy helpers; tokens and proxy URLs never enter the report.
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/passport',
    handler: safeJsonHandler(async (req, res) => {
      if (req.method !== 'GET') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'GET only' } })
        return
      }
      if (!isTrustedSettingsRequest(req, ctx)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
        return
      }
      const format = String(queryOf(req).get('format') || 'md').toLowerCase()
      let rows = []
      try {
        rows = await accountsView()
      } catch (err) { ignoreError('status-extras.js: passport accounts read failed', err) }
      const report = buildPassport({
        rows: (Array.isArray(rows) ? rows : []).map((row) => ({
          provider: row.provider,
          label: pmL(row.label || row.email || ''),
          ref: row.ref,
          connected: Boolean(row.configured),
          usagePercent: row.usagePercent,
          resetAt: row.resetAt || (row.quota && row.quota.resetAt),
          cooldownUntil: row.cooldownUntil,
          monthlyCost: row.monthlyCost,
        })),
      })
      if (format === 'html') {
        res.setHeader('content-type', 'text/html; charset=utf-8')
        res.end(renderPassportHtml(report))
        return
      }
      res.setHeader('content-type', 'text/markdown; charset=utf-8')
      res.end(renderPassportMarkdown(report))
    }),
  }), 'dsh-subscriptions: /passport')

  // Live smoke ping test for active subscription providers
  // Issue #542: Latency RTT ping test endpoint
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

  // #1029: Subscriptions Savings & ROI Analytics endpoint
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/analytics/savings',
    handler: safeJsonHandler(async (req, res) => {
      if (req.method !== 'GET') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'GET only' } })
        return
      }
      if (!isTrustedSettingsRequest(req, ctx)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
        return
      }
      const slots = normalizeSlots(live().slots)
      const report = calculateSavingsReport(history.all(), slots)
      writeJson(res, 200, { ok: true, savings: report })
    }),
  }), 'dsh-subscriptions: /analytics/savings')

  // #1028: Routing Decision Trace endpoint
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/routing/trace',
    handler: safeJsonHandler(async (req, res) => {
      if (req.method !== 'GET') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'GET only' } })
        return
      }
      if (!isTrustedSettingsRequest(req, ctx)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
        return
      }
      const q = queryOf(req)
      const limit = Math.min(100, Math.max(1, parseInt(q.get('limit') || '25', 10) || 25))
      const allRows = history.all() || []
      const countsByReason = {}
      const decisions = []

      for (const row of allRows) {
        if (!row) continue
        const dt = row.decisionTrace
        const reason = (dt && dt.attempts && dt.attempts[0] && dt.attempts[0].decisionReason)
          || (row.reason)
          || (row.kind === 'smoke' ? 'health_check' : 'round_robin')
        countsByReason[reason] = (countsByReason[reason] || 0) + 1

        if (decisions.length < limit) {
          decisions.push({
            ts: row.ts || Date.now(),
            provider: row.provider || 'unknown',
            model: row.model || null,
            ref: (dt && dt.chosenRef) || row.ref || null,
            reason,
            status: row.status || 200,
            ms: row.ms || 0,
            cacheHit: Boolean(row.cacheReadTokens || (row.tokens && row.tokens.cacheRead)),
            finalOutcome: (dt && dt.finalOutcome) || (Number(row.status) < 400 ? 'success' : 'failed'),
          })
        }
      }

      writeJson(res, 200, {
        ok: true,
        trace: {
          totalTraced: allRows.length,
          countsByReason,
          recentDecisions: decisions,
        },
      })
    }),
  }), 'dsh-subscriptions: /routing/trace')

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
      const queueStats = (state.concurrencyQueue || defaultConcurrencyQueue).stats()
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
        writeJson(res, 200, {
          ok: true,
          sessionId: sid,
          mode: getSpeedMode(sid) || 'standard',
          showSpeedToggle: Boolean(live().showSpeedToggle),
        })
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
      try { body = JSON.parse((await readBody(req, 64 * 1024)).toString('utf8') || '{}') } catch (err) { ignoreError("status-extras.js: ignore", err) }
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
        })
        return
      }

      if (req.method === 'POST') {
        let body = {}
        try { body = JSON.parse((await readBody(req, 64 * 1024)).toString('utf8') || '{}') } catch (err) { ignoreError("status-extras.js: ignore", err) }
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
        try { body = JSON.parse((await readBody(req, 64 * 1024)).toString('utf8') || '{}') } catch (err) { ignoreError("status-extras.js: ignore", err) }
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
  // #1094: one probe, three modes. /check, /ping and /smoke were the same
  // operation — resolve a ref, refresh the blob, call the vendor's probe, time
  // it, remember the verdict — differing only in decoration and in whether they
  // release a cooldown. Those differences were not intentional: /check cleared
  // it, /ping did not, so the same account could stay parked after a successful
  // ping. One handler with a named mode removes the choice.
  //
  //   mode=check  probe one account, return quota and what was cleared
  //   mode=ping   the latency badge; remembers the ping, no state release
  //   mode=smoke  auto-picks a connected account, records history rows
  //
  // /check, /ping and /smoke remain registered as thin adapters so existing
  // callers and tests keep working; they forward here.
  const PROBE_MODES = new Set(['check', 'ping', 'smoke'])

  async function probeAccount(req, res, mode) {
    if (req.method !== 'POST') {
      writeJson(res, 405, { ok: false, error: { code: 'method', message: 'POST only' } })
      return
    }
    if (!isTrustedSettingsRequest(req, ctx)) {
      writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
      return
    }
    let payload = {}
    try {
      payload = JSON.parse((await readBody(req, 64 * 1024)).toString('utf8') || '{}')
    } catch {
      writeJson(res, 400, { ok: false, error: { code: 'json', message: 'invalid json' } })
      return
    }

    let provider = payload.provider || payload.vendor
    let index = payload.index || (payload.accountIndex != null ? payload.accountIndex + 1 : 1)

    // smoke is the only mode that picks an account for you.
    if (mode === 'smoke' && !provider) {
      const accounts = await accountsView()
      const connected = accounts.find((a) => a.configured)
      if (connected) {
        provider = connected.provider
        index = connected.index || 1
      }
    }

    if (!isProvider(provider)) {
      const code = mode === 'check' ? 'provider' : (mode === 'smoke' ? 'no_connected_accounts' : 'invalid_provider')
      const message = mode === 'check' ? 'unknown provider'
        : (mode === 'smoke' ? 'No connected subscription account found to test' : 'Provider required')
      writeJson(res, mode === 'check' ? 200 : 400, { ok: false, provider, error: { code, message } })
      return
    }

    const ref = oauthRef(provider, index)
    const info = await store.describeRef(ref)
    if (!info.configured) {
      // The code name is what the card renders as a hint, so it must not drift.
      const unconfigured = mode === 'ping'
        ? { code: 'not_configured', message: 'Account is not configured' }
        : { code: 'not_connected', message: mode === 'check' ? 'not connected' : 'Account is not connected' }
      writeJson(res, mode === 'check' ? 200 : 400, { ok: false, provider, index, ref, error: unconfigured })
      return
    }

    const t0 = Date.now()
    const grade = (ms) => (ms < 250 ? 'good' : (ms < 750 ? 'fair' : 'poor'))

    /** Record a failed probe and answer. Shared by both failure paths. */
    const fail = (e, code, withAccount) => {
      const latencyMs = Math.max(1, Date.now() - t0)
      // A failed probe is 'poor' regardless of how fast it failed.
      const latencyGrade = 'poor'
      if (typeof store.rememberPing === 'function') store.rememberPing(ref, { latencyMs, latencyGrade })
      const doctor = diagnoseVendorError(e, provider, withAccount)
      if (typeof store.rememberDoctorVerdict === 'function') store.rememberDoctorVerdict(ref, doctor)
      if (mode === 'smoke') history.add({ provider, ref, where: '/probe', mode, status: code === 'auth' ? 401 : 502, ms: latencyMs })
      writeJson(res, mode === 'check' ? 200 : 502, {
        ok: false, provider, index, ref, latencyMs, latencyGrade,
        ...(mode === 'check' && withAccount
          ? { email: pmE(withAccount.email), label: pmL(withAccount.label), expiresAt: withAccount.expiresAt || null, quota: info.quota || null }
          : {}),
        doctor,
        error: {
          // check answers 'auth' and 'refresh'; ping and smoke keep the generic
          // 'auth_failed' the card has always rendered.
          code: mode === 'check' ? code : 'auth_failed',
          message: String(e && e.message || e),
        },
      })
    }

    let blob
    try {
      blob = await store.loadBlob(ref)
    } catch (e) {
      fail(e, 'auth', null)
      return
    }
    try {
      // ping measures the stored credential; check and smoke refresh it first.
      if (mode !== 'ping') blob = await store.ensureFresh(provider, blob, ref)
    } catch (e) {
      fail(e, 'refresh', blob)
      return
    }

    const vendor = getVendor(provider)
    let capturedQuota = null
    // Every mode wraps fetch when the vendor reports quota through headers, so
    // the snapshot is remembered exactly once from the probe response.
    const probeFetch = async (url, init = {}) => {
      const doFetch = vendorFetch((typeof fetchForRef === 'function' && fetchForRef(ref)) || fetch, 15_000)
      const res2 = await doFetch(url, init)
      try {
        const snap = quotaSnapshot(provider, res2.headers, null, Date.now())
        if (snap) { capturedQuota = snap; store.rememberQuota(ref, snap) }
      } catch (err) { ignoreError('status.js: quota snapshot', err) }
      return res2
    }

    try {
      const cfg = vendorConfig(provider, live())
      if (typeof vendor.check === 'function') await vendor.check(blob, cfg, probeFetch)
      else if (typeof vendor.listModels === 'function') await vendor.listModels(blob, cfg, probeFetch)
      else if (typeof vendor.usage === 'function') await vendor.usage(blob, cfg, probeFetch)

      const latencyMs = Math.max(1, Date.now() - t0)
      const latencyGrade = grade(latencyMs)
      if (typeof store.rememberPing === 'function') store.rememberPing(ref, { latencyMs, latencyGrade })
      if (typeof store.rememberDoctorVerdict === 'function') store.rememberDoctorVerdict(ref, null)
      if (mode === 'smoke') history.add({ provider, ref, where: '/probe', mode, status: 200, ms: latencyMs })

      // Only check mode releases state: it is the explicit "is this account
      // healthy now" question, and a manual park is an operator decision.
      const cleared = []
      if (mode === 'check') {
        if (typeof store.clearCooldown === 'function' && info.cooldownUntil) {
          store.clearCooldown(ref)
          cleared.push('cooldown')
        }
        if (info.quarantineUntil && info.quarantineReason !== REASON_MANUAL_PARK
          && typeof store.releaseQuarantine === 'function') {
          store.releaseQuarantine(ref)
          cleared.push('quarantine')
        }
        if (cleared.length && typeof syncAdapter === 'function') {
          try { await syncAdapter() } catch (err) { ignoreError('status.js: syncAdapter after probe', err) }
        }
      }

      writeJson(res, 200, {
        ok: true, provider, index, ref, latencyMs, latencyGrade,
        email: pmE(blob.email), label: pmL(blob.label), expiresAt: blob.expiresAt || null,
        quota: capturedQuota || info.quota || null,
        usagePercent: info.usagePercent ?? null,
        cleared,
      })
    } catch (e) {
      const latencyMs = Math.max(1, Date.now() - t0)
      const latencyGrade = grade(latencyMs)
      if (typeof store.rememberPing === 'function') store.rememberPing(ref, { latencyMs, latencyGrade })
      const doctor = diagnoseVendorError(e, provider, blob)
      if (typeof store.rememberDoctorVerdict === 'function') store.rememberDoctorVerdict(ref, doctor)
      if (mode === 'smoke') history.add({ provider, ref, where: '/probe', mode, status: 502, ms: latencyMs })
      const isTimeout = isTimeoutError(e)
      writeJson(res, mode === 'check' ? 200 : 502, {
        ok: false, provider, index, ref, latencyMs, latencyGrade,
        ...(mode === 'check' ? { email: pmE(blob.email), label: pmL(blob.label), expiresAt: blob.expiresAt || null, quota: capturedQuota || info.quota || null, isTimeout } : {}),
        doctor,
        error: {
          code: isTimeout ? 'TIMEOUT' : (e && e.code ? e.code : 'VENDOR'),
          message: String(e && e.message || e).slice(0, 300),
        },
      })
    }
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/probe',
    handler: safeJsonHandler(async (req, res) => {
      // The mode travels as ?mode=..., and a direct handler call in tests carries
      // it in req.url instead. Both resolve to the same value.
      const url = String((req && req.url) || '')
      const fromQuery = /[?&]mode=([a-z]+)/.exec(url)
      const mode = String((fromQuery && fromQuery[1]) || queryOf(req).get('mode') || 'check')
      if (!PROBE_MODES.has(mode)) {
        writeJson(res, 400, { ok: false, error: { code: 'mode', message: 'mode must be check, ping or smoke' } })
        return
      }
      await probeAccount(req, res, mode)
    }),
  }), 'dsh-subscriptions: /probe')

}

