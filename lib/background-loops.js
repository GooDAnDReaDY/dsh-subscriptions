import { ignoreError } from './catch-log.js'
import { sanitizeSecrets } from './secret-scan.js'
import { webCallbackUri } from './oauth.js'
import { normalizeSlots } from './accounts.js'
import { msUntilNextWarmup } from './warmup-schedule.js'
import { quarantineDuration, REASON_REVOKED } from './quarantine.js'

export function createRedirectFor({ ctx, live, vendorConfig, getVendor }) {
  return function redirectFor(provider, ref, reqOrigin) {
    if (typeof provider === 'object' && provider !== null) {
      const opts = provider
      provider = opts.provider
      ref = opts.ref
      reqOrigin = opts.origin
    }
    if (live().useWebCallback) {
      const origin = reqOrigin || ((ctx.webServer && typeof ctx.webServer.url === 'string') ? ctx.webServer.url : '')
      return webCallbackUri(origin)
    }
    const vCfg = vendorConfig(provider, live())
    return vCfg.redirectUri || (getVendor(provider).defaults ? getVendor(provider).defaults()?.redirectUri : '') || ''
  }
}

export function registerBackgroundLoops(ctx, deps) {
  const {
    live, store, fetch, fetchForRef, logger,
    runProactiveHeartbeat, isAuthError, notifySessionExpired,
    getVendor, vendorConfig, syncOllama,
    getVaultSyncStatus, syncVaultPull, getSettingsApi, syncAdapter, refreshModels,
    getRecentAlerts, isDigestDue, dispatchNotificationDigest,
  } = deps

  // Ponytail: background refresh ahead of expiry, single timer
  ctx.effect(() => {
    runProactiveHeartbeat().catch(() => {})
    const id = setInterval(() => { runProactiveHeartbeat().catch(() => {}) }, 60 * 1000)
    return () => clearInterval(id)
  }, 'dsh-subscriptions: refresh ahead')

  // One pass over every configured account: refresh the token, then let the
  // vendor check prove the account still works. Shared by the periodic probe
  // loop and the scheduled morning warm-up.
  // #952: notify once per quarantine window, not once per probe pass.
  const revokedNotified = new Map()
  let probeInFlight = false
  const probeAllAccounts = async () => {
    if (probeInFlight) return
    probeInFlight = true
    try {
      const cfg = live()
      const markRevoked = (ref, provider, message) => {
        const until = Date.now() + quarantineDuration(REASON_REVOKED)
        store.recordBroken(ref)
        store.rememberQuarantine(ref, 'SESSION_REVOKED', until, 1)
        const prevUntil = revokedNotified.get(ref) || 0
        if (prevUntil > Date.now()) return
        revokedNotified.set(ref, until)
        try {
          notifySessionExpired({
            ref,
            provider,
            message,
            webhookUrl: cfg.webhookUrl,
            fetchImpl: fetch,
            nowMs: Date.now(),
          })
        } catch (err) { ignoreError("background-loops.js: alert best-effort", err) }
      }
      for (const slot of normalizeSlots(cfg.slots)) {
        const ref = slot.ref
        try {
          const info = await store.describeRef(ref)
          if (!info.configured) continue
          const raw = await store.resolveRaw(ref)
          if (!raw) continue
          const blob = await store.loadBlob(ref).catch(() => null)
          if (!blob || !blob.refreshToken) continue
          let fresh
          try {
            fresh = await store.ensureFresh(slot.provider, blob, ref)
          } catch (refreshErr) {
            if (isAuthError(refreshErr)) markRevoked(ref, slot.provider, refreshErr && refreshErr.message)
            continue
          }
          if (!fresh) continue
          const vendor = getVendor(slot.provider)
          if (typeof vendor.check !== 'function') continue
          const cfg2 = vendorConfig(slot.provider, live())
          const probeFetch = async (u, i) => ((typeof fetchForRef === 'function' && fetchForRef(ref)) || fetch)(u, i)
          try {
            await vendor.check(fresh, cfg2, probeFetch)
            if (typeof store.rememberDoctorVerdict === 'function') store.rememberDoctorVerdict(ref, null)
            revokedNotified.delete(ref)
          } catch (checkErr) {
            if (isAuthError(checkErr)) markRevoked(ref, slot.provider, checkErr && checkErr.message)
            if (logger && logger.warn) logger.warn('[dsh-subscriptions] probe ' + ref + ': ' + sanitizeSecrets(String(checkErr && checkErr.message || checkErr)).slice(0, 200))
          }
        } catch (err) { ignoreError("background-loops.js: best-effort", err) }
      }
    } finally {
      probeInFlight = false
    }
  }

  // Background health-check probe loop
  ctx.effect(() => {
    let lastProbeAt = 0
    const wrapped = async () => {
      const cfg = live()
      const mins = Number(cfg.probeIntervalMin)
      if (!Number.isFinite(mins) || mins <= 0) return
      if (Date.now() - lastProbeAt < mins * 60 * 1000) return
      lastProbeAt = Date.now()
      await probeAllAccounts()
    }
    wrapped().catch(() => {})
    const timer = setInterval(() => { wrapped().catch(() => {}); syncOllama().catch(() => {}) }, 60 * 1000)
    return () => clearInterval(timer)
  }, 'dsh-subscriptions: probe loop')

  // Morning warm-up: at the configured local time refresh tokens and prove the
  // pool before the first turn of the day, so quota checks are not paid inline.
  ctx.effect(() => {
    let timer
    const schedule = () => {
      const delay = msUntilNextWarmup(live().warmupAt)
      if (delay == null) return
      timer = setTimeout(async () => {
        try {
          await runProactiveHeartbeat().catch(() => {})
          await probeAllAccounts()
          if (logger && logger.info) logger.info('[dsh-subscriptions] scheduled warm-up finished')
        } catch (err) { ignoreError("background-loops.js: scheduled warm-up", err) }
        schedule()
      }, delay)
      timer.unref?.()
    }
    schedule()
    return () => { if (timer) clearTimeout(timer) }
  }, 'dsh-subscriptions: warm-up schedule')

  // #562: Background automated remote vault sync loop
  ctx.effect(() => {
    const checkSync = async () => {
      const cfg = live()
      if (!cfg.vaultSyncEnabled || !cfg.vaultSyncIntervalHours || cfg.vaultSyncIntervalHours <= 0) return
      const status = getVaultSyncStatus()
      const now = Date.now()
      const intervalMs = cfg.vaultSyncIntervalHours * 3600 * 1000
      const lastPull = status.lastPullAt ? new Date(status.lastPullAt).getTime() : 0
      if (now - lastPull >= intervalMs) {
        try {
          await syncVaultPull({
            live: cfg,
            store,
            settingsApi: getSettingsApi(),
            syncAdapter,
            refreshModels,
          })
        } catch (err) { ignoreError("background-loops.js: status captures error", err) }
      }
    }
    const intervalId = setInterval(() => { checkSync().catch(() => {}) }, 60 * 60 * 1000)
    const initialTimer = setTimeout(() => { checkSync().catch(() => {}) }, 30 * 1000)
    return () => {
      clearInterval(intervalId)
      clearTimeout(initialTimer)
    }
  }, 'dsh-subscriptions: vault-sync-loop')

  // #720: interval digest for busy webhook channels.
  ctx.effect(() => {
    // #967: do not fire an immediate digest when the effect remounts; the
    // buffer is in-memory and survives config changes within one process.
    let lastDigestAt = Date.now()
    const tick = () => {
      const cfg = live()
      const alerts = getRecentAlerts(100)
      if (!isDigestDue({ lastDigestAt, nowMs: Date.now(), intervalHours: cfg.digestIntervalHours, alertCount: alerts.length })) return
      dispatchNotificationDigest(alerts, cfg.webhookUrl, fetch, { secret: cfg.webhookSecret, allowPrivate: cfg.webhookAllowPrivate, format: cfg.webhookFormat })
        .then((ok) => { if (ok) lastDigestAt = Date.now() })
        .catch(() => {})
    }
    tick()
    const id = setInterval(tick, 60 * 60 * 1000)
    return () => clearInterval(id)
  }, 'dsh-subscriptions: notification digest')
}
