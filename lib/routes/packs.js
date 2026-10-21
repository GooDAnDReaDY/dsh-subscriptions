import { isTrustedSettingsRequest, readBody, safeJsonHandler, writeJson } from '../http.js'
import { normalizeVendorPack } from '../vendor-pack.js'

export function registerPacksRoutes(ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/provider-packs/validate',
    handler: safeJsonHandler(async (req, res) => {
      if (req.method !== 'POST') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'POST only' } })
        return
      }
      if (!isTrustedSettingsRequest(req, ctx)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
        return
      }
      let body
      try { body = JSON.parse((await readBody(req, 64 * 1024)).toString('utf8') || '{}') } catch {
        writeJson(res, 400, { ok: false, error: { code: 'json', message: 'invalid json' } })
        return
      }
      const raw = body && body.pack && typeof body.pack === 'object' ? body.pack : body
      try {
        const pack = normalizeVendorPack(raw)
        writeJson(res, 200, {
          ok: true,
          pack: {
            id: pack.id,
            displayName: pack.displayName,
            baseUrl: pack.baseUrl,
            models: pack.models,
            scope: pack.scope,
            tokenStyle: pack.tokenStyle,
          },
        })
      } catch (err) {
        writeJson(res, 400, { ok: false, error: { code: 'pack', message: String(err && err.message || err) } })
      }
    }),
  }), 'dsh-subscriptions: /provider-packs/validate')
}
