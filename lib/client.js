window.__ModuleLoader__.load({
  id: '@goodandready/dsh-subscriptions',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    const React = require('react')

    const CSS =
      '.dsub-wrap{display:flex;flex-direction:column;gap:22px;padding:4px 0;max-width:760px}' +
      '.dsub-block{display:flex;flex-direction:column;gap:10px}' +
      '.dsub-h{font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary)}' +
      '.dsub-sub{font-size:12px;color:var(--dsw-alias-label-secondary)}' +
      '.dsub-card{display:flex;flex-direction:column;gap:8px;padding:10px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px}' +
      '.dsub-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}' +
      '.dsub-row input,.dsub-field input,.dsub-row select{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-primary);border-radius:6px;padding:6px 8px;font-size:13px}' +
      '.dsub-grow{flex:1;min-width:180px}' +
      '.dsub-field{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--dsw-alias-label-secondary)}' +
      '.dsub-mini{border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);border-radius:6px;height:28px;padding:0 8px;cursor:pointer}' +
      '.dsub-save{background:var(--dsw-alias-brand-primary);color:#fff;border:none;border-radius:6px;padding:7px 14px;font-size:13px;cursor:pointer}' +
      '.dsub-ok{font-size:12px;color:var(--dsw-alias-state-success-primary)}' +
      '.dsub-bad{font-size:12px;color:var(--dsw-alias-state-error-primary)}' +
      '.dsub-badge{font-size:11px;padding:2px 8px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);white-space:nowrap}' +
      '.dsub-badge-on{color:var(--dsw-alias-state-success-primary);border-color:currentColor}' +
      '.dsub-badge-warn{color:var(--dsw-alias-state-warning-primary);border-color:currentColor}' +
      '.dsub-link{background:none;border:none;color:var(--dsw-alias-label-secondary);cursor:pointer;font-size:12px;padding:0}' +
      '.dsub-verify{font-size:12px;color:var(--dsw-alias-state-warning-primary)}' +
      '.dsub-verify a{color:var(--dsw-alias-brand-primary)}'

    const cssId = 'dsh-subscriptions/settings.module.css'
    if (typeof document !== 'undefined' && !document.querySelector('style[data-plugin-css="' + cssId + '"]')) {
      const tag = document.createElement('style')
      tag.textContent = CSS
      tag.setAttribute('data-plugin', 'dsh-subscriptions')
      tag.dataset.pluginCss = cssId
      document.head.appendChild(tag)
    }

    // Строки карточки живут в реестре локалей: так их переводит отдельный
    // пакет, не трогая код этого плагина. Английский — язык по умолчанию,
    // на него же приходится откат, если перевода нет.
    const NS = 'dsh-subscriptions'
    const en = {
      'notConnected': 'Not connected',
      'verifyAccount': 'Verify account',
      'coolingDown': 'Cooling down',
      'usageFull': 'Usage 100%',
      'connected': 'Connected',
      'title': 'Subscriptions',
      'intro': 'Log in with a consumer subscription. Tokens stay on the host credentials store. The browser never reads them back. After Connect, if the provider lands on localhost or a vendor page, paste the redirected URL or the code here.',
      'useOrigin': 'Use this Web UI origin as OAuth redirect_uri',
      'useOriginHint': 'Leave off unless you registered your own OAuth client for this origin. Vendor CLI clients usually require their published redirect URI plus the paste step.',
      'reconnect': 'Reconnect',
      'connect': 'Connect',
      'disconnect': 'Disconnect',
      'removeSlot': 'Remove slot',
      'pastePlaceholder': 'Paste redirected URL or code',
      'submitCode': 'Submit code',
      'verifyPrefix': 'Google requires one-time account verification. ',
      'verifyLink': 'Open verification link',
      'verifySuffix': ' then reconnect.',
      'addAccount': '+ Add account',
      'save': 'Save',
      'saved': 'Saved',
      'loading': 'Loading\u2026',
      'accountLabel': 'Account',
      'plan': 'Plan',
      'storedAs': 'Stored as',
    }
    const ru = {
      'notConnected': 'Не подключено',
      'verifyAccount': 'Требуется проверка',
      'coolingDown': 'Пауза после лимита',
      'usageFull': 'Лимит исчерпан',
      'connected': 'Подключено',
      'title': 'Подписки',
      'intro': 'Вход по обычной пользовательской подписке. Токены остаются в хранилище учётных данных харнесса, браузер их обратно не читает. Если после «Подключить» провайдер увёл на localhost или на свою страницу, вставьте сюда адрес перехода или код.',
      'useOrigin': 'Использовать адрес этого веб-интерфейса как redirect_uri',
      'useOriginHint': 'Включайте, только если зарегистрировали собственного клиента OAuth на этот адрес. Штатным консольным клиентам провайдеров нужен их опубликованный адрес возврата и вставка кода вручную.',
      'reconnect': 'Переподключить',
      'connect': 'Подключить',
      'disconnect': 'Отключить',
      'removeSlot': 'Убрать место',
      'pastePlaceholder': 'Адрес перехода или код',
      'submitCode': 'Отправить код',
      'verifyPrefix': 'Google требует однократной проверки аккаунта. ',
      'verifyLink': 'Открыть страницу проверки',
      'verifySuffix': ' затем подключитесь заново.',
      'addAccount': '+ Добавить аккаунт',
      'save': 'Сохранить',
      'saved': 'Сохранено',
      'loading': 'Загрузка…',
      'accountLabel': 'Аккаунт',
      'plan': 'Тариф',
      'storedAs': 'Хранится как',
    }

    function badgeFor(account, t) {
      if (!account || !account.configured) return t('notConnected')
      if (account.validationUrl) return t('verifyAccount')
      if (account.cooldownUntil && account.cooldownUntil > Date.now()) return t('coolingDown')
      if (account.usagePercent != null && account.usagePercent >= 100) return t('usageFull')
      return t('connected')
    }

    function SubsSection(props) {
      // Переводчик приходит от слота, потому что в его записи указан locale.
      const t = (props && props.t) || ((key) => key)
      const [draft, setDraft] = React.useState(null)
      const [accounts, setAccounts] = React.useState([])
      const [providers, setProviders] = React.useState([])
      const [paste, setPaste] = React.useState({})
      const [saved, setSaved] = React.useState(false)
      const [err, setErr] = React.useState('')

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

      if (!draft) return React.createElement('div', { className: 'dsub-wrap' }, t('loading'))

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
                  React.createElement('button', {
                    type: 'button', className: 'dsub-mini',
                    onClick: () => connect(row.slot.provider, row.slot.index).catch((e) => setErr(String(e.message || e))),
                  }, on ? t('reconnect') : t('connect')),
                  React.createElement('button', {
                    type: 'button', className: 'dsub-mini',
                    disabled: !on,
                    onClick: () => logout(row.slot.provider, row.slot.index).catch((e) => setErr(String(e.message || e))),
                  }, t('disconnect')),
                  React.createElement('button', {
                    type: 'button', className: 'dsub-mini', title: t('removeSlot'),
                    onClick: () => {
                      const slot = row.slot
                      Promise.resolve(on ? logout(slot.provider, slot.index) : null)
                        .then(() => setSlots(slots.filter((_, k) => k !== row.i)))
                        .catch((e) => setErr(String(e.message || e)))
                    },
                  }, '\u00d7'),
                ),
                React.createElement('div', { className: 'dsub-row' },
                  React.createElement('input', {
                    className: 'dsub-grow',
                    value: paste[key] || '',
                    placeholder: t('pastePlaceholder'),
                    onChange: (e) => setPaste((p) => Object.assign({}, p, { [key]: e.target.value })),
                  }),
                  React.createElement('button', {
                    type: 'button', className: 'dsub-mini',
                    onClick: () => complete(row.slot.provider, row.slot.index).catch((e) => setErr(String(e.message || e))),
                  }, t('submitCode')),
                ),
                account.accountNotice ? React.createElement('div', { className: 'dsub-verify' }, account.accountNotice) : null,
                account.validationUrl ? React.createElement('div', { className: 'dsub-verify' },
                  t('verifyPrefix'),
                  React.createElement('a', { href: account.validationUrl, target: '_blank', rel: 'noopener noreferrer' }, t('verifyLink')),
                  t('verifySuffix'),
                ) : null,
                account.paidTierName ? React.createElement('span', { className: 'dsub-sub' }, t('plan') + ': ' + account.paidTierName) : null,
                account.ref ? React.createElement('span', { className: 'dsub-sub' }, t('storedAs') + ' ' + account.ref) : null,
              )
            }),
            React.createElement('button', {
              type: 'button', className: 'dsub-mini',
              onClick: () => addSlot(prov.id),
            }, t('addAccount')),
          )
        }),
        React.createElement('div', { className: 'dsub-row' },
          React.createElement('button', {
            type: 'button', className: 'dsub-save',
            onClick: () => save().catch((e) => setErr(String(e.message || e))),
          }, t('save')),
          saved ? React.createElement('span', { className: 'dsub-ok' }, t('saved')) : null,
          err ? React.createElement('span', { className: 'dsub-bad' }, err) : null,
        ),
      )
    }

    function registerSettings(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { en, ru }), 'dsh-subscriptions: словари')
      // Подпись раздела рисует боковой список, а не наш компонент: props.t
      // туда не доходит, поэтому берём переводчик, привязанный к namespace.
      const t = ctx.locale.bind(NS)
      ctx.slots.inject('settings.section', () => ctx.slots.register(
        {
          name: 'settings.section',
          id: '@goodandready/dsh-subscriptions',
          order: 28,
          // locale в записи слота — то, из-за чего компонент получает props.t.
          locale: NS,
          label: () => t('title'),
          inject: () => ({ ctx: ctx }),
        },
        SubsSection,
      ))
    }

    exports.inject = ['slots', 'locale']
    exports.apply = function apply(ctx) {
      registerSettings(ctx)
    }
    return module.exports
  },
})
