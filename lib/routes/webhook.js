import { dispatchWebhookAlert } from '../alerts.js'
import { isTrustedSettingsRequest, safeJsonHandler, writeJson } from '../http.js'
import { validateWebhookUrl } from '../webhook-url.js'

export function registerWebhookRoutes(ctx, state) {
  const { live } = state
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/webhook/test',
    handler: safeJsonHandler(async (req, res) => {
      if (req.method !== 'POST') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'POST only' } })
        return
      }
      if (!isTrustedSettingsRequest(req, ctx)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
        return
      }
      const cfg = live()
      if (!cfg.webhookUrl) {
        writeJson(res, 400, { ok: false, delivered: false, error: { code: 'webhook', message: 'webhookUrl is not configured' } })
        return
      }
      const checked = validateWebhookUrl(cfg.webhookUrl, { allowPrivate: cfg.webhookAllowPrivate })
      if (!checked.ok) {
        writeJson(res, 400, { ok: false, delivered: false, error: { code: 'webhook', message: checked.reason } })
        return
      }
      const alert = {
        id: 'wh_test_' + Date.now().toString(36),
        type: 'webhook_test',
        ref: null,
        provider: 'dsh-subscriptions',
        message: 'DSH Subscriptions webhook test',
        severity: 'info',
        details: null,
        timestamp: Date.now(),
      }
      const delivered = await dispatchWebhookAlert(alert, cfg.webhookUrl, fetch, {
        secret: cfg.webhookSecret,
        allowPrivate: cfg.webhookAllowPrivate,
        retries: 1,
      })
      writeJson(res, delivered ? 200 : 502, { ok: delivered, delivered })
    }),
  }), 'dsh-subscriptions: /webhook/test')
}
