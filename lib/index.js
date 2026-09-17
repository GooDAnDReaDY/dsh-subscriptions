import { bestEffort } from './utils.js'
export { Config, publicConfig, Slot, defaultSlots } from './config-schema.js'
import { Config, publicConfig } from './config-schema.js'
import { registerRoutes } from './routes.js'
import { analyzeSessionEvents } from './analyze-session.js'
import { discoverLocalCliSessions, loadLocalCliBlob } from './import-auth.js'
import { readFileSync } from 'node:fs'
import z from '@deepseek-ai/schemastery'
import { PROVIDERS, oauthRef, parseOauthRef, isProvider, displayName, droppedCredentialRefs } from './refs.js'
import { createPkce } from './pkce.js'
import { parseCallbackInput, requestOrigin, webCallbackUri } from './oauth.js'
import { writeJson, writeHtml, readBody, isTrustedSettingsRequest, queryOf } from './http.js'
import { getVendor, registerCustomVendor, clearCustomVendors } from './vendors/index.js'
import { SubscriptionAdapter } from './adapter.js'
import { generateOnce, SIZES as IMAGE_SIZES } from './images.js'
import { parseBlob } from './blob.js'
import { createVendorFromProfile, validateProfile } from './vendor-factory.js'
import { registerCustomProviderIds, registerDisplayName } from './refs.js'
import { createSubscriptionsService } from './subscriptions.js'
import { encryptWithPassphrase, decryptWithPassphrase } from './crypto.js'
import { quotaSnapshot } from './ratelimit.js'
import { createAccountStore, normalizeSlots, vendorConfig } from './accounts.js'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { startLoopback } from './loopback.js'
import { OllamaAdapter, ollamaAlive, ollamaModels, ollamaBase } from './ollama.js'
import { createResetCreditService } from './reset-credits.js'
import { maskEmail, maskLabel, maskText } from './mask.js'
import { proxyFetch, pickFetch } from './proxy.js'
import { HistoryStore } from './history.js'
import {
  inspectGoogleAccount,
  antigravityMetadata,
  antigravityIdentityHeaders,
} from './code-assist.js'

export const name = '@goodandready/dsh-subscriptions'
export const inject = ['llm', 'credentials', 'webServer', 'settings']

const NS = 'dsh-subscriptions'

let pkgVersion = ''
try { pkgVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version || '' } catch (err) { /* ignore package read errors at startup */ }
const PENDING_TTL_MS = 15 * 60 * 1000

function redirectFor(provider, cfg, origin) {
  const overlay = vendorConfig(provider, cfg)
  if (cfg.useWebCallback) return webCallbackUri(origin)
  return overlay.redirectUri || webCallbackUri(origin)
}

const OK_HTML = '<!doctype html><meta charset="utf-8"><title>Subscriptions</title><p>Signed in. You can close this tab and return to Settings.</p>'

