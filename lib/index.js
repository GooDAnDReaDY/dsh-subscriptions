import { readFileSync } from 'node:fs'
import { bestEffort } from './utils.js'
export { Config, publicConfig, Slot, defaultSlots } from './config-schema.js'
import { Config } from './config-schema.js'
import { registerRoutes } from './routes.js'
import { oauthRef, parseOauthRef, isProvider, displayName } from './refs.js'
import { webCallbackUri } from './oauth.js'
import { getVendor, registerCustomVendor, clearCustomVendors } from './vendors/index.js'
import { generateOnce, SIZES as IMAGE_SIZES } from './images.js'
import { parseBlob } from './blob.js'
import { createVendorFromProfile, validateProfile } from './vendor-factory.js'
import { registerCustomProviderIds, registerDisplayName } from './refs.js'
import { createSubscriptionsService } from './subscriptions.js'
import { createAccountStore, normalizeSlots, vendorConfig } from './accounts.js'
import { OllamaAdapter, ollamaAlive, ollamaModels, ollamaBase } from './ollama.js'
import { createResetCreditService } from './reset-credits.js'
import { maskEmail, maskLabel } from './mask.js'
import { proxyFetch } from './proxy.js'
import { HistoryStore, DEFAULT_HISTORY_DIR } from './history.js'
import { createDiagnosticsReport } from './diagnostics.js'
import { createAccountsView } from './accounts-view.js'
import { createAdapterManager } from './adapter-manager.js'

export { observeForecast, estimateForecast } from './forecast.js'
export { formatRelativeReset } from './relative-time.js'
export { resolveFallbackVendor, mapFallbackModel, DEFAULT_CASCADE_CHAINS } from './cascade.js'
export { exportVault, importVault } from './vault.js'
export { recordAlert, getRecentAlerts, checkQuotaThresholds, notifySessionExpired } from './alerts.js'
export { calculateBurnRatePerHour, computePacingRisk } from './forecast.js'
export { needsWarmupProbe, enterProbing, resolveWarmupSuccess, resolveWarmupFailure } from './quarantine.js'

export const name = '@goodandready/dsh-subscriptions'
export const inject = ['llm', 'credentials', 'webServer', 'settings']

const NS = 'dsh-subscriptions'

let pkgVersion = ''
try { pkgVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version || '' } catch { /* ignore package read errors at startup */ }
const PENDING_TTL_MS = 15 * 60 * 1000

