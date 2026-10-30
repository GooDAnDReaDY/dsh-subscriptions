import { ignoreError } from './catch-log.js'
import { plainConfig } from './config-schema.js'
export { plainConfig } from './config-schema.js'
import { readFileSync } from 'node:fs'
import { isDeepStrictEqual } from 'node:util'
import { bestEffort } from './utils.js'
import { sweepExpiredPending } from './oauth-pending.js'
export { Config, publicConfig, Slot, defaultSlots } from './config-schema.js'
import { Config } from './config-schema.js'
import { registerRoutes } from './routes.js'
import { oauthRef, parseOauthRef, isProvider, displayName } from './refs.js'
import { getVendor, registerCustomVendor, clearCustomVendors } from './vendors/index.js'
import { generateOnce, SIZES as IMAGE_SIZES } from './images.js'
import { parseBlob } from './blob.js'
import { createVendorFromProfile, validateProfiles } from './vendor-factory.js'
import { registerVendorPack } from './vendor-pack.js'
import { registerCustomProviderIds, registerDisplayName } from './refs.js'
import { createSubscriptionsService } from './subscriptions.js'
import { registerSubscriptionTools } from './native-tools.js'
import { detectConflicts, readProfilePluginNames, setActiveConflicts } from './coexistence.js'
import { createAccountStore, defaultAccountRef, normalizeSlots, vendorConfig } from './accounts.js'
import { resolveAccountRef } from './account-reliability.js'
import { OllamaAdapter, ollamaAlive, ollamaModels, ollamaBase } from './ollama.js'
import { NamespacedAdapter, subscriptionRoute } from './provider-routes.js'
import { createResetCreditService } from './reset-credits.js'
import { maskEmail, maskLabel } from './mask.js'
import { proxyFetch } from './proxy.js'
import { shouldBypassProxy } from './feature-helpers.js'
import { refreshClientVersions } from './client-version-service.js'
import { normalizeRpcResult, hostCompatibilityError } from './compat.js'
import { HistoryStore, resolveHistoryDir } from './history.js'
import { createDiagnosticsReport } from './diagnostics.js'
import { createAccountsView } from './accounts-view.js'
import { inspectScopes } from './scope-inspector.js'
import { createAdapterManager } from './adapter-manager.js'
import { pickAccount, poolBlockReason, isAuthError } from './rotate.js'
import { notifySessionExpired, getRecentAlerts, dispatchNotificationDigest, setWebhookSecret, setWebhookAllowPrivate, setWebhookFormat } from './alerts.js'
import { isDigestDue } from './notification-scheduler.js'
import { clearSessionPins } from './session-pin.js'
import { clearKeyRotationCache } from './key-rotation-bridge.js'
import { clearOllamaHealthCache } from './ollama-health.js'
import { clearGrokCatalogCache } from './vendors/grok.js'
import { registerBackgroundLoops, createRedirectFor } from './background-loops.js'
import { registerCodexWebSearch } from './codex-web-search.js'
import { setCatchLogger } from './catch-log.js'
import { defaultConcurrencyQueue } from './concurrency-queue.js'

export { observeForecast, estimateForecast } from './forecast.js'
export { formatRelativeReset } from './relative-time.js'
export { resolveFallbackVendor, mapFallbackModel, DEFAULT_CASCADE_CHAINS } from './cascade.js'
export { exportVault, importVault } from './vault.js'
export { recordAlert, getRecentAlerts, checkQuotaThresholds, notifySessionExpired } from './alerts.js'
export { calculateBurnRatePerHour, computePacingRisk } from './forecast.js'
export { needsWarmupProbe, enterProbing, resolveWarmupSuccess, resolveWarmupFailure } from './quarantine.js'
export { encodeQrMatrix, renderAsciiQr, renderSvgQr, renderSvgDataUrl, generateSshTunnelCommand, getHeadlessAuthInfo, handleHeadlessRedirect } from './headless-auth.js'
export { pushToWebdav, pullFromWebdav, pushToGist, pullFromGist, buildS3SigV4Headers, pushToS3, pullFromS3, syncVaultPush, syncVaultPull, getVaultSyncStatus, resetVaultSyncStatus } from './vault-sync.js'
import { syncVaultPush, syncVaultPull, getVaultSyncStatus } from './vault-sync.js'

export const name = '@goodandready/dsh-subscriptions'
export const inject = ['llm', 'credentials', 'webServer', 'settings', 'tools', 'web']

const NS = 'dsh-subscriptions'

