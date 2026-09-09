// Slash commands extracted verbatim from client.js (#266).
import { refreshLoggedIn, hotState, ORDER } from './state.js'
export function makeSlash(deps) {
  const { NS, getT, fcObserve, fcEstimate, brandBadge } = deps
  const t = (...a) => getT()(...a)
    function registerSlashCommands(ctx) {
      ctx.effect(() => {
        const triggers = ctx.get('inputTriggers')
        if (!triggers) return () => {}
        const providerMatch = new RegExp('^(' + ORDER.join('|') + ')$')
        const run = (cmd, line) => {
          const args = (line.trim().replace(/^\/\S+\s*/, '')).split(/\s+/).filter(Boolean)
          const prov = args[0]
          if (cmd === 'logout') {
            if (!prov || !providerMatch.test(prov)) return
            fetch('/dsh-subscriptions/logout', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ provider: prov, index: 1 }),
            }).catch(() => {})
            return
          }
          if (cmd === 'status' || (cmd === 'login' && prov === 'status')) { refreshLoggedIn().catch(() => {}); return }
          // login <provider>
          if (!prov || !providerMatch.test(prov)) return
          fetch('/dsh-subscriptions/oauth/start?provider=' + encodeURIComponent(prov) + '&index=1', { cache: 'no-store' })
            .then((r) => r.json()).then((data) => {
              if (data && data.url) window.open(data.url, '_blank', 'noopener')
            }).catch(() => {})
        }
        const line = (line) => line.trim()
        const sources = [
          { name: 'login', description: t('slashLogin') },
          { name: 'logout', description: t('slashLogout') },
        ]
        const disposers = sources.map((src) =>
          triggers.registerSource({
            trigger: '/',
            name: src.name,
            order: 40,
            description: src.description,
            candidates: (_s, req) => {
              if (req.position !== 'leading') return Promise.resolve([])
              const q = req.query.trim().toLowerCase()
              const name = src.name
              if (q !== '' && !name.startsWith(q)) return Promise.resolve([])
              return Promise.resolve([{ name, description: src.description }])
            },
            matchEnter: (_session, l) => {
              const t2 = line(l)
              const tok = t2.split(/\s+/)[0]
              if (tok !== '/' + src.name) return Promise.resolve(undefined)
              // '/login status' surfaces the connected providers as composer text.
              if (src.name === 'login' && /\bstatus\b/.test(t2)) {
                return refreshLoggedIn().then((logged) =>
                  ({ text: 'Connected: ' + (logged.length ? logged.join(', ') : 'none') }))
              }
              run(src.name, t2)
              return Promise.resolve('handled')
            },
          }),
        )
        return () => { for (const off of disposers) off() }
      }, 'dsh-subscriptions: slash commands')
    }

  return { registerSlashCommands }
}
