import { Config, plainConfig, revisionOf } from '../config-schema.js'
import { errorMessage, isTrustedSettingsRequest, readBody, safeJsonHandler, writeJson } from '../http.js'
import { upsertPreset, findPreset, removePreset } from '../routing-presets.js'
import { setSessionPreset, clearSessionPreset } from '../preset-session.js'

// #1045 #1077: routing preset CRUD and session binding.
export function registerPresetRoutes(ctx, state) {
  const { live, getSettingsApi } = state

  // #1045: named routing presets (model + effort + account rule + fallback).
  // Listing needs no route of its own: presets are part of GET /config.
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/presets',
    handler: safeJsonHandler(async (req, res) => {
      if (!isTrustedSettingsRequest(req, ctx)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
        return
      }
      if (req.method !== 'POST') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'POST only' } })
        return
      }
      let payload
      try {
        payload = JSON.parse((await readBody(req, 16 * 1024)).toString('utf8') || '{}')
      } catch {
        writeJson(res, 400, { ok: false, error: { code: 'json', message: 'invalid json' } })
        return
      }
      const current = Array.isArray(live().routingPresets) ? live().routingPresets : []
      const result = payload && payload.remove
        ? removePreset(current, payload.remove)
        : upsertPreset(current, payload)
      if (!result.ok) {
        writeJson(res, 400, { ok: false, error: { code: 'PRESET', message: result.error } })
        return
      }
      const settings = getSettingsApi()
      if (!settings) {
        writeJson(res, 409, { ok: false, error: { code: 'NO_SETTINGS', message: 'settings service is unavailable' } })
        return
      }
      try {
        const parsed = plainConfig(Config({ ...live(), routingPresets: result.presets }))
        await settings.replace(parsed, revisionOf(settings))
      } catch (e) {
        writeJson(res, 400, { ok: false, error: { code: 'SAVE_FAILED', message: errorMessage(e) } })
        return
      }
      writeJson(res, 200, { ok: true, presets: result.presets, preset: result.preset || null })
    }),
  }), 'dsh-subscriptions: /presets')

  // #1045: apply a preset to a session (account rule is used immediately;
  // effort is returned so the client can reuse the session-reasoning route).
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/presets/apply',
    handler: safeJsonHandler(async (req, res) => {
      if (req.method !== 'POST') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'POST only' } })
        return
      }
      if (!isTrustedSettingsRequest(req, ctx)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
        return
      }
      let payload
      try {
        payload = JSON.parse((await readBody(req, 8 * 1024)).toString('utf8') || '{}')
      } catch {
        writeJson(res, 400, { ok: false, error: { code: 'json', message: 'invalid json' } })
        return
      }
      const sessionId = String((payload && payload.sessionId) || '')
      if (!sessionId) {
        writeJson(res, 400, { ok: false, error: { code: 'session', message: 'sessionId is required' } })
        return
      }
      const clearing = payload && (payload.clear === true || payload.id === '' || payload.id === null)
      if (clearing) {
        clearSessionPreset(sessionId)
        writeJson(res, 200, { ok: true, preset: null })
        return
      }
      const preset = findPreset(live().routingPresets, payload && (payload.id || payload.name))
      if (!preset) {
        writeJson(res, 404, { ok: false, error: { code: 'NOT_FOUND', message: 'preset not found' } })
        return
      }
      setSessionPreset(sessionId, preset)
      writeJson(res, 200, {
        ok: true,
        preset,
        effort: preset.effort || '',
        model: preset.model || '',
        fallbackChain: Array.isArray(preset.fallbackChain) ? preset.fallbackChain : [],
      })
    }),
  }), 'dsh-subscriptions: /presets/apply')
}
