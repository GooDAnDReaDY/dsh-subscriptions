// Session header pill with accounts console extracted verbatim from client.js (#266).
import { refreshLoggedIn } from './state.js'
export function makePill(deps) {
  const { React, createPortal, NS, getT, ORDER, fcObserve, fcEstimate, hotState, formatRelativeReset, ErrorBoundary } = deps
  const t = (...a) => getT()(...a)
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
      const [state, setState] = React.useState({ logged: [], usage: 0, accounts: [], open: false, active: null, loading: false })

      const pull = () => {
        setState((s) => Object.assign({}, s, { loading: true }))
        refreshLoggedIn().then((r) => {
          const logged = r.logged || []
          fetch('/dsh-subscriptions/config', { cache: 'no-store' })
            .then((res) => res.json())
            .then((cfg) => {
              setState((s) => Object.assign({}, s, { logged, usage: r.usage, accounts: (cfg && cfg.accounts) || [], active: r.active, loading: false }))
            })
            .catch(() => {
              setState((s) => Object.assign({}, s, { logged, usage: r.usage, accounts: [], active: r.active, loading: false }))
            })
        }).catch(() => {
          setState((s) => Object.assign({}, s, { loading: false }))
        })
      }

      React.useEffect(() => {
        pull()
        const id = setInterval(pull, 25 * 1000)
        return () => clearInterval(id)
      }, [])

      React.useEffect(() => {
        if (!state.open) return undefined
        const onKey = (e) => { if (e.key === 'Escape') setState((s) => Object.assign({}, s, { open: false })) }
        document.addEventListener('keydown', onKey)
        return () => document.removeEventListener('keydown', onKey)
      }, [state.open])

      const n = state.logged.length
      const total = state.accounts.length || n
      const led = n === 0 ? 'dsub-ledOff' : (state.usage >= 90 ? 'dsub-ledBad' : (state.usage >= 50 ? 'dsub-ledWarn' : 'dsub-ledOk'))
      const now = Date.now()

      // Header Pill Label
      let pillText = t('subsPill') + ' (' + n + ')'
      if (state.active) {
        const a = state.active
        const wins = Array.isArray(a.windows) ? a.windows : []
        const winStr = wins.map((w) => (w.label || w.id) + ' ' + Math.round(w.usedPercent) + '%').join(' ')
        const provName = a.provider ? (a.provider.charAt(0).toUpperCase() + a.provider.slice(1)) : ''
        pillText = (a.provider === 'codex' && a.fastMode ? '⚡ ' : '') + provName + (winStr ? ' · ' + winStr : (a.usagePercent != null ? ' · ' + Math.round(a.usagePercent) + '%' : ''))
      }

      // Active Hero Card Renderer
      const renderActiveHero = () => {
        if (!state.active) return null
        const a = state.active
        const b = brandBadge(a.provider)
        const wins = Array.isArray(a.windows) ? a.windows : []
        const primaryWin = wins.find((w) => (w.label || w.id) === '5h') || wins[0]
        const secWin = wins.find((w) => (w.label || w.id) === '7d') || wins[1]
        const primPct = primaryWin && primaryWin.usedPercent != null ? Math.round(primaryWin.usedPercent) : (a.usagePercent != null ? Math.round(a.usagePercent) : 0)
        const secPct = secWin && secWin.usedPercent != null ? Math.round(secWin.usedPercent) : null

        return React.createElement('div', { className: 'dsub-heroCard' },
          React.createElement('div', { className: 'dsub-heroHead' },
            React.createElement('div', { className: 'dsub-heroTitle' },
              React.createElement('span', { className: 'dsub-brandBadge ' + b.cls, style: { width: 24, height: 24, fontSize: 11 } }, b.icon),
              React.createElement('span', null, (a.provider ? a.provider.toUpperCase() : 'LLM') + (a.index ? ' #' + a.index : '')),
              a.fastMode ? React.createElement('span', { className: 'dsub-pillTag', style: { background: 'color-mix(in srgb,var(--dsw-alias-state-warning-primary) 15%,transparent)', color: 'var(--dsw-alias-state-warning-primary)' } }, '⚡ FAST 1.5x') : null,
            ),
            React.createElement('span', { className: 'dsub-heroModel' }, a.model || 'active model'),
          ),
          React.createElement('div', { className: 'dsub-heroBars' },
            React.createElement('div', null,
              React.createElement('div', { className: 'dsub-barLabelRow' },
                React.createElement('span', { style: { fontWeight: 600 } }, ((primaryWin && primaryWin.label) ? primaryWin.label + ' window' : t('subs5hWindow')) + (primaryWin && primaryWin.resetAt ? ' (' + formatRelativeReset(primaryWin.resetAt, t('lang'), now) + ')' : '')),
                React.createElement('span', { style: { fontVariantNumeric: 'tabular-nums', fontWeight: 600 } }, primPct + '% ' + t('subsUsed') + ' (' + (100 - primPct) + '% ' + t('subsFree') + ')'),
              ),
              React.createElement('div', { className: 'dsub-barTrack' },
                React.createElement('div', {
                  className: 'dsub-barFillGrad',
                  style: {
                    width: Math.min(100, Math.max(0, primPct)) + '%',
                    background: primPct >= 90 ? 'var(--dsw-alias-state-error-primary,#ef4444)' : (primPct >= 50 ? 'var(--dsw-alias-state-warning-primary,#f59e0b)' : 'var(--dsw-alias-state-success-primary,#10b981)'),
                  },
                }),
              ),
            ),
            secWin ? React.createElement('div', null,
              React.createElement('div', { className: 'dsub-barLabelRow' },
                React.createElement('span', null, (secWin.label || '7d') + ' window'),
                React.createElement('span', { style: { fontVariantNumeric: 'tabular-nums' } }, secPct + '%'),
              ),
              React.createElement('div', { className: 'dsub-barTrack' },
                React.createElement('div', {
                  className: 'dsub-barFillGrad',
                  style: {
                    width: Math.min(100, Math.max(0, secPct)) + '%',
                    background: secPct >= 90 ? '#ef4444' : (secPct >= 50 ? '#f59e0b' : '#3b82f6'),
                  },
                }),
              ),
            ) : null,
          ),
        )
      }

      // Accounts list
      const rows = state.accounts.map((a, i) => {
        const isLogged = state.logged.includes(a.provider)
        const cooled = a.cooldownUntil && a.cooldownUntil > now
        const pct = a.usagePercent != null ? Math.round(a.usagePercent) : null
        const b = brandBadge(a.provider)
        const isActiveThis = state.active && state.active.provider === a.provider && state.active.index === a.index

        let statusClass = 'dsub-statusOff'
        let statusText = t('subsNotLogged')
        if (cooled) {
          statusClass = 'dsub-statusWarn'
          statusText = t('subsCooldown')
        } else if (isLogged) {
          if (pct >= 90) { statusClass = 'dsub-statusBad'; statusText = '90%+ ' + t('subsUsed') }
          else if (pct >= 50) { statusClass = 'dsub-statusWarn'; statusText = pct + '% ' + t('subsUsed') }
          else { statusClass = 'dsub-statusOk'; statusText = (pct != null ? pct + '% · ' : '') + t('subsLogged') }
        }

        return React.createElement('div', { className: 'dsub-accountCard', key: i },
          React.createElement('div', { className: 'dsub-brandBadge ' + b.cls }, b.icon),
          React.createElement('div', { className: 'dsub-accInfo' },
            React.createElement('div', { className: 'dsub-accNameRow' },
              React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
                React.createElement('span', { className: 'dsub-accName' }, a.provider.toUpperCase() + (a.index ? ' #' + a.index : '')),
                isActiveThis ? React.createElement('span', { className: 'dsub-pillTag', style: { background: 'color-mix(in srgb,var(--dsw-alias-state-success-primary) 15%,transparent)', color: 'var(--dsw-alias-state-success-primary)' } }, 'ACTIVE') : null,
                a.proxy ? React.createElement('span', { className: 'dsub-dim', title: a.proxy }, '🌐 proxy') : null,
              ),
              React.createElement('span', { className: 'dsub-accStatusTag ' + statusClass }, statusText),
            ),
            (isLogged && pct != null) ? React.createElement('div', { className: 'dsub-barTrack', style: { marginTop: 4, height: 4 } },
              React.createElement('div', {
                className: 'dsub-barFillGrad',
                style: {
                  width: Math.min(100, Math.max(0, pct)) + '%',
                  background: pct >= 90 ? '#ef4444' : (pct >= 50 ? '#f59e0b' : '#10b981'),
                },
              }),
            ) : null,
          ),
        )
      })

      return React.createElement(React.Fragment, null,
        React.createElement('button', {
          type: 'button',
          className: 'dsub-pill',
          'aria-expanded': state.open ? 'true' : 'false',
          title: t('subsPill') + ': ' + (n > 0 ? (n + ' ' + t('connected')) : t('notConnected')),
          onClick: () => setState((s) => Object.assign({}, s, { open: !s.open })),
        },
          React.createElement('span', { className: 'dsub-led ' + led }),
          React.createElement('span', null, pillText),
          React.createElement('span', { style: { fontSize: 9, opacity: 0.6, marginLeft: 2 } }, '▼'),
        ),
        state.open ? React.createElement('div', {
          className: 'dsub-modalWrap',
          onClick: (e) => { if (e.target === e.currentTarget) setState((s) => Object.assign({}, s, { open: false })) },
        },
          React.createElement('div', { className: 'dsub-modal', role: 'dialog', 'aria-label': t('subsModalTitle') },
            React.createElement('div', { className: 'dsub-modalHead' },
              React.createElement('div', { className: 'dsub-modalTitleWrap' },
                React.createElement('div', { className: 'dsub-modalIcon' }, '⚡'),
                React.createElement('div', null,
                  React.createElement('div', { style: { fontWeight: 700, fontSize: 15 } }, t('subsModalTitle')),
                  React.createElement('div', { className: 'dsub-dim' }, n + ' of ' + total + ' ' + t('connected')),
                ),
              ),
              React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
                React.createElement('button', {
                  type: 'button',
                  className: 'dsub-mini',
                  title: t('subsRefresh'),
                  onClick: () => pull(),
                }, state.loading ? '…' : '🔄'),
                React.createElement('button', {
                  type: 'button',
                  className: 'dsub-mini',
                  onClick: () => setState((s) => Object.assign({}, s, { open: false })),
                }, '✕'),
              ),
            ),
            renderActiveHero(),
            React.createElement('div', { className: 'dsub-poolTitle' }, t('subsPoolTitle')),
            rows.length ? rows : React.createElement('div', { className: 'dsub-sub', style: { padding: '12px 0' } }, t('subsNotLogged')),
            React.createElement('div', { className: 'dsub-modalFoot' },
              React.createElement('span', { className: 'dsub-dim' }, 'DSH Subscriptions'),
              React.createElement('a', {
                className: 'dsub-btnSec',
                href: '#',
                onClick: (e) => {
                  e.preventDefault()
                  setState((s) => Object.assign({}, s, { open: false }))
                  try {
                    const btn = Array.from(document.querySelectorAll('button')).find((b) => (b.textContent || '').includes(t('title')))
                    if (btn) btn.click()
                  } catch {}
                },
              }, t('subsOpenSettings')),
            ),
          ),
        ) : null,
      )
    }

    function registerSubsPill(ctx) {
      ctx.effect(() => {
        ctx.slots.inject('conversation.session.header.actions', () =>
          ctx.slots.register(
            {
              name: 'conversation.session.header.actions',
              id: 'dsh-subscriptions-subs-pill',
              order: 15,
              locale: NS,
            },
            (props) => React.createElement(ErrorBoundary, null, React.createElement(SubsPill, { t })),
          ),
        )
      }, 'dsh-subscriptions: subs pill')
    }

  return { brandBadge, SubsPill, registerSubsPill }
}
