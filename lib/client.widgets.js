/* global window */
// #623: session widgets — the SUBS pill, the composer quota indicator, the
// draggable quota capsule and the sidebar meter. They were 700 lines inside
// `client.js`, the file the DSH Store limits to 240 KiB.
//
// The helpers they use (formatters, brand badges, the modal a11y hook, the error
// boundary) stay in `client.js` and arrive as one `deps` object, so each of them
// still has exactly one implementation. This chunk carries only the components.
window.__ModuleLoader__.load({
  id: '@goodandready/dsh-subscriptions',
  chunk: 'client.widgets.js',
  factory: (require) => {
    const React = require('react')

    /**
     * Build the widget components with host helpers injected.
     *
     * @param {object} deps
     * @param {Function} deps.h                  createElement with portal handling
     * @param {Function} deps.useModalA11y       modal focus, escape and scroll lock
     * @param {Function} deps.createPortal       react-dom createPortal, may be null
     * @param {Function} deps.debugIgnored       best-effort error logging
     * @param {Function} deps.cleanErrorMessage  strips transport noise from messages
     * @param {Function} deps.ignoreClientError  error handler for fire-and-forget calls
     * @param {Function} deps.formatRelativeReset
     * @param {Function} deps.barTone
     * @param {Function} deps.ledClass
     * @param {Function} deps.formatMmSs
     * @param {Function} deps.currentModelProvider
     * @param {Function} deps.refreshLoggedIn
     * @param {Function} deps.ErrorBoundary
     * @param {string} deps.NS                   locale namespace
     * @param {string} deps.PKG                  package name
     */
    function createWidgets(deps) {
      const h = deps.h
      const useModalA11y = deps.useModalA11y
      const createPortal = deps.createPortal
      const debugIgnored = deps.debugIgnored
      const cleanErrorMessage = deps.cleanErrorMessage
      const ignoreClientError = deps.ignoreClientError
      const formatRelativeReset = deps.formatRelativeReset
      const barTone = deps.barTone
      const ledClass = deps.ledClass
      const formatMmSs = deps.formatMmSs
      const currentModelProvider = deps.currentModelProvider
      const refreshLoggedIn = deps.refreshLoggedIn
      const PKG = deps.PKG

      function ComposerQuota(props) {
        const t = (props && props.t) || ((k) => k)
        const [state, setState] = React.useState({ mode: 'off', active: null })
        // #944: keep the newest props for the polling closure.
        const propsRef = React.useRef(props)
        propsRef.current = props
        React.useEffect(() => {
          let alive = true
          const pull = () => {
            if (typeof document !== 'undefined' && document.hidden) return
            Promise.all([
              refreshLoggedIn(),
              fetch('/dsh-subscriptions/analytics', { cache: 'no-store' })
                .then((res) => res.json())
                .catch(() => ({})),
            ]).then(async ([r, analyticsPayload]) => {
              if (!alive) return
              const mode = r.composerQuota || 'off'
              if (mode === 'off') { setState({ mode, active: null }); return }
              const current = currentModelProvider(propsRef.current)
              let a = r.active
              if (current && (!a || a.provider !== current)) {
                const cfg = await fetch('/dsh-subscriptions/config', { cache: 'no-store' })
                  .then((res) => res.json())
                  .catch(() => null)
                const rows = (cfg && cfg.accounts) || []
                a = rows.find((row) => row && row.provider === current && row.usagePercent != null)
                  || rows.find((row) => row && row.provider === current)
                  || null
              }
              const hidden = r.composerQuotaDisplay === 'hidden'
              if (mode !== 'off' && !hidden && a && a.provider && a.provider !== 'ollama' && a.usagePercent != null) {
                const remaining = Math.max(0, 100 - a.usagePercent)
                const forecast = (analyticsPayload && analyticsPayload.analytics && analyticsPayload.analytics.forecast) || []
                const row = forecast.find((f) => f.provider === a.provider && (!f.ref || !a.ref || f.ref === a.ref))
                let est = { status: 'calibrating' }
                if (row) {
                  est = row.hoursToExhaustion == null
                    ? { status: 'idle' }
                    : { status: 'forecast', runwaySeconds: Math.max(0, Number(row.hoursToExhaustion) * 3600) }
                }
                setState({ mode, active: a, remaining, est, hidden })
              } else {
                setState({ mode, active: a, remaining: null, est: null, hidden })
              }
            }).catch(ignoreClientError('client.js: request'))
          }
          pull()
          const id = setInterval(pull, 60 * 1000)
          return () => { alive = false; clearInterval(id) }
        }, [])
        if (state.mode === 'off' || state.hidden || !state.active || state.remaining == null) return null
        const cls = state.remaining <= 10 ? ' dsub-cqBarFull' : (state.remaining <= 30 ? ' dsub-cqBarWarn' : '')
        var value = null
        if (state.mode === 'percent') {
          value = h('span', { className: 'dsub-cqB' }, Math.round(state.remaining) + '%')
        } else if (state.mode === 'bar') {
          value = h('span', { className: 'dsub-cqBar' + cls },
            h('span', { className: 'dsub-cqBarFill', style: { width: Math.min(100, Math.max(0, state.remaining)) + '%' } }))
        } else if (state.mode === 'forecast') {
          var est = state.est
          if (!est || est.status === 'calibrating') value = h('span', { className: 'dsub-cqB' }, t('fcCalibrating'))
          else if (est.status === 'idle') value = h('span', { className: 'dsub-cqB' }, t('fcIdle'))
          else {
            var secs = est.runwaySeconds || 0
            var txt = secs >= 3600 ? ('~' + (Math.round((secs / 3600) * 10) / 10) + t('fcHours')) : ('~' + Math.max(1, Math.round(secs / 60)) + t('fcMinutes'))
            value = h('span', { className: 'dsub-cqB' }, txt)
          }
        } else return null
        return h('span', { className: 'dsub-cq', title: t('forecast') + ' · ' + state.active.provider }, value)
      }

      function brandBadge(prov) {
        const p = String(prov || '').toLowerCase()
        if (p.includes('codex') || p.includes('chatgpt') || p.includes('openai')) return { label: 'OpenAI', cls: 'dsub-brandCodex', icon: '⚡' }
        if (p.includes('claude') || p.includes('anthropic')) return { label: 'Claude', cls: 'dsub-brandClaude', icon: '✳' }
        if (p.includes('grok') || p.includes('xai')) return { label: 'Grok', cls: 'dsub-brandGrok', icon: '✦' }
        if (p.includes('antigravity') || p.includes('google') || p.includes('gemini')) return { label: 'AGY', cls: 'dsub-brandAgy', icon: '◆' }
        if (p.includes('kimi')) return { label: 'Kimi', cls: 'dsub-brandKimi', icon: '🌙' }
        if (p.includes('glm') || p.includes('zcode')) return { label: 'GLM', cls: 'dsub-brandGlm', icon: '⚡' }
        if (p.includes('copilot') || p.includes('github')) return { label: 'Copilot', cls: 'dsub-brandCodex', icon: '🐙' }
        if (p.includes('cursor')) return { label: 'Cursor', cls: 'dsub-brandCodex', icon: '💻' }
        if (p.includes('kiro')) return { label: 'Kiro', cls: 'dsub-brandAgy', icon: '☁️' }
        if (p.includes('qwen')) return { label: 'Qwen', cls: 'dsub-brandKimi', icon: '🌐' }
        if (p.includes('ernie') || p.includes('baidu')) return { label: 'ERNIE', cls: 'dsub-brandGlm', icon: '🐻' }
        if (p.includes('spark') || p.includes('xfyun')) return { label: 'Spark', cls: 'dsub-brandGrok', icon: '✨' }
        if (p.includes('jetbrains')) return { label: 'JetBrains', cls: 'dsub-brandClaude', icon: '🚀' }
        if (p.includes('perplexity')) return { label: 'Perplexity', cls: 'dsub-brandClaude', icon: '🔮' }
        if (p.includes('replit')) return { label: 'Replit', cls: 'dsub-brandCodex', icon: '⚡' }
        if (p.includes('cody') || p.includes('sourcegraph')) return { label: 'Cody', cls: 'dsub-brandAgy', icon: '🔍' }
        if (p.includes('ollama')) return { label: 'Ollama', cls: 'dsub-brandOllama', icon: '🦙' }
        return { label: (p.charAt(0).toUpperCase() || 'P'), cls: 'dsub-brandCodex', icon: '●' }
      }

      function SubsPill(props) {
        const t = (props && props.t) || ((k) => k)
        const [state, setState] = React.useState({ logged: [], usage: 0, accounts: [], open: false, active: null, loading: false, showSubsPill: false })
        const [toasts, setToasts] = React.useState([])
        useModalA11y(state.open, () => setState((s) => Object.assign({}, s, { open: false })))
        const lastAlertTsRef = React.useRef(Date.now() - 30000)
        const lastErrorRef = React.useRef({ text: '', at: 0 })
        const dismissToast = (id) => {
          setToasts((prev) => prev.filter((t) => t.id !== id))
        }
        const reportError = (message) => {
          const text = cleanErrorMessage(message)
          if (!text) return
          const now = Date.now()
          const last = lastErrorRef.current
          if (last.text === text && now - last.at < 60000) return
          lastErrorRef.current = { text: text, at: now }
          const id = 'err_' + now
          setToasts((prev) => prev.some((toast) => toast.message === text)
            ? prev
            : [{ id: id, message: text, cls: 'dsub-toast-bad' }, ...prev].slice(0, 3))
          setTimeout(() => dismissToast(id), 12000)
        }
        const hostDown = (() => { let last = 0; return (msg) => { const now = Date.now(); if (now - last < 120000) return; last = now; reportError(msg) } })()
        const fetchConfig = (attempt) => fetch('/dsh-subscriptions/config', { cache: 'no-store' }).catch((e) => {
          if ((attempt || 0) < 1) return new Promise((res) => setTimeout(res, 700)).then(() => fetchConfig((attempt || 0) + 1))
          throw e
        })
        const enableToastsRef = React.useRef(true)
        const pollAlerts = () => {
          if (typeof document !== 'undefined' && document.hidden) return
          if (enableToastsRef.current === false) return
          fetch('/dsh-subscriptions/alerts?limit=5', { cache: 'no-store' })
            .then((res) => res.json())
            .then((data) => {
              if (data && Array.isArray(data.alerts)) {
                const fresh = data.alerts.filter((a) => a && a.timestamp > lastAlertTsRef.current)
                if (fresh.length > 0) {
                  lastAlertTsRef.current = Math.max(...fresh.map((a) => a.timestamp))
                  fresh.forEach((al) => {
                    const toastId = 't_' + al.timestamp + '_' + Math.random().toString(36).slice(2, 5)
                    const cls = al.severity === 'error' ? 'dsub-toast-bad' : (al.severity === 'info' ? 'dsub-toast-ok' : 'dsub-toast-warn')
                    const newToast = { id: toastId, message: al.message, cls }
                    setToasts((prev) => [newToast, ...prev].slice(0, 3))
                    setTimeout(() => dismissToast(toastId), 5000)
                  })
                }
              }
            })
            .catch((e) => hostDown(t('hostOffline') + ': ' + String(e && e.message || e)))
        }
        const pull = () => {
          if (typeof document !== 'undefined' && document.hidden) return
          setState((s) => Object.assign({}, s, { loading: true }))
          refreshLoggedIn().then((r) => {
            if (r.error) hostDown(t('hostOffline') + ': ' + r.error)
            const logged = r.logged || []
            fetchConfig(0)
              .then((res) => res.json())
              .then((cfg) => {
                if (r && r.enableToasts !== undefined) enableToastsRef.current = r.enableToasts !== false
                else if (cfg && cfg.config && cfg.config.enableToasts !== undefined) enableToastsRef.current = cfg.config.enableToasts !== false
                if (enableToastsRef.current === false) setToasts([])
                setState((s) => Object.assign({}, s, { logged, usage: r.usage, accounts: (cfg && cfg.accounts) || [], active: r.active, loading: false, showSubsPill: Boolean(r && r.showSubsPill), enableToasts: enableToastsRef.current }))
              })
              .catch((e) => {
                hostDown(t('hostOffline') + ': ' + String(e && e.message || e))
                setState((s) => Object.assign({}, s, { logged, usage: r.usage, accounts: [], active: r.active, loading: false, showSubsPill: Boolean(r && r.showSubsPill) }))
              })
          }).catch((e) => {
            hostDown(t('hostOffline') + ': ' + String(e && e.message || e))
            setState((s) => Object.assign({}, s, { loading: false }))
          })
        }
        React.useEffect(() => {
          pull()
          pollAlerts()
          const id = setInterval(() => { pull(); pollAlerts(); }, 25 * 1000)
          return () => clearInterval(id)
        }, [])
        React.useEffect(() => {
          if (!state.open) return undefined
          const onKey = (e) => { if (e.key === 'Escape') setState((s) => Object.assign({}, s, { open: false })) }
          document.addEventListener('keydown', onKey)
          return () => document.removeEventListener('keydown', onKey)
        }, [state.open])
        // #979: visibility changes apply without a reload and never stop tracking.
        React.useEffect(() => {
          const onConfig = (event) => {
            const next = event && event.detail && event.detail.showSubsPill
            if (typeof next !== 'boolean') return
            setState((s) => Object.assign({}, s, { showSubsPill: next, open: next ? s.open : false }))
          }
          if (typeof window !== 'undefined') window.addEventListener('dsh-subscriptions:config', onConfig)
          return () => {
            if (typeof window !== 'undefined') window.removeEventListener('dsh-subscriptions:config', onConfig)
          }
        }, [])
        const n = state.logged.length
        const total = state.accounts.length || n
        const led = n === 0 ? 'dsub-ledOff' : ledClass(state.usage)
        const now = Date.now()
        let pillText = t('subsPill') + ' (' + n + ')'
        if (state.active) {
          const a = state.active
          const wins = Array.isArray(a.windows) ? a.windows : []
          const winStr = wins.map((w) => {
            let s = (w.label || w.id) + ' ' + Math.round(w.usedPercent) + '%'
            if (w.resetAt && w.resetAt > now) {
              s += ' (' + formatRelativeReset(w.resetAt, t('lang'), now) + ')'
            }
            return s
          }).join(' ')
          const provName = a.provider ? (a.provider.charAt(0).toUpperCase() + a.provider.slice(1)) : ''
          pillText = (a.provider === 'codex' && a.fastMode ? '⚡ ' : '') + provName + (winStr ? ' · ' + winStr : (a.usagePercent != null ? ' · ' + Math.round(a.usagePercent) + '%' : ''))
        }
        const renderActiveHero = () => {
          if (!state.active) return null
          const a = state.active
          const b = brandBadge(a.provider)
          const wins = Array.isArray(a.windows) ? a.windows : []
          const primaryWin = wins.find((w) => (w.label || w.id) === '5h') || wins[0]
          const secWin = wins.find((w) => (w.label || w.id) === '7d') || wins[1]
          const primPct = primaryWin && primaryWin.usedPercent != null ? Math.round(primaryWin.usedPercent) : (a.usagePercent != null ? Math.round(a.usagePercent) : 0)
          const secPct = secWin && secWin.usedPercent != null ? Math.round(secWin.usedPercent) : null
          return h('div', { className: 'dsub-heroCard' },
            h('div', { className: 'dsub-heroHead' },
              h('div', { className: 'dsub-heroTitle' },
                h('span', { className: 'dsub-brandBadge ' + b.cls, style: { width: 24, height: 24, fontSize: 11 } }, b.icon),
                h('span', null, (a.provider ? a.provider.toUpperCase() : 'LLM') + (a.index ? ' #' + a.index : '')),
                a.fastMode ? h('span', { className: 'dsub-pillTag', style: { background: 'color-mix(in srgb,var(--dsw-alias-state-warn-primary) 15%,transparent)', color: 'var(--dsw-alias-state-warn-primary)' } }, t('fastBadge')) : null,
              ),
              h('span', { className: 'dsub-heroModel' }, a.model || t('activeModel')),
            ),
            h('div', { className: 'dsub-heroBars' },
              h('div', null,
                h('div', { className: 'dsub-barLabelRow' },
                  h('span', { style: { fontWeight: 600 } }, ((primaryWin && primaryWin.label) ? primaryWin.label + ' window' : t('subs5hWindow')) + (primaryWin && primaryWin.resetAt ? ' (' + formatRelativeReset(primaryWin.resetAt, t('lang'), now) + ')' : '')),
                  h('span', { style: { fontVariantNumeric: 'tabular-nums', fontWeight: 600 } }, primPct + '% ' + t('subsUsed') + ' (' + (100 - primPct) + '% ' + t('subsFree') + ')'),
                ),
                h('div', { className: 'dsub-barTrack' },
                  h('div', {
                    className: 'dsub-barFillGrad',
                    style: {
                      width: Math.min(100, Math.max(0, primPct)) + '%',
                      background: barTone(primPct).color,
                    },
                  }),
                ),
              ),
              secWin ? h('div', null,
                h('div', { className: 'dsub-barLabelRow' },
                  h('span', null, ((secWin.label || '7d') + ' window') + (secWin && secWin.resetAt ? ' (' + formatRelativeReset(secWin.resetAt, t('lang'), now) + ')' : '')),
                  h('span', { style: { fontVariantNumeric: 'tabular-nums' } }, secPct + '%'),
                ),
                h('div', { className: 'dsub-barTrack' },
                  h('div', {
                    className: 'dsub-barFillGrad',
                    style: {
                      width: Math.min(100, Math.max(0, secPct)) + '%',
                      background: barTone(secPct, 'var(--dsw-alias-brand-primary)').color,
                    },
                  }),
                ),
              ) : null,
            ),
          )
        }
        const prevCooldownsRef = React.useRef(new Map())
        React.useEffect(() => {
          for (const a of (state.accounts || [])) {
            const isCooled = Boolean(a.cooldownUntil && a.cooldownUntil > now)
            const wasCooled = prevCooldownsRef.current.get(a.ref)
            if (wasCooled && !isCooled) {
              const toastId = 't_cool_' + a.ref + '_' + Date.now()
              setToasts((prev) => [{
                id: toastId,
                message: (a.label || a.ref) + ' ' + t('toastCooldownRecovered'),
                cls: 'dsub-toast-ok',
              }, ...prev].slice(0, 3))
              setTimeout(() => dismissToast(toastId), 5000)
            }
            prevCooldownsRef.current.set(a.ref, isCooled)
          }
        }, [state.accounts, now])
        const openSettings = () => {
          setState((s) => Object.assign({}, s, { open: false }))
          const clientCtx = props.ctx || window.__dshCtx
          try {
            const nav = (clientCtx && clientCtx.pluginNavigation) || (window.__dshCtx && window.__dshCtx.pluginNavigation)
            if (nav && typeof nav.openBundle === 'function') {
              nav.openBundle(PKG)
            }
          } catch (err) { debugIgnored("client.js: bestEffort", err) }
          try {
            const layout = (clientCtx && clientCtx.layout) || (window.__dshCtx && window.__dshCtx.layout)
            if (layout && typeof layout.selectPanel === 'function') {
              layout.selectPanel('plugins')
            }
          } catch (err) { debugIgnored("client.js: bestEffort", err) }
        }
        const rows = state.accounts.map((a, i) => {
          const isLogged = state.logged.includes(a.provider)
          const cooled = a.cooldownUntil && a.cooldownUntil > now
          const quarantined = Boolean(a.quarantineReason) && Number(a.quarantineUntil || 0) > now
          const pct = a.usagePercent != null ? Math.round(a.usagePercent) : null
          const b = brandBadge(a.provider)
          const isActiveThis = state.active && state.active.provider === a.provider && state.active.index === a.index
          let statusClass = 'dsub-statusOff'
          let statusText = t('subsNotLogged')
          if (quarantined) {
            statusClass = 'dsub-statusBad'
            statusText = a.quarantineReason === 'VERIFY' ? t('verifyAccount') : String(a.quarantineReason)
          } else if (cooled) {
            statusClass = 'dsub-statusWarn'
            const leftSec = Math.max(0, Math.ceil((a.cooldownUntil - now) / 1000))
            const fams = Array.isArray(a.cooldownFamilies) && a.cooldownFamilies.length ? ' · ' + a.cooldownFamilies.join('/') : ''
            statusText = t('subsCooldown') + ' (' + formatMmSs(leftSec) + ')' + fams
          } else if (isLogged) {
            if (pct >= 90) { statusClass = 'dsub-statusBad'; statusText = '90%+ ' + t('subsUsed') }
            else if (pct >= 50) { statusClass = 'dsub-statusWarn'; statusText = pct + '% ' + t('subsUsed') }
            else { statusClass = 'dsub-statusOk'; statusText = (pct != null ? pct + '% · ' : '') + t('subsLogged') }
          }
          return h('div', {
            className: 'dsub-accountCard dsub-accountCardAction',
            key: (a.ref || (a.provider || 'acct') + ':' + (a.index || i)),
            role: 'button',
            tabIndex: 0,
            title: t('subsOpenSettings'),
            onClick: openSettings,
            onKeyDown: (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                openSettings()
              }
            },
          },
            h('div', { className: 'dsub-brandBadge ' + b.cls }, b.icon),
            h('div', { className: 'dsub-accInfo' },
              h('div', { className: 'dsub-accNameRow' },
                h('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
                  h('span', { className: 'dsub-accName' }, (a.provider || 'LLM').toUpperCase() + (a.index ? ' #' + a.index : '')),
                  isActiveThis ? h('span', { className: 'dsub-pillTag', style: { background: 'color-mix(in srgb,var(--dsw-alias-state-success-primary) 15%,transparent)', color: 'var(--dsw-alias-state-success-primary)' } }, t('activeTag')) : null,
                  a.proxy ? h('span', { className: 'dsub-dim', title: a.proxy }, '🌐 proxy') : null,
                ),
                h('span', { className: 'dsub-accStatusTag ' + statusClass, role: 'status', 'aria-live': 'polite' }, statusText),
              ),
              (isLogged && pct != null) ? h('div', { className: 'dsub-barTrack', style: { marginTop: 4, height: 4 } },
                h('div', {
                  className: 'dsub-barFillGrad',
                  style: {
                    width: Math.min(100, Math.max(0, pct)) + '%',
                    background: barTone(pct).color,
                  },
                }),
              ) : null,
            ),
          )
        })
        // #959: toasts must live outside the header slot, otherwise the portaled
        // modal scrim paints over them.
        const toastLayer = toasts.length > 0 ? h('div', { className: 'dsub-toast-container' },
          toasts.map((toast) => h('div', { className: 'dsub-toast ' + toast.cls, key: toast.id },
            h('span', null, toast.message),
            h('button', {
              type: 'button',
              className: 'dsub-toast-close',
              onClick: () => dismissToast(toast.id),
            }, "\u00d7"),
          ))
        ) : null
        const toastNode = toastLayer && createPortal && typeof document !== 'undefined' && document.body
          ? createPortal(toastLayer, document.body)
          : toastLayer
        if (!state.showSubsPill) return h(React.Fragment, null, toastNode)
        return h(React.Fragment, null,
          toastNode,
          h('button', {
            type: 'button',
            className: 'dsub-pill',
            'aria-expanded': state.open ? 'true' : 'false',
            title: t('subsPill') + ': ' + (n > 0 ? (n + ' ' + t('connected')) : t('notConnected')),
            onClick: () => setState((s) => Object.assign({}, s, { open: !s.open })),
          },
            h('span', { className: 'dsub-led ' + led }),
            h('span', null, pillText),
            h('span', { style: { fontSize: 9, opacity: 0.6, marginLeft: 2 } }, '▼'),
          ),
          state.open ? h('div', {
            className: 'dsub-modalWrap',
            onClick: (e) => { if (e.target === e.currentTarget) setState((s) => Object.assign({}, s, { open: false })) },
          },
            h('div', { className: 'dsub-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('subsModalTitle') },
              h('div', { className: 'dsub-modalHead' },
                h('div', { className: 'dsub-modalTitleWrap' },
                  h('div', { className: 'dsub-modalIcon' }, '⚡'),
                  h('div', null,
                    h('div', { style: { fontWeight: 700, fontSize: 15 } }, t('subsModalTitle')),
                    h('div', { className: 'dsub-dim' }, n + t('ofLabel') + total + ' ' + t('connected')),
                  ),
                ),
                h('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
                  h('button', {
                    type: 'button',
                    className: 'dsub-mini',
                    title: t('subsRefresh'),
                    onClick: () => pull(),
                  }, state.loading ? '…' : '🔄'),
                  h('button', {
                    type: 'button',
                    className: 'dsub-mini',
                    autoFocus: true,
                    'aria-label': t('closeModal'),
                    onClick: () => setState((s) => Object.assign({}, s, { open: false })),
                  }, '✕'),
                ),
              ),
              renderActiveHero(),
              h('div', { className: 'dsub-poolTitle' }, t('subsPoolTitle')),
              rows.length ? rows : h('div', { className: 'dsub-sub', style: { padding: '12px 0' } }, t('subsNotLogged')),
              h('div', { className: 'dsub-modalFoot' },
                h('span', { className: 'dsub-dim' }, 'DSH Subscriptions'),
                h('a', {
                  className: 'dsub-btnSec',
                  href: '#',
                  onClick: (e) => {
                    e.preventDefault()
                    openSettings()
                  },
                }, t('subsOpenSettings')),
              ),
            ),
          ) : null,
        )
      }

      function QuotaCapsule(props) {
        const t = (props && props.t) || ((k) => k)
        const [state, setState] = React.useState({ mode: 'off', active: null, remaining: null, source: null, candidates: [] })
        // #944: the polling closure must follow model/session switches.
        const propsRef = React.useRef(props)
        propsRef.current = props
        const [open, setOpen] = React.useState(false)
        useModalA11y(open, () => setOpen(false))
        const [pos, setPos] = React.useState({ right: 16, bottom: 16 })
        const popRef = React.useRef(null)
        const posRef = React.useRef({ right: 16, bottom: 16 })
        const drag = React.useRef(null)
        const suppressClick = React.useRef(false)
        const savePosition = (next) => {
          fetch('/dsh-subscriptions/config', { cache: 'no-store' })
            .then((res) => res.json())
            .then((cfg) => {
              if (!cfg || !cfg.config) return null
              return fetch('/dsh-subscriptions/config', {
                method: 'PUT',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                  config: Object.assign({}, cfg.config, {
                    quotaWidgetPosition: { right: Math.round(next.right), bottom: Math.round(next.bottom) },
                  }),
                  revision: cfg.revision,
                }),
              })
            })
            .catch(ignoreClientError('client.js: request'))
        }
        React.useEffect(() => {
          let alive = true
          const pull = () => {
            if (typeof document !== 'undefined' && document.hidden) return
            refreshLoggedIn().then(async (r) => {
              if (!alive) return
              const mode = (r && r.quotaWidget) || 'off'
              if (mode === 'off') { setState({ mode, active: null, remaining: null, source: null, candidates: [] }); return }
              const sources = await fetch('/dsh-subscriptions/sources', { cache: 'no-store' }).then((res) => res.json()).catch(() => null)
              let a = r.active
              const current = currentModelProvider(propsRef.current)
              if (current && (!a || a.provider !== current)) {
                const cfg = await fetch('/dsh-subscriptions/config', { cache: 'no-store' }).then((res) => res.json()).catch(() => null)
                const rows = (cfg && cfg.accounts) || []
                a = rows.find((row) => row && row.provider === current && row.usagePercent != null) || null
              }
              if (!a || a.provider === 'ollama' || a.usagePercent == null) { setState({ mode, active: null, remaining: null, source: null, candidates: [] }); return }
              const sourceRow = (sources && Array.isArray(sources.providers) ? sources.providers : []).find((row) => row && row.provider === a.provider)
              const source = sourceRow ? sourceRow.selected : null
              const candidates = sourceRow && Array.isArray(sourceRow.candidates) ? sourceRow.candidates : []
              if (r.quotaWidgetPosition && typeof window !== 'undefined') {
                const clamp = (v, max) => Math.max(4, Math.min(max, Number(v) || 0))
                const next = {
                  right: clamp(r.quotaWidgetPosition.right, window.innerWidth - 40),
                  bottom: clamp(r.quotaWidgetPosition.bottom, window.innerHeight - 40),
                }
                posRef.current = next
                setPos(next)
              }
              setState({ mode, active: a, remaining: Math.max(0, 100 - a.usagePercent), source, candidates })
            }).catch(ignoreClientError('client.js: request'))
          }
          pull()
          const id = setInterval(pull, 60 * 1000)
          return () => { alive = false; clearInterval(id) }
        }, [])
        React.useEffect(() => {
          if (!open) return undefined
          const onDoc = (e) => {
            if (popRef.current && !popRef.current.contains(e.target) && !(e.target.closest && e.target.closest('.dsub-qw'))) setOpen(false)
          }
          const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
          document.addEventListener('pointerdown', onDoc)
          document.addEventListener('keydown', onKey)
          return () => { document.removeEventListener('pointerdown', onDoc); document.removeEventListener('keydown', onKey) }
        }, [open])
        if (state.mode === 'off' || !state.active || state.remaining == null) return null
        const docked = state.mode !== 'floating'
        const tone = state.remaining <= 10 ? ' dsub-qwFull' : (state.remaining <= 30 ? ' dsub-qwWarn' : '')
        const openSettings = () => {
          const clientCtx = props.ctx || window.__dshCtx
          try {
            const nav = (clientCtx && clientCtx.pluginNavigation) || (window.__dshCtx && window.__dshCtx.pluginNavigation)
            if (nav && typeof nav.openBundle === 'function') nav.openBundle(PKG)
          } catch (err) { debugIgnored("client.js: bestEffort", err) }
          try {
            const layout = (clientCtx && clientCtx.layout) || (window.__dshCtx && window.__dshCtx.layout)
            if (layout && typeof layout.selectPanel === 'function') layout.selectPanel('plugins')
          } catch (err) { debugIgnored("client.js: bestEffort", err) }
        }
        const onPointerDown = (e) => {
          if (docked) return
          drag.current = { x: e.clientX, y: e.clientY, right: pos.right, bottom: pos.bottom, moved: false }
          try { e.currentTarget.setPointerCapture(e.pointerId) } catch (err) { debugIgnored("client.js: optional", err) }
        }
        const onPointerMove = (e) => {
          const d = drag.current
          if (!d) return
          const dx = e.clientX - d.x
          const dy = e.clientY - d.y
          if (Math.abs(dx) + Math.abs(dy) > 3) { d.moved = true; suppressClick.current = true }
          const next = {
            right: Math.max(4, Math.min(window.innerWidth - 40, d.right - dx)),
            bottom: Math.max(4, Math.min(window.innerHeight - 40, d.bottom - dy)),
          }
          posRef.current = next
          setPos(next)
        }
        const onPointerUp = () => {
          const wasDrag = drag.current
          drag.current = null
          if (!docked && wasDrag && wasDrag.moved) savePosition(posRef.current)
        }
        const popover = open ? h('div', {
          ref: popRef,
          className: 'dsub-qwPop',
          style: { right: pos.right + 'px', bottom: (pos.bottom + 38) + 'px' },
          role: 'dialog',
            'aria-label': t('quotaSources'),
        },
          h('div', { className: 'dsub-h' }, String(state.active.provider || '').toUpperCase() + ' ' + t('sourcesSuffix')),
          (state.candidates || []).map((c, i) => {
            const label = c.source === 'api-key' ? t('apiKeySource') : (c.source === 'oauth' ? t('oauthSource') : t('ollamaSource'))
            const cd = c.detail && Array.isArray(c.detail.keys) ? Math.max(0, ...c.detail.keys.map((k) => Number(k.cooldownMsLeft) || 0)) : 0
            return h('div', { className: 'dsub-row', key: i },
              h('span', { className: 'dsub-h' }, label),
              h('span', { className: c.available ? 'dsub-ok' : 'dsub-dim' }, c.available ? t('sourceAvailable') : t('sourceUnavailable')),
              cd > 0 ? h('span', { className: 'dsub-dim' }, t('cooldownLabel') + ' ' + Math.ceil(cd / 1000) + 's') : null,
              c.detail && c.detail.healthyKeys != null ? h('span', { className: 'dsub-dim' }, c.detail.healthyKeys + '/' + c.detail.totalKeys + ' ' + t('keysSuffix')) : null,
            )
          }),
          h('button', { type: 'button', className: 'dsub-mini', onClick: () => { setOpen(false); openSettings() } }, t('openSettings')),
        ) : null
        return h(React.Fragment, null, h('div', {
          className: 'dsub-qw' + (docked ? ' dsub-qwDocked' : '') + tone,
          style: { right: pos.right + 'px', bottom: pos.bottom + 'px' },
          role: 'button',
          tabIndex: 0,
          title: (state.active.provider || 'subscription') + ' · ' + Math.round(state.remaining) + '% ' + t('subsFree'),
            'aria-label': t('quotaAriaPrefix') + ' ' + Math.round(state.remaining) + '%',
          onPointerDown,
          onPointerMove,
          onPointerUp,
          onPointerCancel: () => { drag.current = null },
          onClick: () => { if (suppressClick.current) { suppressClick.current = false; return } setOpen((o) => !o) },
          onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') setOpen((o) => !o) },
        },
          h('span', { className: 'dsub-led ' + ledClass(state.active.usagePercent) }),
          h('span', { className: 'dsub-qwBrand' }, brandBadge(state.active.provider).icon + ' ' + String(state.active.provider || '').toUpperCase()),
          state.source ? h('span', { className: 'dsub-pillTag' }, state.source === 'api-key' ? 'KEY' : (state.source === 'oauth' ? 'OAuth' : 'OLLAMA')) : null,
          h('span', { className: 'dsub-qwBar' }, h('span', { className: 'dsub-qwBarFill', style: { width: state.remaining + '%', display: 'block' } })),
          h('span', { className: 'dsub-qwPct' }, Math.round(state.remaining) + '%'),
        ), popover)
      }
      // #1030: Sidebar Quota Meter in sidebar.footer.action (above Settings)

      function SidebarQuotaCard(props) {
        // #623: `t` used to resolve to the module-scope translator of the main
        // bundle. Extracting the component made that implicit dependency visible:
        // it must arrive as a prop like in every other widget here.
        const t = (props && props.t) || ((k) => k)
        const open = (props && props.open) || (() => {})
        const [state, setState] = React.useState({
          visible: false,
          active: null,
          loading: true,
        })

        React.useEffect(() => {
          let alive = true
          const pull = () => {
            fetch('/dsh-subscriptions/status', { cache: 'no-store' })
              .then((r) => r.json())
              .then((data) => {
                if (!alive || !data) return
                const mode = String(data.sidebarQuotaDisplay || 'off')
                const hasActive = data.active && data.active.provider
                const hasLoggedIn = Object.values(data.loggedIn || {}).some(Boolean)
                const visible = mode === 'always' || (mode === 'auto' && (hasActive || hasLoggedIn))
                setState({
                  visible,
                  active: data.active || null,
                  loading: false,
                })
              })
              .catch(() => { if (alive) setState((s) => Object.assign({}, s, { loading: false })) })
          }
          pull()
          const timer = setInterval(pull, 60000)
          return () => {
            alive = false
            clearInterval(timer)
          }
        }, [])

        if (!state.visible) return null

        const act = state.active || {}
        const pct = act.usagePercent != null ? Math.round(act.usagePercent) : null
        const rem = pct != null ? Math.max(0, 100 - pct) : 100
        const brand = act.provider ? brandBadge(act.provider) : { icon: '⚡', cls: '' }
        const resetTime = act.resetAt ? formatRelativeReset(act.resetAt, t('lang'), Date.now()) : ''

        return h('button', {
          type: 'button',
          className: 'dsub-sidebar-meter',
          title: t('dashTitle') || 'Subscriptions Center',
          onClick: open,
        },
          h('span', { className: 'dsub-brandBadge ' + brand.cls, style: { width: 22, height: 22, fontSize: 11 } }, brand.icon),
          h('div', { className: 'dsub-sidebar-meter-content' },
            h('div', { className: 'dsub-sidebar-meter-head' },
              h('span', { className: 'dsub-sidebar-meter-name' }, (act.provider ? act.provider.toUpperCase() : 'SUBS')),
              h('span', { className: 'dsub-sidebar-meter-pct' }, rem + '%'),
            ),
            h('div', { className: 'dsub-barTrack', style: { height: 3, marginTop: 2 } },
              h('div', {
                className: 'dsub-barFillGrad',
                style: {
                  width: rem + '%',
                  background: pct != null ? barTone(pct).color : 'var(--dsw-alias-state-success-primary)',
                },
              }),
            ),
            resetTime ? h('div', { className: 'dsub-sidebar-meter-reset' }, '⏳ ' + resetTime) : null,
          ),
        )
      }
      return { ComposerQuota, SubsPill, QuotaCapsule, SidebarQuotaCard }
    }

    return { createWidgets }
  },
})