export function apply(ctx, config) {
  const logger = ctx.logger ? ctx.logger('subscriptions') : console
  let getConfig = () => config
  let settingsApi
  ctx.inject(['settings'], (sctx) => {
    const scope = sctx.settings.register(NS, Config, { base: config })
    settingsApi = scope
    getConfig = () => scope.get() ?? config
    sctx.effect(() => () => {
      settingsApi = undefined
      getConfig = () => config
    })
  })

  // Registering custom vendors from Config. Runs at startup and on
  // every config change (replace) - the registry is rebuilt from scratch.
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

  const live = () => Config(structuredClone(getConfig() ?? {})) ?? config
  syncCustomVendors()

  // #88: fetch bound to the per-account proxy (slot.proxyUrl), or null for direct.
  const fetchForRef = (ref) => {
    const parsed = parseOauthRef(ref)
    if (!parsed) return null
    const slot = normalizeSlots(live().slots).find((s) => s.provider === parsed.provider && s.index === parsed.index)
    if (!slot || !slot.proxyUrl) return null
    return proxyFetch(slot.proxyUrl)
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
  const history = new HistoryStore()
  const recordHistory = (entry) => history.add(entry)

  // #85: host-only reset credit service for Codex accounts.
  const resetCredits = createResetCreditService({ loadBlob: (ref) => store.loadBlob(ref) })
  function refForSlot(provider, index) {
    const slot = normalizeSlots(live().slots).find((s) => s.provider === provider && s.index === index)
    return slot ? slot.ref : null
  }

  // #91: local Ollama - native provider + seamless fallback when the whole
  // pool is exhausted and nothing has been streamed yet.
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
    } catch (err) { if (logger && logger.debug) logger.debug('[history] fallback record failed: ' + (err && err.message || err)) }
    yield* ollamaAdapter.stream({ ...options, provider: 'ollama', model })
  }

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
    hideDeprecatedModels: () => !!live().hideDeprecatedModels,
  })

  // Subscription-backed image generation service.
  //
  // An action is exposed, not a token: a network route would hand a live
  // access key to anyone reaching the harness, while the service lives inside
  // the process and is visible only to sibling plugins. Token refresh stays
  // with a single owner - this plugin.
  ctx.effect(() => ctx.provide('subscriptions', subscriptions), 'dsh-subscriptions: subscriptions service')
  ctx.effect(() => ctx.provide('subscriptionImages', {
    /** Providers with an active session right now. */
    async available() {
      const logged = await store.loggedInProviders()
      return ['codex', 'grok'].filter((name) => logged && logged[name])
    },
    sizes: IMAGE_SIZES,
    /**
     * @param request {{provider, prompt, size, quality, signal}}
     * @returns [{ b64_json, revisedPrompt? }]
     */
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
  const adapter = new SubscriptionAdapter({
    listAccounts: (provider) => store.listAccounts(provider),
    loadBlob: (ref) => store.loadBlob(ref),
    ensureFresh: (provider, blob, ref) => store.ensureFresh(provider, blob, ref),
    vendorConfig: (provider) => vendorConfig(provider, live()),
    cooldownMs: () => live().cooldownMs,
    switchAtRemaining: () => live().switchAtRemaining,
    rememberCooldown: (ref, until, families) => store.rememberCooldown(ref, until, families),
    rememberQuarantine: (ref, reason, until) => store.rememberQuarantine(ref, reason, until),
    rememberQuota: (ref, snap) => store.rememberQuota(ref, snap),
    getQuota: (ref) => store.getQuota(ref),
    refreshUsage: (provider) => store.refreshUsage(provider),
    saveBlob: (ref, blob) => store.saveBlob(ref, blob),
    recordHistory,
    fetchImpl: fetch,
    fetchForRef,
  })

  let handle
  // PATCH: register each provider individually, skipping any that another
  // plugin already owns. The original code passed the whole list to
  // registerAdapter(), which is all-or-nothing (dsh-llm throws
  // DUPLICATE_ADAPTER on the first collision). On the web bundle, antigravity
  // is owned by a sibling plugin; the batch throw left codex/claude unbound.
  async function syncAdapter() {
    const providers = await store.loggedInProviders()
    if (!handle && providers.length) {
      const existing = new Set(ctx.llm.listProviders().map((p) => p.id))
      const claimable = providers.filter((p) => !existing.has(p))
      const skipped = providers.filter((p) => existing.has(p))
      if (skipped.length) try { console.info(`[dsh-subscriptions] syncAdapter skipping already-bound providers: ${skipped.join(',')}`) } catch {}
      if (claimable.length) handle = ctx.llm.registerAdapter(claimable, adapter)
      return
    }
    if (!handle) return
    if (!providers.length) {
      try { handle() } catch { /* already gone */ }
      handle = undefined
      return
    }
    try {
      const existing = new Set(ctx.llm.listProviders().map((p) => p.id))
      const ownedByUs = new Set(providers)
      // Drop providers we've lost ownership of (claimed by another plugin).
      const replaceable = providers.filter((p) => !existing.has(p) || ownedByUs.has(p))
      handle.replace(replaceable)
    } catch {
      try { handle() } catch { /* disposed */ }
      const existing = new Set(ctx.llm.listProviders().map((p) => p.id))
      const claimable = providers.filter((p) => !existing.has(p))
      handle = claimable.length ? ctx.llm.registerAdapter(claimable, adapter) : undefined
    }
  }

  // #46: after a login lands, eagerly refresh the live model catalog so the
  // model picker shows the new provider within ~1 min instead of waiting.
  let lastModelRefresh = 0
  async function refreshModels() {
    if (Date.now() - lastModelRefresh < 60 * 1000) return
    lastModelRefresh = Date.now()
    const providers = await store.loggedInProviders()
    for (const provider of providers) {
      try {
        const slot = normalizeSlots(live().slots).find((x) => x.provider === provider)
        if (!slot) continue
        const blob = await store.loadBlob(slot.ref).catch(() => null)
        if (!blob) continue
        const fresh = await store.ensureFresh(provider, blob, slot.ref)
        const cfg = vendorConfig(provider, live())
        await getVendor(provider).listModels(fresh, cfg, fetch).catch(() => {})
      } catch (err) { /* best-effort */ }
    }
  }

  function sweepPending(now) {
    for (const [state, row] of pending) {
      if (now - row.createdAt > PENDING_TTL_MS) pending.delete(state)
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

  async function enrichAntigravityAccount(slot, info) {
    if (!info.configured || slot.provider !== 'antigravity') return info
    let blob
    try { blob = await store.loadBlob(slot.ref) } catch { return info }
    if (blob.validationUrl) {
      return {
        ...info,
        validationUrl: blob.validationUrl,
        validationMessage: blob.validationMessage || info.validationMessage || '',
        paidTierName: blob.paidTierName || info.paidTierName || '',
      }
    }
    try {
      const fresh = await store.ensureFresh(slot.provider, blob, slot.ref)
      const probe = await inspectGoogleAccount(fetch, fresh.accessToken, {
        metadata: antigravityMetadata(fresh.projectId || ''),
        extraHeaders: antigravityIdentityHeaders(fresh.projectId || ''),
        projectId: fresh.projectId,
      })
      const next = { ...fresh }
      if (probe.projectId && probe.projectId !== fresh.projectId) next.projectId = probe.projectId
      if (probe.paidTierId) next.paidTierId = probe.paidTierId
      if (probe.paidTierName) next.paidTierName = probe.paidTierName
      if (probe.validation?.validationUrl) {
        next.validationUrl = probe.validation.validationUrl
        next.validationMessage = probe.validation.message || ''
        await store.saveBlob(slot.ref, next)
        return {
          ...info,
          validationUrl: next.validationUrl,
          validationMessage: next.validationMessage,
          paidTierName: next.paidTierName || '',
        }
      }
      if (probe.notice?.message) {
        next.accountNotice = probe.notice.message
        await store.saveBlob(slot.ref, next)
        return { ...info, accountNotice: next.accountNotice, paidTierName: next.paidTierName || '' }
      }
      if (probe.projectId || probe.paidTierId) await store.saveBlob(slot.ref, next)
      return { ...info, paidTierName: next.paidTierName || info.paidTierName || '' }
    } catch { /* keep settings responsive */ }
    return info
  }

  function stripLegacySlots(slots) {
    return (slots || []).filter((slot) => isProvider(slot.provider))
  }

  // #98: privacy masking. pmE for raw emails, pmL for display labels (only email-looking ones masked).
  const privacyOn = () => !!live().privacyMask
  const pmE = (s) => privacyOn() ? maskEmail(s) : String(s || '')
  const pmL = (s) => privacyOn() ? maskLabel(s) : String(s || '')

  // #99: anonymized diagnostics report. No tokens, emails, refs, proxy URLs.
  function scrubReport(v) {
    if (typeof v === 'string') return maskText(v)
    if (Array.isArray(v)) return v.map(scrubReport)
    if (v && typeof v === 'object') {
      const o = {}
      for (const k of Object.keys(v)) o[k] = scrubReport(v[k])
      return o
    }
    return v
  }

  async function diagnosticsReport() {
    const cfg = live()
    const slots = normalizeSlots(cfg.slots)
    const mk = () => ({ loggedIn: false, slots: 0, configured: 0, cooldown: 0, proxy: 0, maxUsagePercent: null })
    const providers = {}
    for (const p of PROVIDERS) providers[p] = mk()
    const logged = await store.loggedInProviders()
    for (const slot of slots) {
      const pv = providers[slot.provider] || (providers[slot.provider] = mk())
      pv.slots++
      if (slot.proxyUrl) pv.proxy++
      try {
        const info = await store.describeRef(slot.ref)
        if (info.configured) pv.configured++
        if (info.cooldownUntil && info.cooldownUntil > Date.now()) pv.cooldown++
        if (info.usagePercent != null) pv.maxUsagePercent = Math.max(pv.maxUsagePercent || 0, Math.round(info.usagePercent))
      } catch (err) { /* best-effort */ }
    }
    for (const p of Object.keys(providers)) providers[p].loggedIn = logged.includes(p)
    const rows = history.all()
    const byStatus = {}
    for (const r of rows) {
      const k = (r.provider || '?') + ':' + (r.status || '?')
      byStatus[k] = (byStatus[k] || 0) + 1
    }
    const lastErrors = rows.filter((r) => r.status && r.status >= 400).slice(0, 10)
      .map((r) => ({ ts: r.ts, provider: r.provider, status: r.status, kind: r.kind || 'request', ms: r.ms || null }))
    return scrubReport({
      generatedAt: new Date().toISOString(),
      plugin: NS + (pkgVersion ? ' v' + pkgVersion : ''),
      runtime: { node: process.version, platform: process.platform, arch: process.arch, uptimeSec: Math.round(process.uptime()) },
      providers,
      requests: { total: rows.length, byStatus, lastErrors },
      settings: {
        cooldownMs: cfg.cooldownMs,
        switchAtRemaining: cfg.switchAtRemaining,
        probeIntervalMin: cfg.probeIntervalMin,
        useWebCallback: !!cfg.useWebCallback,
        autoLoopback: !!cfg.autoLoopback,
        privacyMask: !!cfg.privacyMask,
        customVendors: Array.isArray(cfg.customVendors) ? cfg.customVendors.length : 0,
        proxySlots: slots.filter((s) => s.proxyUrl).length,
      },
    })
  }

  async function accountsView() {
    const out = []
    for (const slot of normalizeSlots(live().slots)) {
      const info = await enrichAntigravityAccount(slot, await store.describeRef(slot.ref))
      out.push({
        provider: slot.provider,
        index: slot.index,
        ref: slot.ref,
        label: pmL(slot.label || info.label),
        configured: info.configured,
        writable: info.writable,
        cooldownUntil: info.cooldownUntil,
        // #303: expose the cooldown scope and quarantine so the card can
        // explain why only some models are blocked.
        cooldownFamilies: info.cooldownFamilies || null,
        quarantineUntil: info.quarantineUntil || 0,
        quarantineReason: info.quarantineReason || null,
        usagePercent: info.usagePercent,
        quota: info.quota || null,
        usage: info.usage || null,
        requests: store.getRequestCount(slot.ref) || null,
        refreshError: info.refreshError || '',
        validationUrl: info.validationUrl || '',
        validationMessage: info.validationMessage || '',
        accountNotice: info.accountNotice || '',
        paidTierName: info.paidTierName || '',
      })
    }
    return out
  }

  async function configResponse() {
    return {
      ok: true,
      config: publicConfig(live()),
      accounts: await accountsView(),
      providers: PROVIDERS.map((id) => ({ id, name: displayName(id) })),
    }
  }

  ctx.effect(() => {
    syncAdapter().catch(() => { /* first paint */ })
    syncOllama().catch(() => { /* first paint */ })
    // Reconcile declared slots against vault credentials. Older Subs versions
    // (and the Connect flow that loses slots when config resets) leave vault
    // entries like CODEX_OAUTH_2..N without a corresponding slot row, so they
    // never appear in loggedInProviders(). Discover them and inject slots
    // through settings.update({ slots }).
    const reconcileSlots = async () => {
      // Wait until ctx.inject(['settings']) has populated settingsApi. The LLM
      // adapter effect runs synchronously inside apply(), but the settings
      // service registers itself asynchronously; if reconcileSlots runs first,
      // settingsApi is still undefined and the update silently no-ops.
      for (let i = 0; i < 30; i++) {
        if (settingsApi && typeof settingsApi.update === 'function') break
        await new Promise((r) => setTimeout(r, 200))
      }
      try {
        const creds = ctx.credentials
        if (!creds || typeof creds.describe !== 'function') { try { console.info('[dsh-subscriptions reconcile] no credentials service') } catch {} ; return }
        if (!settingsApi || typeof settingsApi.update !== 'function') { try { console.info('[dsh-subscriptions reconcile] no settingsApi after wait') } catch {} ; return }
        const providers = ['codex', 'claude', 'grok']
        const existing = normalizeSlots(live().slots)
        const existingRefs = new Set(existing.map((s) => s.ref))
        const additions = []
        const probes = []
        for (const provider of providers) {
          for (let index = 1; index <= 10; index++) {
            const ref = oauthRef(provider, index)
            if (existingRefs.has(ref)) continue
            let d
            try { d = await creds.describe(credentialRef(ref)) } catch (e) { probes.push(`${provider}#${index}=ERR(${e && e.message})`); continue }
            probes.push(`${provider}#${index}=${d && d.configured ? 'configured' : 'absent'}`)
            if (d && d.configured) additions.push({ provider, index })
          }
        }
        try { console.info(`[dsh-subscriptions reconcile] probes: ${probes.join(', ')}`) } catch {}
        if (!additions.length) return
        try { console.info(`[dsh-subscriptions reconcile] adding slots: ${additions.map((a) => `${a.provider}#${a.index}`).join(', ')}`) } catch {}
        const currentSlots = Array.isArray(live().slots) ? live().slots : []
        const newSlots = [...currentSlots, ...additions]
        await settingsApi.update({ slots: newSlots })
        try { console.info('[dsh-subscriptions reconcile] settings updated; retriggering syncAdapter') } catch {}
        syncAdapter().catch(() => {})
      } catch (e) {
        try { console.info('[dsh-subscriptions reconcile] failed: ' + (e && e.message)) } catch {}
      }
    }
    reconcileSlots()
    // Retry syncAdapter until at least codex/claude/grok are bound. The
    // first-paint call may run before sibling plugins finish registering
    // their providers, so providers that another plugin owns (antigravity)
    // must be skipped on a later attempt — see syncAdapter's PATCH note.
    let retries = 0
    const retrySync = () => {
      const registered = ctx.llm && ctx.llm.listProviders
        ? ctx.llm.listProviders().map((p) => p.id)
        : []
      const want = ['codex', 'claude', 'grok'].filter((p) => registered.indexOf(p) === -1)
      if (want.length === 0 || retries >= 30) return
      retries += 1
      syncAdapter().catch(() => {})
      setTimeout(retrySync, 1000)
    }
    setTimeout(retrySync, 1000)
    // #75: eager usage refresh at startup so the windows (5h/7d) land in the blob immediately
    // and the active subscription chip shows 5h/7d/... right away instead of waiting for probeInterval.
    const eager = async () => {
      try {
        for (const slot of normalizeSlots(live().slots)) {
          store.refreshUsage(slot.provider).catch(() => {})
        }
      } catch (err) { /* best-effort */ }
    }
    eager()
    return () => {
      if (handle) {
        try { handle() } catch { /* ignore */ }
        handle = undefined
      }
    }
  }, 'dsh-subscriptions: llm adapter')
  // ponytail: background refresh ahead of expiry, single timer, per-account lock + retry backoff
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
            if (logger && logger.warn) logger.warn("[dsh-subscriptions] background refresh failed for " + ref + ": " + String(e && e.message || e))
          })
        } catch (err) { /* best-effort */ }
      }
    }
    tick().catch(() => {})
    const timer = setInterval
    const clear = clearInterval
    const id = timer(() => { tick().catch(() => {}) }, 60 * 1000)
    return () => clear(id)
  }, 'dsh-subscriptions: refresh ahead')

  // Background health-check: every N minutes runs a cheap check across all
  // connected accounts. Dead ones are flagged via describeRef, no cooldown
  // is set (same as /check).
  ctx.effect(() => {
    const tick = async () => {
      const cfg = live()
      const mins = Number(cfg.probeIntervalMin)
      if (!Number.isFinite(mins) || mins <= 0) return
      const now = Date.now()
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
          const probeFetch = async (u, i) => fetch(u, i)
          await vendor.check(fresh, cfg2, probeFetch).catch((e) => {
            if (logger && logger.warn) logger.warn("[dsh-subscriptions] probe " + ref + ": " + String(e && e.message || e).slice(0, 200))
          })
        } catch (err) { /* best-effort */ }
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