let pkgVersion = ''
try { pkgVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version || '' } catch (err) { ignoreError("index.js: ignore package read errors at startup", err) }
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
  const logger = typeof ctx.logger === 'function' ? ctx.logger('subscriptions') : (ctx.logger || undefined)
  setCatchLogger(logger)
  const conflicts = detectConflicts({ dependencies: readProfilePluginNames() })
  setActiveConflicts(conflicts)
  if (conflicts.length && logger && logger.warn) {
    logger.warn('[dsh-subscriptions] conflicting subscription plugins detected: ' + conflicts.join(', ') + '; keep one provider owner')
  }

  // rawConfig still holds Volatile boxes, so unwrap before validating.
  const resolveEntry = () => {
    // rawConfig still holds Volatile boxes, so unwrap before validating; Config then
    // re-creates boxes for the volatile fields, so unwrap the result as well.
    return plainConfig(Config(plainConfig(rawConfig || {})))
  }
  let cachedConfig = resolveEntry()
  const live = () => {
    setWebhookSecret(cachedConfig.webhookSecret)
    setWebhookAllowPrivate(cachedConfig.webhookAllowPrivate)
    setWebhookFormat(cachedConfig.webhookFormat)
    return cachedConfig
  }

  function syncCustomVendors() {
    clearGrokCatalogCache()
    const profiles = validateProfiles(live().customVendors)
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
    for (const pack of (live().providerPacks || [])) {
      try {
        registerVendorPack(pack, {
          registerVendor: registerCustomVendor,
          registerProviderId: registerCustomProviderIds,
          registerDisplayName,
        })
      } catch (e) {
        if (logger && logger.warn) logger.warn('[dsh-subscriptions] providerPacks[' + (pack && pack.id) + ']: ' + String(e && e.message || e))
      }
    }
  }
  syncCustomVendors()

  const syncSnapshot = (next) => {
    try {
      const fresh = next !== undefined ? next : resolveEntry()
      cachedConfig = fresh
      clearKeyRotationCache()
      clearOllamaHealthCache()
      syncCustomVendors()
      syncAdapter().catch(() => {})
      syncOllama().catch(() => {})
    } catch (err) { ignoreError("index.js: keep existing snapshot on error", err) }
  }

  // settings.register was removed before DSH 0.1.7-rc.2, so the scope this plugin used
  // to build from it never existed: getSettingsApi() returned null and writes only
  // touched memory. Back it with the real settings service instead, whose
  // describe()/update()/replace() are the contract both releases share.
  let settingsSvc = null

  const describeRow = () => {
    if (typeof settingsSvc?.describe !== 'function') return null
    try {
      return settingsSvc.describe().find((r) => r && r.ns === NS) || null
    } catch (err) {
      if (logger && logger.warn) logger.warn('[dsh-subscriptions] describe failed: ' + String(err && err.message || err))
      return null
    }
  }

  const settingsApi = {
    get: () => live(),
    revision: () => describeRow()?.revision,
    replace: async (next, expectedRevision) => {
      const parsed = plainConfig(next)
      const prevConfig = cachedConfig
      // The host settings service only accepts volatile fields in an update and
      // rejects a profile-owned field outright ("Config field X is not volatile").
      // Compare those first so the caller gets an explicit answer instead of a
      // host-level error, and send just the editable subset.
      const editable = {}
      const fields = Config.dict || {}
      if (Object.keys(fields).length) {
        for (const [key, field] of Object.entries(fields)) {
          if (field && field.meta && field.meta.volatile) {
            editable[key] = parsed[key]
            continue
          }
          if (!isDeepStrictEqual(parsed[key], prevConfig[key])) {
            throw new Error(`Config field "${key}" requires a profile edit and plugin reload`)
          }
        }
      } else {
        Object.assign(editable, parsed)
      }
      try {
        let rpc
        if (typeof settingsSvc?.update === 'function') {
          rpc = await settingsSvc.update(NS, structuredClone(editable), expectedRevision !== undefined ? expectedRevision : describeRow()?.revision)
        } else if (typeof settingsSvc?.replace === 'function') {
          rpc = await settingsSvc.replace(NS, structuredClone(editable), expectedRevision !== undefined ? expectedRevision : describeRow()?.revision)
        } else {
          throw hostCompatibilityError('settings.update/replace is missing')
        }
        const result = rpc === undefined ? { ok: true } : normalizeRpcResult(rpc)
        if (!result.ok) throw new Error('settings update was not acknowledged by the host')
        cachedConfig = plainConfig(Config({ ...prevConfig, ...editable }))
        clearKeyRotationCache()
        clearOllamaHealthCache()
        syncCustomVendors()
      } catch (err) {
        cachedConfig = prevConfig
        try { syncCustomVendors() } catch (err) { ignoreError("index.js: bestEffort", err) }
        throw err
      }
      return parsed
    },
  }
  // service offers describe/update/replace with a revision, so adapt it here: the adapter
  // keeps the cached snapshot current and persists through the real service.
  const getSettingsApi = () => (settingsSvc ? settingsApi : null)

  ctx.inject(['settings'], (sctx) => {
    try {
      settingsSvc = sctx.settings || (typeof sctx.get === 'function' ? sctx.get('settings') : null) || null
      if (!settingsSvc) return
      const served = describeRow()
      if (served && served.value) {
        try { syncSnapshot(plainConfig(Config(plainConfig(served.value)))) } catch (err) { ignoreError("index.js: keep current", err) }
      }
      if (typeof sctx.effect === 'function') {
        sctx.effect(() => () => { settingsSvc = null })
      }
    } catch (err) {
      // The profile may be mounted without the settings service; the static config stays
      // authoritative and the volatile-update handler below still applies later changes.
      if (logger && logger.warn) logger.warn('[dsh-subscriptions] settings service unavailable: ' + String(err && err.message || err))
    }
  })

  const syncQueueConfig = () => {
    const cfg = live()
    defaultConcurrencyQueue.configure({
      maxQueueSize: Number(cfg.maxQueueSize) || 0,
      timeoutMs: Number(cfg.queueTimeoutMs) || 0,
      enabled: cfg.enableQueue !== false,
    })
  }
  syncQueueConfig()

  // The host announces configuration changes with settings/document-updated; the Loader
  // also re-announces the volatile boxes in place. Refresh the cached snapshot on both.
  const onSettingsChanged = () => {
    try {
      const row = describeRow()
      if (row && row.value) syncSnapshot(plainConfig(Config(plainConfig(row.value))))
      else syncSnapshot()
      syncQueueConfig()
      if ((live().slots || []).some((slot) => slot && (slot.provider === 'codex' || slot.provider === 'claude'))) {
        refreshClientVersions({ fetchImpl: fetch }).catch(() => {})
      }
      reconcileSlots().catch(() => {})
    } catch (err) { ignoreError("index.js: keep existing snapshot on error", err) }
  }
  if (typeof ctx.on === 'function') {
    ctx.effect(() => {
      ctx.on('settings/document-updated', onSettingsChanged)
      ctx.on('loader/volatile-update', onSettingsChanged)
      return () => {
        ctx.off?.('settings/document-updated', onSettingsChanged)
        ctx.off?.('loader/volatile-update', onSettingsChanged)
      }
    }, 'dsh-subscriptions: settings change listener')
  }

  Promise.resolve().then(async () => {
    reconcileSlots().catch((err) => {
      if (logger && logger.warn) logger.warn('[dsh-subscriptions] reconcileSlots initial error: ' + (err && err.message || err))
    })
    const logged = await store.loggedInProviders().catch(() => [])
    if (logged.some((provider) => provider === 'codex' || provider === 'claude')) {
      refreshClientVersions({ fetchImpl: fetch }).catch(() => {})
    }
  })

  const fetchForRef = (ref) => {
    const parsed = parseOauthRef(ref)
    if (!parsed) return null
    const slot = normalizeSlots(live().slots).find((s) => s.provider === parsed.provider && s.index === parsed.index)
    if (!slot || !slot.proxyUrl) return null
    const proxied = proxyFetch(slot.proxyUrl)
    if (!proxied) return null
    const bypass = Array.isArray(slot.proxyBypass) ? slot.proxyBypass : []
    if (!bypass.length) return proxied
    return (url, init) => shouldBypassProxy(bypass, String(url)) ? fetch(url, init) : proxied(url, init)
  }

  const redirectFor = createRedirectFor({ ctx, live, vendorConfig, getVendor })

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
  const historyDir = resolveHistoryDir()
  const history = new HistoryStore(historyDir, 7 * 24 * 60 * 60 * 1000, 1000)
  if (typeof ctx?.on === 'function') {
    ctx.on('dispose', () => history.dispose())
  }
  const recordHistory = (entry) => history.add(entry)

  registerCodexWebSearch(ctx, { store, live, fetch, fetchForRef, vendorConfig })

  // #85: host-only reset credit service for Codex accounts.
  const resetCredits = createResetCreditService({ loadBlob: (ref) => store.loadBlob(ref) })
  function refForSlot(provider, indexOrAlias) {
    return resolveAccountRef(normalizeSlots(live().slots), provider, indexOrAlias)
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
      try {
        if (ctx.llm && typeof ctx.llm.registerAdapter === 'function') {
          // #namespaced: keep the local provider distinct when another plugin
          // already owns the bare `ollama` route.
          const namespaced = Boolean(cfg.namespacedRoutes)
          ollamaHandle = ctx.llm.registerAdapter(
            [namespaced ? subscriptionRoute('ollama') : 'ollama'],
            namespaced ? new NamespacedAdapter(ollamaAdapter) : ollamaAdapter,
          )
        }
      } catch (err) { ignoreError("index.js: already registered elsewhere", err) }
    } else if (!alive && ollamaHandle) {
      try { ollamaHandle() } catch (err) { ignoreError("index.js: already gone", err) }
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
    } catch (err) { ignoreError("index.js: best-effort", err) }
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
    getSettingsApi,
    describeRow,
    syncCustomVendors,
    syncOllama,
    stripLegacySlots,
    ollamaFallback: ollamaFallbackStream,
  })
  const { syncAdapter, reconcileSlots, refreshModels, cascadeFallbackStream } = adapterManager
  adapterManager.registerAdapterLifecycle()

  const subscriptions = createSubscriptionsService({
    live,
    listAccounts: (provider) => store.listAccounts(provider),
    loadBlob: (ref) => store.loadBlob(ref),
    ensureFresh: (provider, blob, ref) => store.ensureFresh(provider, blob, ref),
    vendorConfig: (provider) => vendorConfig(provider, live()),
    cooldownMs: () => live().cooldownMs,
    drainBeforeReset: () => live().drainBeforeReset,
    drainSafetyPercent: () => live().drainSafetyPercent,
    switchAtRemaining: () => live().switchAtRemaining,
    rememberCooldown: (ref, until, families) => store.rememberCooldown(ref, until, families),
    rememberQuarantine: (ref, reason, until, attempts) => store.rememberQuarantine(ref, reason, until, attempts),
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
      const loggedList = Array.isArray(logged) ? logged : Object.keys(logged || {}).filter((name) => logged[name])
      return ['codex', 'grok'].filter((name) => loggedList.includes(name))
    },
    sizes: IMAGE_SIZES,
    async generate(request) {
      const provider = request && request.provider
      if (provider !== 'codex' && provider !== 'grok') {
        throw new Error(`unknown subscription provider: ${provider}`)
      }
      const accounts = await store.listAccounts(provider)
      const mediaPool = live().mediaPoolEnabled !== false
      const onlyRef = mediaPool ? null : defaultAccountRef(live().slots, provider)
      const eligible = pickAccount(accounts || [], Date.now(), {
        family: provider === 'codex' ? 'gpt' : 'grok',
        drainBeforeReset: live().drainBeforeReset,
        drainSafetyPercent: live().drainSafetyPercent,
        ...(onlyRef ? { onlyRef } : {}),
      })
      const slot = eligible || (accounts || []).find((row) => row && row.ref && row.hasToken && !poolBlockReason(row, {}) && (!onlyRef || row.ref === onlyRef))
      if (!slot) throw new Error(`not logged in to ${provider}: sign in in the Subscriptions section`)
      const raw = await store.resolveRaw(slot.ref)
      if (!raw) throw new Error(`not logged in to ${provider}: sign in in the Subscriptions section`)
      const session = await store.ensureFresh(provider, parseBlob(raw), slot.ref)
      const fetchFn = (typeof fetchForRef === 'function' && fetchForRef(slot.ref)) || fetch
      return generateOnce({
        provider,
        prompt: request.prompt,
        size: request.size,
        quality: request.quality,
        referenceImages: request.referenceImages,
        session,
        fetchImpl: fetchFn,
        signal: request.signal,
      })
    },
  }), 'dsh-subscriptions: image generation service')
  ctx.effect(() => registerSubscriptionTools(ctx, {
    subscriptions,
    images: () => ctx.subscriptionImages,
    attachments: () => (typeof ctx.get === 'function' ? ctx.get('attachments') : null),
  }, { enabled: live().nativeTools || process.env.DSH_SUBSCRIPTIONS_NATIVE_TOOLS === '1' }), 'dsh-subscriptions: native tools')
  ctx.effect(() => () => clearSessionPins(), 'dsh-subscriptions: session pins cleanup')

  const pending = new Map()

  function sweepPending(now) {
    sweepExpiredPending(pending, now, PENDING_TTL_MS)
  }

  ctx.effect(() => {
    const id = setInterval(() => sweepPending(Date.now()), 60 * 1000)
    if (id && typeof id.unref === 'function') id.unref()
    return () => clearInterval(id)
  }, 'dsh-subscriptions: pending oauth sweep')

  async function completeOAuth({ provider, index, code, state }) {
    if (!state) throw new Error('missing oauth state')
    sweepPending(Date.now())
    const row = pending.get(state)
    if (!row || !row.verifier) throw new Error('login session expired or invalid state; start Connect again')
    if (provider && row.provider !== provider) throw new Error('state provider mismatch')
    if (index !== undefined && index !== null && Number(index) !== row.index) throw new Error('state index mismatch')
    const actualProvider = row.provider
    const n = row.index
    const ref = oauthRef(actualProvider, n)
    const cfg = { ...vendorConfig(actualProvider, live()), redirectUri: row.redirectUri }
    const blob = await getVendor(actualProvider).exchangeCode(cfg, {
      verifier: row.verifier,
      challenge: row.challenge,
      state: row.state,
    }, code, fetchForRef(ref) || fetch)
    const inspection = inspectScopes(actualProvider, blob.scopes)
    blob.scopes = inspection.scopes
    blob.scopeWarning = inspection.scopeWarning || ""
    const slots = normalizeSlots(live().slots)
    const slot = slots.find((s) => s.ref === ref)
    if (slot && slot.label) blob.label = slot.label
    let existing = {}
    try { existing = await store.loadBlob(ref) } catch (err) { ignoreError("index.js: no existing blob on fresh auth", err) }
    const merged = { ...existing, ...blob }
    await store.saveBlob(ref, merged)
    store.recordSuccess(ref)
    store.clearRefreshFailure(ref)
    store.clearCooldown(ref)
    pending.delete(row.state)
    await syncAdapter()
    refreshModels().catch(() => {})
    if (live().vaultSyncEnabled && live().vaultSyncAutoPush) {
      syncVaultPush({ live: live(), store }).catch(() => {})
    }
    return { ref, label: pmL(merged.label || merged.email) || displayName(actualProvider) }
  }

  // Privacy masking
  const privacyOn = () => !!live().privacyMask
  const pmE = (s) => privacyOn() ? maskEmail(s) : String(s || '')
  const pmL = (s) => privacyOn() ? maskLabel(s) : String(s || '')

  const heartbeatStats = { lastRunAt: 0, proactiveRefreshCount: 0 }
  const runProactiveHeartbeat = async () => {
    heartbeatStats.lastRunAt = Date.now()
    const cfg = live()
    const ahead = Number(cfg.refreshAheadMs) || 5 * 60 * 1000
    const retryMs = Number(cfg.refreshRetryMs) || 10 * 60 * 1000
    const now = Date.now()
    let refreshed = 0
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
        if (typeof store.shouldSkipRefresh === "function" && store.shouldSkipRefresh(ref, now, retryMs)) continue
        await store.ensureFresh(slot.provider, blob, ref).then(() => {
          refreshed++
          heartbeatStats.proactiveRefreshCount++
        }).catch((e) => {
          if (logger && logger.warn) logger.warn("[dsh-subscriptions] background refresh failed for " + ref + ": " + String(e && e.message || e))
        })
      } catch (err) { ignoreError("index.js: best-effort", err) }
    }
    return refreshed
  }

  const diagnosticsReport = () => createDiagnosticsReport({ live, store, history, NS, pkgVersion, heartbeatStats })
  const accountsView = () => createAccountsView({ live, store, fetch, pmL, pmE, history })

  registerBackgroundLoops(ctx, {
    live,
    store,
    fetch,
    fetchForRef,
    logger,
    runProactiveHeartbeat,
    isAuthError,
    notifySessionExpired,
    getVendor,
    vendorConfig,
    syncOllama,
    getVaultSyncStatus,
    syncVaultPull,
    getSettingsApi,
    syncAdapter,
    refreshModels,
    getRecentAlerts,
    isDigestDue,
    dispatchNotificationDigest,
  })

  registerRoutes(ctx, {
    NS,
    live,
    describeRow,
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
    triggerHeartbeat: runProactiveHeartbeat,
    pending,
    completeOAuth,
    fetchForRef,
    sweepPending,
    subscriptions,
    pmL,
    pmE,
  })
}
