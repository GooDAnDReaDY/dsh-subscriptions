import { Config, plainConfig, publicConfig, revisionOf } from '../config-schema.js'
import { isTrustedSettingsRequest, readBody, safeJsonHandler, writeJson } from '../http.js'
import { isProvider } from '../refs.js'
import { planNextSlot } from '../login-queue.js'

// #1040 #1077: chained-login slot reservation, split out of routes/accounts.js.
export function registerLoginRoutes(ctx, state) {
  const { live, getSettingsApi, stripLegacySlots, syncCustomVendors } = state

  // #1040: reserve the next free slot so the UI can chain logins without the
  // user creating slots by hand between OAuth rounds.
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/accounts/next-slot',
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
      const provider = String((payload && payload.provider) || '')
      if (!isProvider(provider)) {
        writeJson(res, 400, { ok: false, error: { code: 'provider', message: 'unknown provider' } })
        return
      }
      const plan = planNextSlot(live().slots, provider, { label: payload && payload.label })
      if (plan.exhausted) {
        writeJson(res, 409, { ok: false, error: { code: 'EXHAUSTED', message: 'all 99 slots are used for this provider' } })
        return
      }
      try {
        const curSlots = Array.isArray(live().slots) ? live().slots.slice() : []
        const exists = curSlots.some((s) => s && s.provider === provider && Number(s.index) === plan.index)
        if (!exists && getSettingsApi()) {
          const settings = getSettingsApi()
          const revision = revisionOf(settings)
          const nextSlots = curSlots.concat([{ provider, index: plan.index, label: plan.label }])
          const parsed = plainConfig(Config({ ...live(), slots: stripLegacySlots(nextSlots) }))
          await settings.replace(parsed, revision)
          syncCustomVendors()
        }
      } catch (e) {
        writeJson(res, 400, { ok: false, error: { code: 'SLOT_FAILED', message: String(e && e.message || e) } })
        return
      }
      writeJson(res, 200, {
        ok: true,
        provider,
        index: plan.index,
        ref: plan.ref,
        label: plan.label,
        config: publicConfig(live()),
      })
    }),
  }), 'dsh-subscriptions: /accounts/next-slot')
}
