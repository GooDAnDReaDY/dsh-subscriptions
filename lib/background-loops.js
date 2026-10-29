import { webCallbackUri } from './oauth.js'
import { normalizeSlots } from './accounts.js'

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

  // Background health-check probe loop
  ctx.effect(() => {
    const tick = async () => {
      const cfg = live()
      const mins = Number(cfg.probeIntervalMin)
      if (!Number.isFinite(mins) || mins <= 0) return
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
            if (isAuthError(refreshErr)) {
              store.recordBroken(ref)
              store.rememberQuarantine(ref, "SESSION_REVOKED", Date.now() + 86400000, 1)
              try {
                notifySessionExpired({
                  ref,
                  provider: slot.provider,
                  message: refreshErr && refreshErr.message,
                  webhookUrl: cfg.webhookUrl,
                  fetchImpl: fetch,
                  nowMs: Date.now(),
                })
              } catch { /* alert best-effort */ }
            }
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
          } catch (checkErr) {
            if (isAuthError(checkErr)) {
              store.recordBroken(ref)
              store.rememberQuarantine(ref, "SESSION_REVOKED", Date.now() + 86400000, 1)
              try {
                notifySessionExpired({
                  ref,
                  provider: slot.provider,
                  message: checkErr && checkErr.message,
                  webhookUrl: cfg.webhookUrl,
                  fetchImpl: fetch,
                  nowMs: Date.now(),
                })
              } catch { /* alert best-effort */ }
            }
            if (logger && logger.warn) logger.warn('[dsh-subscriptions] probe ' + ref + ': ' + String(checkErr && checkErr.message || checkErr).slice(0, 200))
          }
        } catch { /* best-effort */ }
      }
    }
    let lastProbeAt = 0
    const wrapped = async () => {
      const cfg = live()
      const mins = Number(cfg.probeIntervalMin)
      if (!Number.isFinite(mins) || mins <= 0) return
      if (Date.now() - lastProbeAt < mins * 60 * 1000) return
      lastProbeAt = Date.now()
      await tick()
    }
    wrapped().catch(() => {})
    const timer = setInterval(() => { wrapped().catch(() => {}); syncOllama().catch(() => {}) }, 60 * 1000)
    return () => clearInterval(timer)
  }, 'dsh-subscriptions: probe loop')

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
        } catch { /* status captures error */ }
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
    let lastDigestAt = 0
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
