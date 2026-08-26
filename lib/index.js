import z from '@deepseek-ai/schemastery'
import { PROVIDERS, oauthRef, isProvider, displayName, droppedCredentialRefs } from './refs.js'
import { createPkce } from './pkce.js'
import { parseCallbackInput, requestOrigin, webCallbackUri } from './oauth.js'
import { writeJson, writeHtml, readBody, isTrustedSettingsRequest, queryOf } from './http.js'
import { getVendor } from './vendors/index.js'
import { SubscriptionAdapter } from './adapter.js'
import { generateOnce, SIZES as IMAGE_SIZES } from './images.js'
import { parseBlob } from './blob.js'
import { createSubscriptionsService } from './subscriptions.js'
import { quotaSnapshot } from './ratelimit.js'
import { createAccountStore, normalizeSlots, vendorConfig } from './accounts.js'
import {
  inspectGoogleAccount,
  antigravityMetadata,
  antigravityIdentityHeaders,
} from './code-assist.js'

export const name = 'dsh-subscriptions'
export const inject = ['llm', 'credentials', 'webServer', 'settings']

const NS = 'dsh-subscriptions'
const PENDING_TTL_MS = 15 * 60 * 1000

const Slot = z.object({
  provider: z.string().default('codex')
    .description('One of: codex, claude, grok, antigravity.'),
  index: z.number().default(1)
    .description('Account slot number. Credential ref is <PROVIDER>_OAUTH_<index>.'),
  label: z.string().default('')
    .description('Optional display label. Empty uses the account email after login.'),
})

const defaultSlots = PROVIDERS.map((provider) => ({ provider, index: 1, label: '' }))

export const Config = z.object({
  cooldownMs: z.number().default(30 * 60 * 1000)
    .description('After RATE_LIMIT/QUOTA/429, skip that account for this many milliseconds.'),
  switchAtRemaining: z.number().default(0.01)
    .description('If remaining <= this (absolute or <1 fraction), treat as exhausted before request. 0 disables.'),
  refreshAheadMs: z.number().default(5 * 60 * 1000)
    .description('Background refresh when expiry within this many ms.'),
  refreshRetryMs: z.number().default(10 * 60 * 1000)
    .description('Do not retry background refresh more often than this after failure.'),
  slots: z.array(Slot).default(defaultSlots)
    .description('Account slots. Secrets are not stored here; only the credential ref names.'),
  useWebCallback: z.boolean().default(false)
    .description('When on, redirect_uri is this Web UI origin + /dsh-subscriptions/oauth/callback. When off, the vendor CLI registered redirect is used and you paste the redirected URL.'),
  codexClientId: z.string().default(''),
  codexRedirectUri: z.string().default(''),
  codexBaseUrl: z.string().default(''),
  claudeClientId: z.string().default(''),
  claudeRedirectUri: z.string().default(''),
  grokClientId: z.string().default(''),
  grokRedirectUri: z.string().default(''),
  grokBaseUrl: z.string().default(''),
  grokClientVersion: z.string().default('')
    .description('Grok CLI identity version header. Empty uses the built-in default.'),
  antigravityClientId: z.string().default(''),
  antigravityClientSecret: z.string().default(''),
  antigravityRedirectUri: z.string().default(''),
})

function publicConfig(cfg) {
  const clone = structuredClone(cfg)
  return clone
}

function redirectFor(provider, cfg, origin) {
  const overlay = vendorConfig(provider, cfg)
  if (cfg.useWebCallback) return webCallbackUri(origin)
  return overlay.redirectUri || webCallbackUri(origin)
}

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

  const live = () => Config(structuredClone(getConfig() ?? {})) ?? config
  const store = createAccountStore({ credentials: ctx.credentials, getConfig: live, fetchImpl: fetch })
  const subscriptions = createSubscriptionsService({
    listAccounts: (provider) => store.listAccounts(provider),
    loadBlob: (ref) => store.loadBlob(ref),
    ensureFresh: (provider, blob, ref) => store.ensureFresh(provider, blob, ref),
    vendorConfig: (provider) => vendorConfig(provider, live()),
    cooldownMs: () => live().cooldownMs,
    switchAtRemaining: () => live().switchAtRemaining,
    rememberCooldown: (ref, until) => store.rememberCooldown(ref, until),
    rememberQuota: (ref, snap) => store.rememberQuota(ref, snap),
    fetchImpl: fetch,
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
    rememberCooldown: (ref, until) => store.rememberCooldown(ref, until),
    rememberQuota: (ref, snap) => store.rememberQuota(ref, snap),
    getQuota: (ref) => store.getQuota(ref),
    refreshUsage: (provider) => store.refreshUsage(provider),
    saveBlob: (ref, blob) => store.saveBlob(ref, blob),
    fetchImpl: fetch,
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
    }, code, fetch)
    const slots = normalizeSlots(live().slots)
    const slot = slots.find((s) => s.ref === ref)
    if (slot && slot.label) blob.label = slot.label
    await store.saveBlob(ref, blob)
    pending.delete(row.state)
    await syncAdapter()
    return { ref, label: blob.label || blob.email || displayName(provider) }
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

  async function accountsView() {
    const out = []
    for (const slot of normalizeSlots(live().slots)) {
      const info = await enrichAntigravityAccount(slot, await store.describeRef(slot.ref))
      out.push({
        provider: slot.provider,
        index: slot.index,
        ref: slot.ref,
        label: slot.label || info.label,
        configured: info.configured,
        writable: info.writable,
        cooldownUntil: info.cooldownUntil,
        usagePercent: info.usagePercent,
        quota: info.quota || null,
        usage: info.usage || null,
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
      if (!settingsApi) {
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
        await settingsApi.replace(parsed)
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
      writeJson(res, 200, {
        ok: true,
        loggedIn: Object.fromEntries(PROVIDERS.map((id) => [id, logged.includes(id)])),
      })
    },
  }), 'dsh-subscriptions: /status')

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
      writeJson(res, 200, { ok: true, url, state: pkce.state, redirectUri })
    },
  }), 'dsh-subscriptions: /oauth/start')

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
          email: blob.email || '', label: blob.label || '', expiresAt: blob.expiresAt || null,
          quota: info.quota || null,
          error: { code: 'refresh', message: String(e && e.message || e) },
        })
        return
      }
      const vendor = getVendor(provider)
      if (typeof vendor.check !== 'function') {
        writeJson(res, 200, { ok: true, provider, index: payload.index, ref, email: blob.email || '', label: blob.label || '', expiresAt: blob.expiresAt || null, quota: info.quota || null })
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
        writeJson(res, 200, { ok: true, provider, index: payload.index, ref, email: blob.email || '', label: blob.label || '', expiresAt: blob.expiresAt || null, quota: capturedQuota || info.quota || null, usagePercent: info.usagePercent ?? null })
      } catch (e) {
        writeJson(res, 200, {
          ok: false, provider, index: payload.index, ref,
          email: blob.email || '', label: blob.label || '', expiresAt: blob.expiresAt || null,
          quota: capturedQuota || info.quota || null,
          error: { code: e && e.code ? e.code : 'VENDOR', message: String(e && e.message || e).slice(0, 300) },
        })
      }
    },
  }), 'dsh-subscriptions: /check')

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
        writeJson(res, 200, { ok: true, ref, accounts: await accountsView() })
      } catch (e) {
        writeJson(res, 400, { ok: false, error: { code: 'logout', message: String(e && e.message || e) } })
      }
    },
  }), 'dsh-subscriptions: /logout')
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
