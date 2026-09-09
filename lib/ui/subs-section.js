// Main vendor/accounts settings section extracted verbatim from client.js (#266).
import { cleanErrorMessage } from './clean-error.js'
export function makeSubsSection(deps) {
  const { React, NS, INSTRUCTIONS, badgeFor, Chevron, ResetCountdown, formatRelativeReset, normalizePlanBadge } = deps
    function SubsSection(props) {
      // The translator comes from the slot because its registration declares locale.
      const t = (props && props.t) || ((key) => key)
      const [draft, setDraft] = React.useState(null)
      const [accounts, setAccounts] = React.useState([])
      const [providers, setProviders] = React.useState([])
      const [paste, setPaste] = React.useState({})
      const [device, setDevice] = React.useState({})  // #90 key -> {state,userCode,authUrl,intervalMs,status}
      const [proxyRes, setProxyRes] = React.useState({})  // #88 key -> {ok,latencyMs,error}
      const [diag, setDiag] = React.useState('')
      const [reset, setReset] = React.useState({})  // #85 key -> challenge state
      const [, setResetTick] = React.useState(0)
      React.useEffect(() => {
        const anyPending = Object.values(reset).some((r) => r && r.phase === 'confirm' && !r.result)
        if (!anyPending) return undefined
        const id = setInterval(() => setResetTick((n) => n + 1), 1000)
        return () => clearInterval(id)
      }, [reset])

      // #85: reset credits challenge flow (prepare -> 5s cooldown + ack -> consume).
      const resetPrepare = async (provider, index, key) => {
        setReset((m) => Object.assign({}, m, { [key]: { phase: 'loading' } }))
        try {
          const res = await fetch('/dsh-subscriptions/reset-credits/prepare', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider, index }),
          })
          const d = await res.json()
          if (!d || !d.ok) throw new Error((d && d.error && d.error.message) || 'prepare failed')
          setReset((m) => Object.assign({}, m, { [key]: {
            phase: 'confirm',
            challengeId: d.challengeId,
            availableCount: d.availableCount,
            readyAt: d.readyAt,
            expiresAt: d.expiresAt,
            creditExpiresAt: d.creditExpiresAt || null,
          } }))
        } catch (e) {
          setReset((m) => Object.assign({}, m, { [key]: { phase: 'idle', error: String(e && e.message || e) } }))
        }
      }
      const resetConsume = async (key) => {
        const st = reset[key]
        if (!st || st.phase !== 'confirm' || !st.ack || Date.now() < st.readyAt || st.busy) return
        setReset((m) => Object.assign({}, m, { [key]: Object.assign({}, st, { busy: true }) }))
        try {
          const res = await fetch('/dsh-subscriptions/reset-credits/consume', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ challengeId: st.challengeId, acknowledged: true }),
          })
          const d = await res.json()
          if (!d || !d.ok) throw new Error((d && d.error && d.error.message) || 'consume failed')
          const code = d.result && d.result.code
          setReset((m) => Object.assign({}, m, { [key]: Object.assign({}, st, { busy: false, result: code, windowsReset: (d.result && d.result.windowsReset) || [] }) }))
          reload().catch(() => {})
        } catch (e) {
          setReset((m) => Object.assign({}, m, { [key]: Object.assign({}, st, { busy: false, error: String(e && e.message || e) }) }))
        }
      }
      // #99: one click - fetch the anonymized report and copy it to the clipboard.
      const genDiag = () => {
        fetch('/dsh-subscriptions/diagnostics', { cache: 'no-store' })
          .then((r) => r.json())
          .then((d) => {
            const txt = d && d.ok ? JSON.stringify(d.report, null, 2) : ('error: ' + ((d && d.error && d.error.message) || 'unknown'))
            setDiag(txt)
            try { navigator.clipboard.writeText(txt) } catch {}
          })
          .catch((e) => setDiag('error: ' + String(e && e.message || e)))
      }
      const [checkRes, setCheckRes] = React.useState({})
      const [checking, setChecking] = React.useState({})
      const [saved, setSaved] = React.useState(false)
      const [tokenDraft, setTokenDraft] = React.useState({})
      const [openHelp, setOpenHelp] = React.useState({})
      const [err, setErr] = React.useState('')
      const [info, setInfo] = React.useState('')

      const applyPayload = (data) => {
        setDraft(JSON.parse(JSON.stringify((data && data.config) || {})))
        setAccounts((data && data.accounts) || [])
        setProviders((data && data.providers) || [])
      }

      const reload = () => fetch('/dsh-subscriptions/config', { cache: 'no-store' })
        .then((res) => res.json())
        .then(applyPayload)

      React.useEffect(() => {
        let alive = true
        reload().catch((e) => { if (alive) setErr(String(e && e.message ? e.message : e)) })
        return () => { alive = false }
      }, [])

      // #90: poll device login while any slot is in 'pending' state.
      React.useEffect(() => {
        const pendingKeys = Object.entries(device).filter(([, d]) => d && d.status === 'pending')
        if (!pendingKeys.length) return
        const timers = pendingKeys.map(([key, d]) => setInterval(() => {
          devicePollOnce(key.split(':')[0], Number(key.split(':')[1]))
        }, d.intervalMs || 5000))
        return () => timers.forEach(clearInterval)
      })

      // #81: settings snapshot status - never render phantom inputs before the
      // config snapshot arrives, and offer a retry when the store is unavailable.
      if (!draft) {
        return React.createElement('div', { className: 'dsub-wrap' },
          React.createElement('div', { className: 'dsub-row' },
            React.createElement('span', { className: 'dsub-sub' }, err ? t('settingsUnavailable') : t('settingsLoading')),
            err ? React.createElement('button', {
              type: 'button', className: 'dsub-mini',
              onClick: () => { setErr(''); reload().catch((e) => setErr(String(e && e.message || e))) },
            }, t('settingsRetry')) : null,
          ),
          err ? React.createElement('div', { className: 'dsub-bad' }, err) : null,
        )
      }

      const slots = Array.isArray(draft.slots) ? draft.slots : []
      const setSlots = (next) => setDraft((d) => Object.assign({}, d, { slots: next }))
      const accountOf = (provider, index) => accounts.find((a) => a.provider === provider && a.index === index) || {}

      const save = async () => {
        setErr(''); setSaved(false)
        const res = await fetch('/dsh-subscriptions/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(draft),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error((data.error && data.error.message) || ('HTTP ' + res.status))
        applyPayload(data)
        setSaved(true); setTimeout(() => setSaved(false), 2000)
      }

      const connect = async (provider, index) => {
        setErr('')
        const res = await fetch('/dsh-subscriptions/oauth/start?provider=' + encodeURIComponent(provider) + '&index=' + encodeURIComponent(index), { cache: 'no-store' })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error((data.error && data.error.message) || ('HTTP ' + res.status))
        if (data.url) window.open(data.url, '_blank', 'noopener')
      }

      // #90: device-code login (headless). Server mints user_code; we show it,
      // open the verification page, and poll until authorized.
      const deviceStartLogin = async (provider, index) => {
        const key = provider + ':' + index
        setErr('')
        const res = await fetch('/dsh-subscriptions/oauth/device/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider, index }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error((data.error && data.error.message) || ('HTTP ' + res.status))
        setDevice((m) => Object.assign({}, m, { [key]: { state: data.state, userCode: data.userCode, authUrl: data.authUrl, intervalMs: data.intervalMs || 5000, status: 'pending' } }))
      }

      const devicePollOnce = async (provider, index) => {
        const key = provider + ':' + index
        const d = device[key]
        if (!d || !d.state) return
        const res = await fetch('/dsh-subscriptions/oauth/device/poll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state: d.state }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setDevice((m) => Object.assign({}, m, { [key]: Object.assign({}, d, { status: 'expired' }) }))
          return
        }
        if (data.status === 'authorized') {
          setDevice((m) => Object.assign({}, m, { [key]: Object.assign({}, d, { status: 'authorized' }) }))
          reload().catch(() => {})
          return
        }
        if (data.status === 'expired') {
          setDevice((m) => Object.assign({}, m, { [key]: Object.assign({}, d, { status: 'expired' }) }))
        }
      }

      const complete = async (provider, index) => {
        setErr('')
        const key = provider + ':' + index
        const url = paste[key] || ''
        const res = await fetch('/dsh-subscriptions/oauth/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: provider, index: index, url: url }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error((data.error && data.error.message) || ('HTTP ' + res.status))
        setAccounts(data.accounts || [])
        setPaste((p) => Object.assign({}, p, { [key]: '' }))
      }

      // #88: probe the account proxy with a real request and measure latency.
      const doProxyCheck = async (provider, index) => {
        const key = provider + ':' + index
        setChecking((c) => Object.assign({}, c, { ['proxy:' + key]: true }))
        setErr('')
        try {
          const res = await fetch('/dsh-subscriptions/proxy-check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider, index }),
          })
          const data = await res.json().catch(() => ({}))
          setProxyRes((m) => Object.assign({}, m, { [key]: data }))
        } catch (e) { setErr(cleanErrorMessage(e.message || e)) }
        setChecking((c) => Object.assign({}, c, { ['proxy:' + key]: false }))
      }


      const doCheck = async (provider, index) => {
        const key = provider + ':' + index
        setChecking((c) => Object.assign({}, c, { [key]: true }))
        setErr('')
        try {
          const res = await fetch('/dsh-subscriptions/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider, index }),
          })
          const data = await res.json().catch(() => ({}))
          setCheckRes((m) => Object.assign({}, m, { [key]: data }))
          if (data && data.quota) {
            setAccounts((prev) => prev.map((a) => a.provider===provider && a.index===index ? Object.assign({}, a, { quota: data.quota }) : a))
          }
        } catch (e) { setErr(cleanErrorMessage(e.message || e)) }
        setChecking((c) => Object.assign({}, c, { [key]: false }))
      }

      const logout = async (provider, index) => {
        setErr('')
        const res = await fetch('/dsh-subscriptions/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: provider, index: index }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error((data.error && data.error.message) || ('HTTP ' + res.status))
        setAccounts(data.accounts || [])
      }

            const importLocalCli = async (provider, index) => {
        setErr('')
        setInfo('')
        const res = await fetch('/dsh-subscriptions/import-local', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider, index }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error((data.error && data.error.message) || ('HTTP ' + res.status))
        if (data.config) applyPayload(data)
        else await reload()
        setInfo(t('importLocalSuccess'))
        setTimeout(() => setInfo(''), 3000)
      }

      const importToken = async (provider, index) => {
        setErr('')
        const tok = (tokenDraft[provider + ':' + index] || '').trim()
        if (!tok) return
        const res = await fetch('/dsh-subscriptions/import-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider, index, refreshToken: tok }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error((data.error && data.error.message) || ('HTTP ' + res.status))
        setAccounts(data.accounts || [])
        setTokenDraft((d) => Object.assign({}, d, { [provider + ':' + index]: '' }))
      }

      const addSlot = (provider) => {
        const used = slots.filter((s) => s.provider === provider).map((s) => s.index)
        let index = 1
        while (used.indexOf(index) >= 0) index++
        setSlots(slots.concat([{ provider: provider, index: index, label: '' }]))
      }

      const names = providers.length ? providers : [
        { id: 'codex', name: 'ChatGPT Codex' },
        { id: 'claude', name: 'Claude' },
        { id: 'grok', name: 'Grok' },
        { id: 'antigravity', name: 'Antigravity' },
      ]

      return React.createElement('div', { className: 'dsub-wrap' },
        React.createElement('div', { className: 'dsub-block' },
          React.createElement('div', { className: 'dsub-h' }, t('title')),
          React.createElement('div', { className: 'dsub-sub' },
            t('intro')),
          React.createElement('label', { className: 'dsub-row' },
            React.createElement('input', {
              type: 'checkbox',
              checked: !!draft.useWebCallback,
              onChange: (e) => setDraft((d) => Object.assign({}, d, { useWebCallback: e.target.checked })),
            }),
            React.createElement('span', null, t('useOrigin')),
          ),
          React.createElement('div', { className: 'dsub-sub' },
            t('useOriginHint')),
          React.createElement('label', { className: 'dsub-row' },
            React.createElement('input', {
              type: 'checkbox',
              checked: !!draft.privacyMask,
              onChange: (e) => setDraft((d) => Object.assign({}, d, { privacyMask: e.target.checked })),
            }),
            React.createElement('span', null, t('privacyMask')),
          ),
          React.createElement('div', { className: 'dsub-sub' },
            t('privacyMaskHint')),
        ),
        React.createElement('div', { className: 'dsub-block' },
          React.createElement('div', { className: 'dsub-row' },
            React.createElement('button', { type: 'button', className: 'dsub-mini', onClick: genDiag }, t('diagGenerate')),
            React.createElement('a', { href: 'https://github.com/GooDAnDReaDY/dsh-subscriptions/issues', target: '_blank', rel: 'noopener noreferrer', className: 'dsub-mini' }, t('diagIssues')),
          ),
          React.createElement('div', { className: 'dsub-sub' }, t('diagHint')),
          diag ? React.createElement('div', { className: 'dsub-row' },
            React.createElement('button', {
              type: 'button', className: 'dsub-mini',
              onClick: () => { try { navigator.clipboard.writeText(diag) } catch {} },
            }, t('diagCopy')),
            React.createElement('pre', { className: 'dsub-diag' }, diag),
          ) : null,
        ),
        names.map((prov) => {
          const rows = slots
            .map((slot, i) => ({ slot: slot, i: i }))
            .filter((row) => row.slot.provider === prov.id)
          return React.createElement('div', { className: 'dsub-block', key: prov.id },
            React.createElement('div', { className: 'dsub-h' }, prov.name),
            rows.map((row) => {
              const account = accountOf(row.slot.provider, row.slot.index)
              const key = row.slot.provider + ':' + row.slot.index
              const on = !!account.configured
              return React.createElement('div', { className: 'dsub-card', key: key },
                React.createElement('div', { className: 'dsub-row' },
                  React.createElement('input', {
                    className: 'dsub-grow',
                    value: row.slot.label || '',
                    placeholder: account.label || (t('accountLabel') + ' ' + row.slot.index),
                    onChange: (e) => {
                      const next = slots.slice()
                      next[row.i] = Object.assign({}, next[row.i], { label: e.target.value })
                      setSlots(next)
                    },
                  }),
                  React.createElement('span', { className: 'dsub-badge' + (account.validationUrl ? ' dsub-badge-warn' : (on ? ' dsub-badge-on' : '')) }, badgeFor(account, t)),
                  normalizePlanBadge(row.slot.provider, account.plan || (account.quota && account.quota.plan)),
                  React.createElement('button', {
                    type: 'button', className: 'dsub-mini',
                    onClick: () => connect(row.slot.provider, row.slot.index).catch((e) => setErr(cleanErrorMessage(e.message || e))),
                  }, on ? t('reconnect') : t('connect')),
                  (row.slot.provider === 'codex' ? React.createElement('button', {
                    type: 'button', className: 'dsub-mini',
                    onClick: () => deviceStartLogin(row.slot.provider, row.slot.index).catch((e) => setErr(cleanErrorMessage(e.message || e))),
                  }, t('deviceLogin')) : null),
                  React.createElement('button', {
                    type: 'button', className: 'dsub-mini',
                    disabled: !on,
                    onClick: () => logout(row.slot.provider, row.slot.index).catch((e) => setErr(cleanErrorMessage(e.message || e))),
                  }, t('disconnect')),
                  React.createElement('button', {
                    type: 'button', className: 'dsub-mini',
                    disabled: checking[key],
                    onClick: () => doCheck(row.slot.provider, row.slot.index).catch((e) => setErr(cleanErrorMessage(e.message || e))),
                  }, checking[key] ? t('checking') : t('check')),
                  React.createElement('button', {
                    type: 'button', className: 'dsub-mini', title: t('removeSlot'),
                    onClick: () => {
                      const slot = row.slot
                      Promise.resolve(on ? logout(slot.provider, slot.index) : null)
                        .then(() => setSlots(slots.filter((_, k) => k !== row.i)))
                        .catch((e) => setErr(cleanErrorMessage(e.message || e)))
                    },
                  }, '\u00d7'),
                ),
                React.createElement('div', { className: 'dsub-manual' },
                  React.createElement('span', { className: 'dsub-sub' }, t('manualTitle')),
                React.createElement('div', { className: 'dsub-row' },
                  React.createElement('input', {
                    className: 'dsub-grow',
                    value: paste[key] || '',
                    placeholder: t('pastePlaceholder'),
                    onChange: (e) => setPaste((p) => Object.assign({}, p, { [key]: e.target.value })),
                  }),
                  React.createElement('button', {
                    type: 'button', className: 'dsub-mini',
                    onClick: () => complete(row.slot.provider, row.slot.index).catch((e) => setErr(cleanErrorMessage(e.message || e))),
                  }, t('submitCode')),
                ),
                React.createElement('div', { className: 'dsub-row', style: { justifyContent: 'space-between' } },
                  React.createElement('button', {
                    type: 'button',
                    className: 'dsub-mini',
                    title: t('importLocalCliTitle'),
                    style: { display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 },
                    onClick: () => importLocalCli(row.slot.provider, row.slot.index).catch((e) => setErr(cleanErrorMessage(e.message || e))),
                  }, t('importLocalCli')),
                  React.createElement('button', {
                    type: 'button',
                    className: 'dsub-mini' + (openHelp[key] ? ' dsub-btnActive' : ''),
                    title: t('howToGetTokenTitle'),
                    onClick: (e) => { if (e) { e.preventDefault(); e.stopPropagation(); } setOpenHelp((h) => Object.assign({}, h, { [key]: !h[key] })); },
                  }, t('howToGetToken')),
                ),
                React.createElement('div', { className: 'dsub-row' },
                  React.createElement('input', {
                    className: 'dsub-grow',
                    value: tokenDraft[key] || '',
                    placeholder: t('importTokenPlace'),
                    onChange: (e) => setTokenDraft((d) => Object.assign({}, d, { [key]: e.target.value })),
                  }),
                  React.createElement('button', {
                    type: 'button', className: 'dsub-mini',
                    title: t('importToken'),
                    onClick: () => importToken(row.slot.provider, row.slot.index).catch((e) => setErr(cleanErrorMessage(e.message || e))),
                  }, t('importToken')),
                ),
                (openHelp[key] ? (function renderInlineHelp(){
                  const prov = row.slot.provider;
                  const info = (typeof INSTRUCTIONS !== 'undefined' && INSTRUCTIONS[prov]) || {
                    title: prov,
                    stepsRu: ['Вставьте токен или API-ключ в поле выше и нажмите "Сохранить".'],
                    stepsEn: ['Paste your token or API key into the field above and click "Save token".'],
                  };
                  // Determine language safely from t('instructionsTitle')
                  const isRu = t('instructionsTitle').indexOf('Инструкция') >= 0;
                  const steps = isRu ? info.stepsRu : info.stepsEn;
                  return React.createElement('div', { className: 'dsub-helpBox' },
                    React.createElement('div', { className: 'dsub-helpHead' },
                      React.createElement('span', null, 'ℹ️ ' + info.title + ' — ' + t('instructionsTitle')),
                      React.createElement('button', {
                        type: 'button', className: 'dsub-mini',
                        style: { padding: '1px 6px', fontSize: 11 },
                        onClick: (e) => {
                          if (e) { e.preventDefault(); e.stopPropagation(); }
                          setOpenHelp((h) => Object.assign({}, h, { [key]: false }));
                        },
                      }, '✕')
                    ),
                    steps.map((st, i) => React.createElement('div', { key: i, className: 'dsub-helpStep' }, st)),
                    info.link ? React.createElement('div', { style: { marginTop: 8 } },
                      React.createElement('a', {
                        href: info.link,
                        target: '_blank',
                        rel: 'noopener noreferrer',
                        className: 'dsub-mini',
                        style: { display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none' },
                      }, '🔗 ' + (isRu ? 'Открыть страницу провайдера' : 'Open provider console'))
                    ) : null
                  );
                })() : null),
                React.createElement('div', { className: 'dsub-row' },
                  React.createElement('input', {
                    className: 'dsub-grow',
                    value: row.slot.proxyUrl || '',
                    placeholder: t('proxyPlaceholder'),
                    onChange: (e) => {
                      const next = slots.slice()
                      next[row.i] = Object.assign({}, next[row.i], { proxyUrl: e.target.value })
                      setSlots(next)
                    },
                  }),
                  React.createElement('button', {
                    type: 'button', className: 'dsub-mini',
                    disabled: checking['proxy:' + key],
                    onClick: () => doProxyCheck(row.slot.provider, row.slot.index).catch((e) => setErr(cleanErrorMessage(e.message || e))),
                  }, checking['proxy:' + key] ? '\u2026' : t('proxyCheck')),
                ),
                (function(){
                  var r = proxyRes[key]
                  if (!r) return null
                  var txt = r.ok ? (t('proxyOk') + ' ' + r.latencyMs + 'ms' + (r.viaProxy ? '' : ' (direct)')) : (t('proxyFail') + ': ' + ((r.error && r.error.message) || ''))
                  return React.createElement('div', { className: r.ok ? 'dsub-ok' : 'dsub-bad' }, txt)
                })(),
                ),
                (function devicePanel(){
                  var d = device[key]
                  if (!d) return null
                  var txt = d.status === 'authorized' ? t('deviceAuthorized') : (d.status === 'expired' ? t('deviceExpired') : t('devicePending'))
                  var cls = d.status === 'authorized' ? 'dsub-ok' : (d.status === 'expired' ? 'dsub-bad' : 'dsub-verify')
                  return React.createElement('div', { className: 'dsub-verify' },
                    React.createElement('div', { className: cls }, txt),
                    d.status === 'pending' ? React.createElement(React.Fragment, null,
                      React.createElement('div', { style: { fontSize: '2em', fontWeight: 700, letterSpacing: '0.15em', margin: '4px 0' } }, d.userCode),
                      React.createElement('div', { className: 'dsub-row' },
                        React.createElement('button', {
                          type: 'button', className: 'dsub-mini',
                          onClick: () => { try { navigator.clipboard.writeText(d.userCode) } catch {} },
                        }, t('deviceCopy')),
                        React.createElement('a', { href: d.authUrl, target: '_blank', rel: 'noopener noreferrer', className: 'dsub-mini' }, t('verifyLink')),
                      ),
                      React.createElement('div', { className: 'dsub-sub' }, t('deviceHint')),
                    ) : null,
                  )
                })(),
                (row.slot.provider === 'codex' && on ? (function resetPanel(){
                  var st = reset[key] || { phase: 'idle' }
                  var now = Date.now()
                  function resultText(code) {
                    if (code === 'reset') return t('resetDone')
                    if (code === 'nothing_to_reset') return t('resetNothing')
                    if (code === 'no_credit') return t('resetNoCredit')
                    if (code === 'already_redeemed') return t('resetRedeemed')
                    return code
                  }
                  if (st.phase !== 'confirm') {
                    return React.createElement('div', { className: 'dsub-panel-box' },
                      React.createElement('div', { className: 'dsub-panel-title' },
                        React.createElement('span', null, '⚡ ' + t('resetCredits')),
                        React.createElement('button', {
                          type: 'button',
                          className: 'dsub-mini',
                          disabled: st.phase === 'loading',
                          onClick: () => resetPrepare(row.slot.provider, row.slot.index, key).catch((e) => setErr(String(e && e.message || e))),
                        }, st.phase === 'loading' ? '…' : t('resetCreditsAction'))
                      ),
                      React.createElement('div', { className: 'dsub-panel-desc' }, t('resetCreditsHint'))
                    )
                  }
                  var ready = now >= st.readyAt
                  var secs = Math.max(0, Math.ceil((st.readyAt - now) / 1000))
                  return React.createElement('div', { className: 'dsub-panel-box dsub-panel-warn' },
                    React.createElement('div', { className: 'dsub-panel-title' },
                      React.createElement('span', null, '⚠️ ' + t('resetCredits')),
                      React.createElement('span', { className: 'dsub-tag-ok' }, t('resetAvailable') + ': ' + st.availableCount)
                    ),
                    st.creditExpiresAt ? React.createElement('div', { className: 'dsub-panel-desc' },
                      t('resetExpires') + ': ' + new Date(st.creditExpiresAt).toLocaleString()
                    ) : null,
                    React.createElement('label', { className: 'dsub-row', style: { cursor: 'pointer', margin: '4px 0' } },
                      React.createElement('input', {
                        type: 'checkbox',
                        checked: !!st.ack,
                        onChange: (e) => setReset((m) => Object.assign({}, m, { [key]: Object.assign({}, st, { ack: e.target.checked }) })),
                      }),
                      React.createElement('span', { style: { fontSize: '12px', fontWeight: 500 } }, t('resetAck')),
                    ),
                    React.createElement('div', { className: 'dsub-row', style: { gap: '8px' } },
                      React.createElement('button', {
                        type: 'button',
                        className: 'dsub-mini dsub-btn-danger',
                        disabled: !st.ack || !ready || !!st.busy,
                        onClick: () => resetConsume(key).catch((e) => setErr(String(e && e.message || e))),
                      }, st.busy ? t('resetBusy') : (ready ? t('resetGo') : (t('resetWait') + ' ' + secs + 's'))),
                      !ready && !st.busy ? React.createElement('span', { className: 'dsub-sub' }, t('resetWait') + ' ' + secs + 's') : null,
                      st.ack && ready ? React.createElement('span', { className: 'dsub-ok', style: { fontSize: '12px', fontWeight: 600 } }, '✓ ' + t('resetReady')) : null,
                      React.createElement('button', {
                        type: 'button',
                        className: 'dsub-mini',
                        style: { marginLeft: 'auto' },
                        onClick: () => setReset((m) => Object.assign({}, m, { [key]: { phase: 'idle' } })),
                      }, t('cancel'))
                    ),
                    st.result ? React.createElement('div', { className: 'dsub-ok', style: { fontWeight: 600 } }, resultText(st.result)) : null,
                    st.error ? React.createElement('div', { className: 'dsub-bad' }, st.error) : null,
                  )
                })() : null),
                account.accountNotice ? React.createElement('div', { className: 'dsub-verify' }, account.accountNotice) : null,
                account.refreshError ? React.createElement('div', { className: 'dsub-bad' }, t('reconnectRequired') + ': ' + account.refreshError) : null,
                (function(){ var r=checkRes[key]; if(!r) return null; var txt=r.ok ? ('ok ' + (r.email||'')) : ('fail ' + (r.error && r.error.message || '')); var cls=r.ok ? 'dsub-ok' : 'dsub-bad'; var q=r.quota; if(q && q.remaining!=null) txt += ' quota:'+q.remaining+(q.limit!=null?'/'+q.limit:''); return React.createElement('div', {className: cls}, txt) })(),
                account.validationUrl ? React.createElement('div', { className: 'dsub-verify' },
                  t('verifyPrefix'),
                  React.createElement('a', { href: account.validationUrl, target: '_blank', rel: 'noopener noreferrer' }, t('verifyLink')),
                  t('verifySuffix'),
                ) : null,
                (function usageLimitsBlock(){
                  var wins = account.usage
                  var q = account.quota
                  var hasWins = Array.isArray(wins) && wins.length > 0
                  var hasQuota = q && q.usedPercent != null
                  var hasUsagePct = !hasWins && !hasQuota && account.usagePercent != null

                  if (!hasWins && !hasQuota && !hasUsagePct) return null

                  function windowLabel(w){
                    var id = String((w && w.id) || '')
                    var given = w && (w.ru || w.en)
                    if (given && given !== id) return given
                    if (id === 'primary_window') return t('windowPrimary')
                    if (id === 'secondary_window') return t('windowSecondary')
                    if (!id) return t('quota')
                    return id.replace(/_/g, ' ')
                  }

                  function renderItem(label, pct, detail){
                    var p = Math.min(100, Math.max(0, Math.round(pct)))
                    var tagCls = p >= 90 ? 'dsub-tag-bad' : (p >= 70 ? 'dsub-tag-warn' : 'dsub-tag-ok')
                    var fillBg = p >= 90 ? 'var(--dsw-alias-state-error-primary)' : (p >= 70 ? 'var(--dsw-alias-state-warning-primary)' : 'var(--dsw-alias-state-success-primary)')
                    return React.createElement('div', { key: label, className: 'dsub-usage-card' },
                      React.createElement('div', { className: 'dsub-usage-head' },
                        React.createElement('span', null, label),
                        React.createElement('span', { className: tagCls }, p + '%')
                      ),
                      React.createElement('div', { className: 'dsub-usage-track' },
                        React.createElement('div', {
                          className: 'dsub-usage-fill',
                          style: { width: p + '%', background: fillBg }
                        })
                      ),
                      detail ? React.createElement('div', { className: 'dsub-usage-meta' }, detail) : null
                    )
                  }

                  var items = []
                  if (hasWins) {
                    wins.forEach(function(w, idx){
                      if (w && w.usedPercent != null) {
                        var extra = null
                        if (idx === 0 && account.requests && w.usedPercent < 100) {
                          var rem = 100 - w.usedPercent
                          var est = Math.floor(rem / (w.usedPercent / account.requests))
                          if (est > 0) extra = React.createElement('span', null, t('forecast') + ' ' + est)
                        }
                        items.push(renderItem(windowLabel(w), w.usedPercent, extra))
                      }
                    })
                  }
                  if (hasQuota) {
                    items.push(renderItem(t('quota'), q.usedPercent, q.resetAt ? React.createElement(ResetCountdown, { key: 'reset', resetAt: q.resetAt }) : null))
                  } else if (hasUsagePct) {
                    items.push(renderItem(t('quota'), account.usagePercent, null))
                  }

                  var at = (q && q.measuredAt) || (account.usageAt || 0)
                  var agoStr = null
                  if (at) {
                    var m = Math.round((Date.now() - at) / 60000)
                    if (m >= 1) agoStr = m + 'm ' + (t('lang') === 'ru' || t('refresh') === 'Обновить' ? 'назад' : 'ago')
                  }

                  return React.createElement('div', { className: 'dsub-panel-box' },
                    React.createElement('div', { className: 'dsub-panel-title' },
                      React.createElement('span', null, '📊 ' + t('usageLimitsTitle')),
                      agoStr ? React.createElement('span', { className: 'dsub-sub' }, agoStr) : null
                    ),
                    React.createElement('div', { className: 'dsub-usage-grid' }, items)
                  )
                })(),
                (account.paidTierName || account.ref ? React.createElement('div', { className: 'dsub-slot-meta-row' },
                  account.paidTierName ? React.createElement('span', { className: 'dsub-sub' },
                    React.createElement('strong', null, t('plan') + ': '),
                    account.paidTierName
                  ) : null,
                  account.ref ? React.createElement('span', { className: 'dsub-ref-tag' },
                    React.createElement('span', null, t('storedAs')),
                    React.createElement('code', null, account.ref)
                  ) : null
                ) : null),
              )
            }),
            React.createElement('button', {
              type: 'button', className: 'dsub-mini',
              onClick: () => addSlot(prov.id),
            }, t('addAccount')),
          )
        }),
        React.createElement('div', { className: 'dsub-foot' },
          React.createElement('button', {
            type: 'button', className: 'dsub-save',
            onClick: () => save().catch((e) => setErr(cleanErrorMessage(e.message || e))),
          }, t('save')),
          saved ? React.createElement('span', { className: 'dsub-ok' }, t('saved')) : null,
          info ? React.createElement('span', { className: 'dsub-ok' }, info) : null,
          err ? React.createElement('span', { className: 'dsub-bad' }, err) : null,
        ),
      )
    }

    // The card in the Plugins tab follows the bash/agent-loop/web-search cards:
    // titled header with description and chevron, collapsible, bordered.

  return { SubsSection }
}