const OK_HTML = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>dsh-subscriptions - connected</title>
    <style>
      body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
             background: #0d1117; color: #c9d1d9; display: flex; align-items: center;
             justify-content: center; height: 100vh; margin: 0; }
      .card { background: #161b22; border: 1px solid #30363d; border-radius: 8px;
              padding: 24px 32px; text-align: center; max-width: 360px; }
      h1 { font-size: 18px; margin: 0 0 8px; color: #58a6ff; }
      p { font-size: 13px; line-height: 1.5; margin: 0 0 16px; color: #8b949e; }
      .btn { display: inline-block; background: #238636; color: #fff; padding: 6px 14px;
             border-radius: 6px; text-decoration: none; font-size: 13px; font-weight: 500; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Account connected</h1>
      <p>Authentication token was saved. You can close this tab and return to DeepSeek Harness.</p>
      <a class="btn" href="javascript:window.close()">Close window</a>
    </div>
  </body>
</html>`

export function apply(ctx, rawConfig) {
  const logger = ctx.logger ? ctx.logger('subscriptions') : undefined
  let settingsApi

  let cachedConfig = Config(rawConfig || {})
  const live = () => cachedConfig

  function syncCustomVendors() {
    let profiles
    try {
      profiles = (live().customVendors || []).map(validateProfile)
    } catch (e) {
      if (logger && logger.warn) logger.warn('[dsh-subscriptions] customVendors: ' + String(e && e.message || e))
      return
    }
    clearCustomVendors()
    for (const profile of profiles) {
      try {
        const vendor = createVendorFromProfile(profile)
        registerCustomVendor(vendor)
        registerCustomProviderIds([profile.id])
        if (profile.displayName) registerDisplayName(profile.id, profile.displayName)
      } catch (e) {
        if (logger && logger.warn) logger.warn('[dsh-subscriptions] customVendors[' + profile.id + ']: ' + String(e && e.message || e))
      }
    }
  }
  syncCustomVendors()

  const syncSnapshot = (next) => {
    try {
      const fresh = next !== undefined ? next : (typeof settingsApi?.get === 'function' ? settingsApi.get() : cachedConfig)
      cachedConfig = Config(fresh || {})
      syncCustomVendors()
      syncAdapter().catch(() => {})
      syncOllama().catch(() => {})
    } catch { /* keep existing snapshot on error */ }
  }

  if (typeof ctx.inject === 'function') {
    ctx.inject(['settings'], (sctx) => {
      const scope = sctx.settings.register(NS, Config, { base: rawConfig })
      settingsApi = {
        ...scope,
        get: () => (typeof scope.get === 'function' ? scope.get() : cachedConfig),
        async replace(next) {
          syncSnapshot(next)
          if (typeof scope.replace === 'function') {
            return await scope.replace(next)
          }
        },
      }

      if (typeof scope.get === 'function') {
        syncSnapshot(scope.get())
      }

      if (typeof scope.watch === 'function') {
        try {
          const unwatch = scope.watch((next) => syncSnapshot(next))
          if (typeof unwatch === 'function') {
            sctx.effect(() => unwatch)
          }
        } catch { /* ignore watch error */ }
      }

      Promise.resolve().then(() => {
        reconcileSlots().catch((err) => {
          if (logger && logger.warn) logger.warn('[dsh-subscriptions] reconcileSlots initial error: ' + (err && err.message || err))
        })
      })

      const onDocUpdated = (ns) => {
        if (!ns || ns === NS) {
          syncSnapshot()
        }
      }
      if (typeof sctx.on === 'function') {
        sctx.on('settings/document-updated', onDocUpdated)
      } else if (typeof ctx.on === 'function') {
        ctx.on('settings/document-updated', onDocUpdated)
      }

      sctx.effect(() => () => {
        settingsApi = undefined
        cachedConfig = Config(rawConfig || {})
        syncCustomVendors()
      })
    })
  }

  const fetchForRef = (ref) => {
    const parsed = parseOauthRef(ref)
    if (!parsed) return null
    const slot = normalizeSlots(live().slots).find((s) => s.provider === parsed.provider && s.index === parsed.index)
    if (!slot || !slot.proxyUrl) return null
    return proxyFetch(slot.proxyUrl)
  }

  function redirectFor(ref, provider) {
    if (live().useWebCallback) {
      const origin = (ctx.webServer && typeof ctx.webServer.url === 'string')
        ? ctx.webServer.url
        : ''
      return webCallbackUri(origin, ref)
    }
    return getVendor(provider).redirectUri(vendorConfig(provider, live()))
  }

  const store = createAccountStore({
    credentials: ctx.credentials,
    getConfig: live,
    fetchImpl: fetch,
    fetchForRef,
    onLimitNotice: (provider, ref, win, threshold) => {
      if (!live().notifyLimits) return
      const label = win.en || win.ru || win.id
      if (logger && logger.warn) logger.warn(`[dsh-subscriptions] ${provider} ${ref}: limit ${label} at ${threshold}%`)
      bestEffort('emit limit-notice', () => ctx.emit && ctx.emit('subscriptions.limit-notice', { provider, ref, window: win.id, usedPercent: win.usedPercent, threshold }), undefined, logger)
    },
  })
  const history = new HistoryStore(DEFAULT_HISTORY_DIR, 7 * 24 * 60 * 60 * 1000, 1000)
  if (typeof ctx?.on === 'function') {
    ctx.on('dispose', () => history.dispose())
  }
  const recordHistory = (entry) => history.add(entry)

  // #85: host-only reset credit service for Codex accounts.
  const resetCredits = createResetCreditService({ loadBlob: (ref) => store.loadBlob(ref) })
  function refForSlot(provider, index) {
    const slot = normalizeSlots(live().slots).find((s) => s.provider === provider && s.index === index)
    return slot ? slot.ref : null
  }

  function stripLegacySlots(slots) {
    return (slots || []).filter((slot) => isProvider(slot.provider))
  }

  // Local Ollama adapter and fallback
  const ollamaAdapter = new OllamaAdapter({
    baseUrl: () => ollamaBase(live()),
    fallbackModel: () => live().ollamaFallbackModel || '',
  })
  let ollamaHandle
  async function syncOllama() {
    const cfg = live()
    const alive = !!cfg.ollamaFallback && await ollamaAlive(ollamaBase(cfg), fetch)
    if (alive && !ollamaHandle) {
      try { ollamaHandle = ctx.llm.registerAdapter(['ollama'], ollamaAdapter) } catch { /* already registered elsewhere */ }
    } else if (!alive && ollamaHandle) {
      try { ollamaHandle() } catch { /* already gone */ }
      ollamaHandle = undefined
    }
  }

  async function* ollamaFallbackStream({ options, provider, err }) {
    const cfg = live()
    const models = await ollamaModels(ollamaBase(cfg), fetch).catch(() => [])
    if (!cfg.ollamaFallback || !models.length) throw err
    const model = cfg.ollamaFallbackModel || models[0].id
    bestEffort('emit ollama-fallback', () => ctx.emit && ctx.emit('subscriptions.ollama-fallback', { provider, model, reason: err && err.code || 'EXHAUSTED' }), undefined, logger)
    if (logger && logger.warn) logger.warn(`[dsh-subscriptions] ${provider}: all accounts exhausted (${err && err.code || 'EXHAUSTED'}), falling back to ollama/${model}`)
    try {
      recordHistory({
        provider: 'ollama',
        ref: 'OLLAMA_FALLBACK',
        model,
        path: '/v1/chat/completions',
        method: 'POST',
        status: 200,
        kind: 'fallback',
      })
    } catch { /* best-effort */ }
    yield* ollamaAdapter.stream({ ...options, provider: 'ollama', model })
  }

  // LLM Adapter lifecycle manager
  const adapterManager = createAdapterManager({
    ctx,
    live,
    store,
    logger,
    fetch,
    fetchForRef,
    recordHistory,
    getSettingsApi: () => settingsApi,
    syncCustomVendors,
    syncOllama,
    stripLegacySlots,
  })
  const { syncAdapter, reconcileSlots, refreshModels, cascadeFallbackStream } = adapterManager
  adapterManager.registerAdapterLifecycle()

  const subscriptions = createSubscriptionsService({
    listAccounts: (provider) => store.listAccounts(provider),
    loadBlob: (ref) => store.loadBlob(ref),
    ensureFresh: (provider, blob, ref) => store.ensureFresh(provider, blob, ref),
    vendorConfig: (provider) => vendorConfig(provider, live()),
    cooldownMs: () => live().cooldownMs,
    switchAtRemaining: () => live().switchAtRemaining,
    rememberCooldown: (ref, until, families) => store.rememberCooldown(ref, until, families),
    rememberQuarantine: (ref, reason, until) => store.rememberQuarantine(ref, reason, until),
    recordSuccess: (ref) => store.recordSuccess(ref),
    getHealth: (ref) => store.getHealth(ref),
    recordSwitch: (ref) => store.recordSwitch(ref),
    recordExhaust: (ref) => store.recordExhaust(ref),
    recordBroken: (ref) => store.recordBroken(ref),
    setHealth: (ref, h) => store.setHealth(ref, h),
    rememberQuota: (ref, snap) => store.rememberQuota(ref, snap),
    rememberRequest: (ref) => store.rememberRequest(ref),
    getRequestCount: (ref) => store.getRequestCount(ref),
    recordHistory,
    fetchImpl: fetch,
    fetchForRef,
    ollamaFallback: ollamaFallbackStream,
    cascadingFallback: cascadeFallbackStream,
    hideDeprecatedModels: () => !!live().hideDeprecatedModels,
  })

  ctx.effect(() => ctx.provide('subscriptions', subscriptions), 'dsh-subscriptions: subscriptions service')
  ctx.effect(() => ctx.provide('subscriptionImages', {
    async available() {
      const logged = await store.loggedInProviders()
      return ['codex', 'grok'].filter((name) => logged && logged[name])
    },
    sizes: IMAGE_SIZES,
    async generate(request) {
      const provider = request && request.provider
      if (provider !== 'codex' && provider !== 'grok') {
        throw new Error(`unknown subscription provider: ${provider}`)
      }
      const accounts = await store.listAccounts(provider)
      const slot = (accounts || []).find((row) => row && row.ref)
      if (!slot) throw new Error(`not logged in to ${provider}: sign in in the Subscriptions section`)
      const raw = await store.resolveRaw(slot.ref)
      if (!raw) throw new Error(`not logged in to ${provider}: sign in in the Subscriptions section`)
      const session = await store.ensureFresh(provider, parseBlob(raw), slot.ref)
      return generateOnce({
        provider,
        prompt: request.prompt,
        size: request.size,
        quality: request.quality,
        session,
        fetchImpl: fetch,
        signal: request.signal,
      })
    },
  }), 'dsh-subscriptions: image generation service')

  const pending = new Map()

  function sweepPending(now) {
    for (const [stateKey, row] of pending) {
      if (now - row.createdAt > PENDING_TTL_MS) pending.delete(stateKey)
    }
  }

  async function completeOAuth({ provider, index, code, state }) {
    if (!isProvider(provider)) throw new Error('unknown provider')
    const n = Number(index)
    const ref = oauthRef(provider, n)
    sweepPending(Date.now())
    let row = state ? pending.get(state) : null
    if (!row) {
      for (const item of pending.values()) {
        if (item.provider === provider && item.index === n) row = item
      }
    }
    if (!row || !row.verifier) throw new Error('login session expired; start Connect again')
    if (row.provider !== provider || row.index !== n) throw new Error('state does not match this account')
    const cfg = { ...vendorConfig(provider, live()), redirectUri: row.redirectUri }
    const blob = await getVendor(provider).exchangeCode(cfg, {
      verifier: row.verifier,
      challenge: row.challenge,
      state: row.state,
    }, code, fetchForRef(ref) || fetch)
    const slots = normalizeSlots(live().slots)
    const slot = slots.find((s) => s.ref === ref)
    if (slot && slot.label) blob.label = slot.label
    await store.saveBlob(ref, blob)
    pending.delete(row.state)
    await syncAdapter()
    refreshModels().catch(() => {})
    return { ref, label: pmL(blob.label || blob.email) || displayName(provider) }
  }

  // Privacy masking
  const privacyOn = () => !!live().privacyMask
  const pmE = (s) => privacyOn() ? maskEmail(s) : String(s || '')
  const pmL = (s) => privacyOn() ? maskLabel(s) : String(s || '')

  const diagnosticsReport = () => createDiagnosticsReport({ live, store, history, NS, pkgVersion })
  const accountsView = () => createAccountsView({ live, store, fetch, pmL })

  // Ponytail: background refresh ahead of expiry, single timer
  ctx.effect(() => {
    const tick = async () => {
      const cfg = live()
      const ahead = Number(cfg.refreshAheadMs) || 5 * 60 * 1000
      const retryMs = Number(cfg.refreshRetryMs) || 10 * 60 * 1000
      const now = Date.now()
      for (const slot of normalizeSlots(cfg.slots)) {
        const ref = slot.ref
        try {
          const info = await store.describeRef(ref)
          if (!info.configured) continue
          if (info.cooldownUntil && info.cooldownUntil > now) continue
          const raw = await store.resolveRaw(ref)
          if (!raw) continue
          const blob = await store.loadBlob(ref).catch(() => null)
          if (!blob || !blob.refreshToken) continue
          if (!blob.expiresAt) continue
          if (blob.expiresAt - now > ahead) continue
          if (typeof store.shouldSkipRefresh === 'function' && store.shouldSkipRefresh(ref, now, retryMs)) continue
          await store.ensureFresh(slot.provider, blob, ref).catch((e) => {
            if (logger && logger.warn) logger.warn('[dsh-subscriptions] background refresh failed for ' + ref + ': ' + String(e && e.message || e))
          })
        } catch { /* best-effort */ }
      }
    }
    tick().catch(() => {})
    const timer = setInterval
    const clear = clearInterval
    const id = timer(() => { tick().catch(() => {}) }, 60 * 1000)
    return () => clear(id)
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
          const fresh = await store.ensureFresh(slot.provider, blob, ref).catch(() => null)
          if (!fresh) continue
          const vendor = getVendor(slot.provider)
          if (typeof vendor.check !== 'function') continue
          const cfg2 = vendorConfig(slot.provider, live())
          const probeFetch = async (u, i) => ((typeof fetchForRef === 'function' && fetchForRef(ref)) || fetch)(u, i)
          await vendor.check(fresh, cfg2, probeFetch).catch((e) => {
            if (logger && logger.warn) logger.warn('[dsh-subscriptions] probe ' + ref + ': ' + String(e && e.message || e).slice(0, 200))
          })
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

  registerRoutes(ctx, {
    NS,
    live,
    accountsView,
    getSettingsApi: () => settingsApi,
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
  })
}
