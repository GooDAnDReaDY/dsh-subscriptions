import { isTrustedSettingsRequest, safeJsonHandler, writeJson } from '../http.js'
import { buildSourceChain, readKeyRotationStatus, subscriptionCandidate } from '../key-rotation-bridge.js'

export function registerSourcesRoutes(ctx, state) {
  const { accountsView, live } = state

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/sources',
    handler: safeJsonHandler(async (req, res) => {
      if (req.method !== 'GET') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'GET only' } })
        return
      }
      if (!isTrustedSettingsRequest(req, ctx)) {
        writeJson(res, 403, { ok: false, error: { code: 'forbidden', message: 'same-origin only' } })
        return
      }
      let subscriptions = []
      try {
        const rows = await accountsView()
        subscriptions = (rows || []).map(subscriptionCandidate)
      } catch { /* keep the chain available */ }
      const port = req.socket && req.socket.localPort
      const keyRotation = port
        ? await readKeyRotationStatus({ baseUrl: 'http://127.0.0.1:' + port })
        : { available: false, reason: 'no local port', providers: [], totalKeys: 0, healthyKeys: 0 }
      const chain = buildSourceChain({
        subscriptions,
        keyRotation,
        ollama: { available: live().ollamaFallback !== false },
      })
      writeJson(res, 200, {
        ok: true,
        keyRotation: {
          available: keyRotation.available,
          reason: keyRotation.reason || null,
          totalKeys: keyRotation.totalKeys,
          healthyKeys: keyRotation.healthyKeys,
        },
        ...chain,
      })
    }),
  }), 'dsh-subscriptions: /sources')
}
