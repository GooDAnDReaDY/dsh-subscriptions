import { readFileSync } from 'node:fs'
import { publicConfig } from './config-schema.js'
import { PROVIDERS, displayName } from './refs.js'
import { escapeHtml, isLoopback, isTrustedSettingsRequest, writeHtml, writeJson } from './http.js'
import { registerStatusRoutes } from './routes/status.js'
import { registerOauthRoutes } from './routes/oauth.js'
import { registerAccountsRoutes } from './routes/accounts.js'
import { registerProxyRoutes } from './routes/proxy.js'
import { registerSourcesRoutes } from './routes/sources.js'
import { registerPacksRoutes } from './routes/packs.js'
import { registerWebhookRoutes } from './routes/webhook.js'
import { registerVaultRoutes } from './routes/vault.js'
import { registerMetricsRoutes } from './routes/metrics.js'
import { registerPluginUpdater } from './updater.js'

const CLIENT_CSS = readFileSync(new URL('./client.css', import.meta.url), 'utf8')

export function registerRoutes(ctx, state) {
  const {
    accountsView,
    live,
  } = state

  async function configResponse() {
    return {
      ok: true,
      config: publicConfig(live()),
      accounts: await accountsView(),
      providers: PROVIDERS.map((id) => ({ id, name: displayName(id) })),
    }
  }

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/client.css',
    handler: (req, res) => {
      if (req.method !== 'GET') {
        res.writeHead(405, { 'content-type': 'text/plain; charset=utf-8' })
        res.end('GET only')
        return
      }
      // #968: plugins update in place; a 5-minute cached stylesheet leaves the
      // new UI half-styled.
      res.writeHead(200, { 'content-type': 'text/css; charset=utf-8', 'cache-control': 'no-cache, must-revalidate' })
      res.end(CLIENT_CSS)
    },
  }), 'dsh-subscriptions: client css')

  ctx.effect(() => registerPluginUpdater(ctx, {
    endpoint: '/dsh-subscriptions/update',
    aliases: [
      '/api/@goodandready/dsh-subscriptions/update',
      '/api/dsh-subscriptions/update',
    ],
    packageName: '@goodandready/dsh-subscriptions',
    manifestUrl: new URL('../package.json', import.meta.url),
  }), 'dsh-subscriptions: /update')

  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: '/dsh-subscriptions/subscriptions',
    handler: async (req, res) => {
      if (req.method !== 'GET') {
        writeJson(res, 405, { ok: false, error: { code: 'method', message: 'GET only' } })
        return
      }
      const host = (req.headers.host || '').split(':')[0]
      const remote = req.socket?.remoteAddress
      if (!isLoopback(host) || (remote && !isLoopback(remote)) || !isTrustedSettingsRequest(req, ctx)) {
        writeHtml(res, 403, '<!doctype html><meta charset="utf-8"><p>Subscriptions overview is localhost-only.</p>')
        return
      }
      let cfg, accounts
      try {
        const out = await configResponse()
        cfg = out.config
        accounts = out.accounts || []
      } catch (e) {
        writeHtml(res, 500, '<!doctype html><meta charset="utf-8"><p>Failed to load: ' + escapeHtml(String(e && e.message || e)) + '</p>')
        return
      }
      const rows = accounts.map((a) => {
        const pct = a.usagePercent != null ? a.usagePercent : (a.quota && a.quota.usedPercent) || null
        const rem = a.quota && a.quota.remaining != null ? a.quota.remaining : null
        const lim = a.quota && a.quota.limit != null ? a.quota.limit : null
        const reset = a.quota && a.quota.resetAt ? new Date(a.quota.resetAt).toLocaleString() : ''
        const status = a.validationUrl ? 'verify' : (a.cooldownUntil && a.cooldownUntil > Date.now() ? 'cooldown' : (a.configured ? 'ok' : 'none'))
        return '<tr><td><b>' + escapeHtml(a.provider) + '</b></td><td>' + (a.index || 1) + '</td>' +
          '<td>' + escapeHtml(a.label || a.email || '—') + '</td><td><span class="status ' + status + '">' + status + '</span></td>' +
          '<td>' + (pct != null ? Math.round(pct) + '%' : '—') + '</td>' +
          '<td>' + (rem != null ? (rem + (lim != null ? '/' + lim : '')) : '—') + '</td>' +
          '<td>' + (reset ? escapeHtml(reset) : '—') + '</td><td>' + escapeHtml(a.refreshError || '—') + '</td></tr>'
      })
      const body = rows.length
        ? '<div class="table-scroll"><table class="sub-table"><thead><tr><th>Provider</th><th>Index</th><th>Account</th><th>Status</th><th>Usage</th><th>Remaining</th><th>Reset</th><th>Error</th></tr></thead><tbody>' + rows.join('') + '</tbody></table></div>'
        : '<p class="empty">No accounts connected yet.</p>'
      const slots = cfg.slots || []
      const connected = accounts.filter((a) => a.configured).length
      writeHtml(res, 200, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Subscriptions</title>
<style>
:root{color-scheme:light dark;--bg:#0d1117;--card-bg:#161b22;--border:#30363d;--text:#e6edf3;--dim:#8b949e;--ok-text:#3fb950;--ok-border:#238636;--warn-text:#d29922;--warn-border:#9e6a03}
@media (prefers-color-scheme:light){:root{--bg:#ffffff;--card-bg:#f6f8fa;--border:#d0d7de;--text:#1f2328;--dim:#656d76;--ok-text:#1a7f37;--ok-border:#1a7f37;--warn-text:#9a6700;--warn-border:#9a6700}}
body{font-family:system-ui,-apple-system,sans-serif;margin:0;padding:24px;background:var(--bg);color:var(--text)}
h1{font-size:20px;margin:0 0 6px 0} .dim{color:var(--dim);font-size:13px}
.stats{display:flex;gap:24px;margin:16px 0;font-size:13px}
.table-scroll{overflow-x:auto;border:1px solid var(--border);border-radius:8px;margin:16px 0;background:var(--card-bg)}
.sub-table{width:100%;border-collapse:collapse;text-align:left;font-size:13px}
.sub-table th,.sub-table td{padding:10px 14px;border-bottom:1px solid var(--border)}
.sub-table th{font-weight:600;color:var(--dim);background:var(--card-bg)}
.sub-table tr:last-child td{border-bottom:none}
.status{font-size:11px;padding:2px 8px;border-radius:999px;border:1px solid var(--border);display:inline-block}
.status.ok{color:var(--ok-text);border-color:var(--ok-border)} .status.none{color:var(--dim)}
.status.cooldown,.status.verify{color:var(--warn-text);border-color:var(--warn-border)}
.empty{color:var(--dim);font-style:italic}
a{color:#58a6ff;text-decoration:none} a:hover{text-decoration:underline}
</style></head><body>
<h1>Subscriptions</h1>
<div class="dim">/subscriptions — localhost only</div>
<div class="stats"><span><b>${connected}</b> connected</span><span><b>${accounts.length}</b> accounts</span><span><b>${slots.length}</b> slots</span></div>
${body}
<h2>History</h2>
<div class="dim">last 10 · <a href="/dsh-subscriptions/history?limit=100">show 100</a></div>
<div class="hist" id="hist"></div>
<script>
fetch('/dsh-subscriptions/history?limit=10').then(r=>r.json()).then(d=>{
  const el=document.getElementById('hist')
  if(!d||!d.items||!d.items.length){el.textContent='No requests yet.';return}
  el.innerHTML='<div class="table-scroll"><table class="sub-table"><thead><tr><th>time</th><th>provider</th><th>model</th><th>path</th><th>status</th></tr></thead><tbody>'+
    d.items.map(i=>'<tr><td>'+new Date(i.ts).toLocaleString()+'</td><td>'+esc(i.provider)+'</td><td>'+esc(i.model||'')+'</td><td>'+esc(i.path)+'</td><td>'+i.status+'</td></tr>').join('')+'</tbody></table></div>'
}).catch(function onHistoryError(e){if(typeof console!=='undefined'&&console.debug)console.debug('history fetch failed',e)})
function esc(x){return String(x==null?'':x).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
</script>
</body></html>`)
    },
  }), 'dsh-subscriptions: /subscriptions')

  registerStatusRoutes(ctx, state)
  registerOauthRoutes(ctx, state)
  registerAccountsRoutes(ctx, state)
  registerProxyRoutes(ctx, state)
  registerSourcesRoutes(ctx, state)
  registerPacksRoutes(ctx)
  registerWebhookRoutes(ctx, state)
  registerVaultRoutes(ctx, state)
  registerMetricsRoutes(ctx, state)
}
