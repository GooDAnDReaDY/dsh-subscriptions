import { getRecentAlerts } from '../alerts.js'
import { isLoopback, isTrustedSettingsRequest } from '../http.js'
import { formatMetrics } from '../metrics.js'
import { collectSourceChain } from './sources.js'

export function registerMetricsRoutes(ctx, state) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/metrics',
    handler: async (req, res) => {
      if (req.method !== 'GET') {
        res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' })
        res.end('method not allowed\n')
        return
      }
      if (!isLoopback(req) && !isTrustedSettingsRequest(req, ctx)) {
        res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' })
        res.end('forbidden\n')
        return
      }
      const accounts = await state.accountsView().catch(() => [])
      const sources = await collectSourceChain(state, req.socket && req.socket.localPort)
      const text = formatMetrics({
        accounts,
        rows: typeof state.history?.all === 'function' ? state.history.all() : [],
        alerts: getRecentAlerts(1000),
        sources,
      })
      res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4; charset=utf-8' })
      res.end(text)
    },
  }), 'dsh-subscriptions: /metrics')
}
