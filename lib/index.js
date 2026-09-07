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
import { startLoopback } from './loopback.js'
import { OllamaAdapter, ollamaAlive, ollamaModels, ollamaBase } from './ollama.js'
import { createResetCreditService } from './reset-credits.js'
import { maskEmail, maskLabel, maskText } from './mask.js'
import { proxyFetch, pickFetch } from './proxy.js'
import { HistoryStore } from './history.js'
import { ProactiveTokenRefreshDaemon } from './proactive-refresh.js'
import {
  inspectGoogleAccount,
  antigravityMetadata,
  antigravityIdentityHeaders,
} from './code-assist.js'

export const name = '@goodandready/dsh-subscriptions'
export const inject = ['llm', 'credentials', 'webServer', 'settings']

const NS = 'dsh-subscriptions'

let pkgVersion = ''
try { pkgVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version || '' } catch {}
const PENDING_TTL_MS = 15 * 60 * 1000

function redirectFor(provider, cfg, origin) {
  const overlay = vendorConfig(provider, cfg)
  if (cfg.useWebCallback) return webCallbackUri(origin)
  return overlay.redirectUri || webCallbackUri(origin)
}

const OK_HTML = '<!doctype html><meta charset="utf-8"><title>Subscriptions</title><p>Signed in. You can close this tab and return to Settings.</p>'

export function apply(ctx, config) {
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

  // Регистрация кастомных вендоров из Config. Вызывается при старте и при
  // каждой смене конфига (replace) — реестр пересобирается с нуля.
  function syncCustomVendors() {
    let profiles
    try {
      profiles = (live().customVendors || []).map(validateProfile)
    } catch (e) {
      try { ctx.log && ctx.log.warn && ctx.log.warn('[dsh-subscriptions] customVendors: ' + String(e && e.message || e)) } catch {}
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
        try { ctx.log && ctx.log.warn && ctx.log.warn('[dsh-subscriptions] customVendors[' + profile.id + ']: ' + String(e && e.message || e)) } catch {}
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
      const label = win.ru || win.en || win.id
      try { ctx.log && ctx.log.warn && ctx.log.warn(`[dsh-subscriptions] ${provider} ${ref}: лимит ${label} на ${threshold}%`) } catch {}
      try { ctx.emit && ctx.emit('subscriptions.limit-notice', { provider, ref, window: win.id, usedPercent: win.usedPercent, threshold }) } catch {}
    },
  })
  const history = new HistoryStore()
  const recordHistory = (entry) => history.add(entry)

  // Proactive token refresh daemon: runs periodically and refreshes tokens nearing expiration
  const refreshDaemon = new ProactiveTokenRefreshDaemon({
    refreshLeadMs: 15 * 60 * 1000,
    checkIntervalMs: 60 * 1000,
  })
  refreshDaemon.start(
    async () => {
      const slots = normalizeSlots(live().slots)
      const accounts = []
      for (const slot of slots) {
        try {
          const raw = await store.resolveRaw(slot.ref)
          if (!raw) continue
          const blob = parseBlob(raw)
          if (blob && blob.refreshToken && blob.expiresAt) {
            accounts.push({
              ref: slot.ref,
              provider: slot.provider,
              refreshToken: blob.refreshToken,
              expiresAt: blob.expiresAt,
              blob,
            })
          }
        } catch {}
      }
      return accounts
    },
    async (acc) => {
      try {
        await store.ensureFresh(acc.provider, acc.blob, acc.ref)
      } catch (e) {
        try { ctx.log && ctx.log.warn && ctx.log.warn('[dsh-subscriptions] proactive refresh failed for ' + acc.ref + ': ' + String(e && e.message || e)) } catch {}
      }
    }
  )
  ctx.effect(() => () => refreshDaemon.stop(), 'dsh-subscriptions: proactive token refresh daemon')

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
    try { ctx.emit && ctx.emit('subscriptions.ollama-fallback', { provider, model, reason: err && err.code || 'EXHAUSTED' }) } catch {}
    try { ctx.log && ctx.log.warn && ctx.log.warn(`[dsh-subscriptions] ${provider}: все аккаунты исчерпаны (${err && err.code || 'EXHAUSTED'}), откат на ollama/${model}`) } catch {}
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
    } catch {}
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

  // Служба генерации картинок на подписке.
  //
  // Наружу отдаётся действие, а не токен: маршрут в сети раздавал бы живой
  // ключ доступа каждому, кто дотянется до харнесса, а служба живёт внутри
  // процесса и видна только другим плагинам. Обновлением токена по-прежнему
  // занимается один хозяин — этот плагин.
  ctx.effect(() => ctx.provide('subscriptions', subscriptions), 'dsh-subscriptions: subscriptions service')
  ctx.effect(() => ctx.provide('subscriptionImages', {
    /** Провайдеры, у которых есть вход прямо сейчас. */
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
        throw new Error(`неизвестный провайдер подписки: ${provider}`)
      }
      const accounts = await store.listAccounts(provider)
      const slot = (accounts || []).find((row) => row && row.ref)
      if (!slot) throw new Error(`нет входа в ${provider}: войдите в разделе «Подписки»`)
      const raw = await store.resolveRaw(slot.ref)
      if (!raw) throw new Error(`нет входа в ${provider}: войдите в разделе «Подписки»`)
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
  }), 'dsh-subscriptions: служба генерации картинок')
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
  async function syncAdapter() {
    const providers = await store.loggedInProviders()
    if (!handle && providers.length) {
      handle = ctx.llm.registerAdapter(providers, adapter)
      return
    }
    if (!handle) return
    if (!providers.length) {
      try { handle() } catch { /* already gone */ }
      handle = undefined
      return
    }
    try {
      handle.replace(providers)
    } catch {
      try { handle() } catch { /* disposed */ }
      handle = ctx.llm.registerAdapter(providers, adapter)
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
      } catch {}
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
      } catch {}
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
    // #75: eager refresh usage на старте, чтобы windows (5h/7d) появились в blob сразу
    // и активная подписка в чипе сразу показывала 5h/7d/..., а не ждала probeInterval.
    const eager = async () => {
      try {
        for (const slot of normalizeSlots(live().slots)) {
          store.refreshUsage(slot.provider).catch(() => {})
        }
      } catch {}
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
            try { ctx.log && ctx.log.warn && ctx.log.warn("[dsh-subscriptions] background refresh failed for " + ref + ": " + String(e && e.message || e)) } catch {}
          })
        } catch {}
      }
    }
    tick().catch(() => {})
    const timer = setInterval
    const clear = clearInterval
    const id = timer(() => { tick().catch(() => {}) }, 60 * 1000)
    return () => clear(id)
  }, 'dsh-subscriptions: refresh ahead')

  // Фоновый health-check: раз в N минут прогоняет дешёвый check по всем
  // подключённым аккаунтам. Мёртвые помечаются через describeRef, cooldown
  // не ставится (как в /check).
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
            try { ctx.log && ctx.log.warn && ctx.log.warn("[dsh-subscriptions] probe " + ref + ": " + String(e && e.message || e).slice(0, 200)) } catch {}
          })
        } catch {}
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
