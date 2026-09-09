// Composer quota indicator and family-cooldown sampling extracted verbatim from client.js (#266).
import { refreshLoggedIn, hotState } from './state.js'
export function makeQuota(deps) {
  const { React, NS, getT, ORDER, ErrorBoundary } = deps
  const t = (...a) => getT()(...a)
    const fcSamples = { windows: {} }

    function fcObserve(key, remaining, now) {
      const windows = fcSamples.windows
      const prev = windows[key]
      const samples = (prev && prev.samples) || []
      const last = samples[samples.length - 1]
      if (!last || (now > last.at && (Math.abs(remaining - last.pct) >= 0.1 || now - last.at >= 15 * 60 * 1000))) {
        samples.push({ at: now, pct: remaining })
      }
      windows[key] = { samples: samples.filter((x) => x.at >= now - 24 * 60 * 60 * 1000).slice(-192) }
    }

    function fcEstimate(key, remaining, now) {
      const rec = fcSamples.windows[key]
      if (!rec) return { status: 'calibrating' }
      const samples = rec.samples
      if (samples.length < 3) return { status: 'calibrating' }
      const first = samples[0]
      const last = samples[samples.length - 1]
      const span = last.at - first.at
      const consumed = first.pct - last.pct
      if (span < 30 * 60 * 1000 || consumed < 1) return { status: 'calibrating' }
      const t0 = first.at
      let sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0
      for (const x of samples) {
        const wx = (x.at - t0) / 3600000
        const wy = first.pct - x.pct
        const w = Math.exp((x.at - last.at) / (6 * 3600000))
        sw += w; sx += w * wx; sy += w * wy; sxx += w * wx * wx; sxy += w * wx * wy
      }
      const den = sw * sxx - sx * sx
      const pace = den > 0 ? (sw * sxy - sx * sy) / den : 0
      if (!Number.isFinite(pace) || pace < 0.02) return { status: 'idle' }
      return { status: 'ready', runwaySeconds: Math.round((remaining / pace) * 3600) }
    }

    function ComposerQuota(props) {
      const t = (props && props.t) || ((k) => k)
      const [state, setState] = React.useState({ mode: 'off', active: null })
      React.useEffect(() => {
        let alive = true
        const pull = () => {
          refreshLoggedIn().then((r) => {
            if (!alive) return
            const mode = r.composerQuota || 'off'
            const a = r.active
            if (mode !== 'off' && a && a.provider && a.provider !== 'ollama' && a.usagePercent != null) {
              const remaining = Math.max(0, 100 - a.usagePercent)
              const key = 'subs:' + a.provider
              fcObserve(key, remaining, Date.now())
              const est = fcEstimate(key, remaining, Date.now())
              setState({ mode, active: a, remaining, est })
            } else {
              setState({ mode, active: a, remaining: null, est: null })
            }
          }).catch(() => {})
        }
        pull()
        const id = setInterval(pull, 60 * 1000)
        return () => { alive = false; clearInterval(id) }
      }, [])
      if (state.mode === 'off' || !state.active || state.remaining == null) return null
      const cls = state.remaining <= 10 ? ' dsub-cqBarFull' : (state.remaining <= 30 ? ' dsub-cqBarWarn' : '')
      var value = null
      if (state.mode === 'percent') {
        value = React.createElement('span', { className: 'dsub-cqB' }, Math.round(state.remaining) + '%')
      } else if (state.mode === 'bar') {
        value = React.createElement('span', { className: 'dsub-cqBar' + cls },
          React.createElement('span', { className: 'dsub-cqBarFill', style: { width: Math.min(100, Math.max(0, state.remaining)) + '%' } }))
      } else if (state.mode === 'forecast') {
        var est = state.est
        if (!est || est.status === 'calibrating') value = React.createElement('span', { className: 'dsub-cqB' }, t('fcCalibrating'))
        else if (est.status === 'idle') value = React.createElement('span', { className: 'dsub-cqB' }, t('fcIdle'))
        else {
          var secs = est.runwaySeconds || 0
          var txt = secs >= 3600 ? ('~' + (Math.round((secs / 3600) * 10) / 10) + t('fcHours')) : ('~' + Math.max(1, Math.round(secs / 60)) + t('fcMinutes'))
          value = React.createElement('span', { className: 'dsub-cqB' }, txt)
        }
      } else return null
      return React.createElement('span', { className: 'dsub-cq', title: t('forecast') + ' · ' + state.active.provider }, value)
    }

    // #83: SUBS(N) pill in the session header with a pool health LED and
    // a modal accounts console (close: X button, Escape, outside click).
    function registerComposerQuota(ctx) {
      ctx.effect(() => {
        ctx.slots.inject('conversation.input.right', () =>
          ctx.slots.register(
            {
              name: 'conversation.input.right',
              id: 'dsh-subscriptions-composer-quota',
              order: 5,
              locale: NS,
            },
            (props) => React.createElement(ErrorBoundary, null, React.createElement(ComposerQuota, { t })),
          ),
        )
      }, 'dsh-subscriptions: composer quota')
    }

  return { fcObserve, fcEstimate, ComposerQuota, registerComposerQuota }
}
