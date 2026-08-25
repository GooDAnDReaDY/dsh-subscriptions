window.__ModuleLoader__.load({
  id: '@goodandready/dsh-subscriptions',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    const React = require('react')

    const CSS =
    // card — same structure as core PluginCard (bash, agent-loop, web-search)
    '.dsub-card{list-style:none;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);border-radius:12px;transition:border-color .16s,background .16s}' +
    '.dsub-card:hover{border-color:var(--dsw-alias-label-dimmed)}' +
    '.dsub-cardOpen{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-label-dimmed)}' +
    '.dsub-header{appearance:none;width:100%;font:inherit;color:inherit;text-align:left;cursor:pointer;background:0 0;border:0;border-radius:12px;align-items:center;gap:12px;padding:14px 16px;display:flex}' +
    '.dsub-header:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:-2px}' +
    '.dsub-headText{flex-direction:column;flex:1;gap:4px;min-width:0;display:flex}' +
    '.dsub-name{color:var(--dsw-alias-label-primary);font-size:15px;font-weight:600;line-height:1.4}' +
    '.dsub-description{color:var(--dsw-alias-label-secondary);font-size:13px}' +
    '.dsub-chevron{color:var(--dsw-alias-label-tertiary);flex:none;transition:transform .16s}' +
    '.dsub-chevronOpen{transform:rotate(180deg)}' +
    '.dsub-body{border-top:1px solid var(--dsw-alias-border-l2);margin:0 16px;padding-bottom:8px}' +
    // existing dsub classes kept for SubsSection internals
    '.dsub-wrap{display:flex;flex-direction:column;gap:22px;padding:4px 0;max-width:760px}' +
    '.dsub-block{display:flex;flex-direction:column;gap:10px}' +
    '.dsub-h{font-size:14px;font-weight:600;color:var(--dsw-alias-label-primary)}' +
    '.dsub-sub{font-size:12px;color:var(--dsw-alias-label-secondary)}' +
    '.dsub-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}' +
    '.dsub-row input,.dsub-field input,.dsub-row select{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);color:var(--dsw-alias-label-primary);border-radius:6px;padding:6px 8px;font-size:13px}' +
    '.dsub-grow{flex:1;min-width:180px}' +
    '.dsub-field{display:flex;flex-direction:column;gap:6px;padding:12px 0}' +
    '.dsub-input{height:34px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-primary);border-radius:8px;padding:0 12px;font-size:13px}' +
    '.dsub-mini{border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-primary);border-radius:6px;height:28px;padding:0 8px;cursor:pointer}' +
    '.dsub-foot{border-top:1px solid var(--dsw-alias-border-l2);display:flex;justify-content:flex-end;align-items:center;gap:8px;padding:12px 0 4px}' +
    '.dsub-save{appearance:none;font:inherit;cursor:pointer;border:1px solid transparent;border-radius:8px;padding:5px 14px;font-size:13px;background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-layer-3)}' +
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
      'cardIntro': 'Subscription accounts, rotation and limits.',
      'show': 'Show',
      'hide': 'Hide',
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
      'cardIntro': 'Аккаунты подписок, ротация и лимиты.',
      'show': 'Показать',
      'hide': 'Скрыть',
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

    // Карточка во вкладке «Плагины» рисует свой заголовок и сворачивание:
    // ядро даёт только рамку списка.
    function PluginCard(props) {
      const t = (props && props.t) || ((key) => key)
      const [open, setOpen] = React.useState(false)
      return React.createElement('div', { className: 'dsub-block' },
        React.createElement('div', { className: 'dsub-row' },
          React.createElement('span', { className: 'dsub-h' }, t('title')),
          React.createElement('span', { className: 'dsub-sub' }, t('cardIntro')),
          React.createElement('span', { style: { flex: 1 } }),
          React.createElement('button', {
            type: 'button',
            className: 'dsub-mini',
            onClick: () => setOpen(!open),
          }, open ? t('hide') : t('show')),
        ),
        open ? React.createElement(SubsSection, props) : null,
      )
    }

    function SubsSection(props) {
      // Переводчик приходит от слота, потому что в его записи указан locale.
      const t = (props && props.t) || ((key) => key)
      const [draft, setDraft] = React.useState(null)
      const [accounts, setAccounts] = React.useState([])
      const [providers, setProviders] = React.useState([])
      const [paste, setPaste] = React.useState({})
      const [checkRes, setCheckRes] = React.useState({})
      const [checking, setChecking] = React.useState({})
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
        } catch (e) { setErr(String(e.message || e)) }
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
                    type: 'button', className: 'dsub-mini',
                    disabled: checking[key],
                    onClick: () => doCheck(row.slot.provider, row.slot.index).catch((e) => setErr(String(e.message || e))),
                  }, checking[key] ? '...' : 'Check'),
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
                account.refreshError ? React.createElement('div', { className: 'dsub-bad' }, 'reconnect required: ' + account.refreshError) : null,
                (function(){ var r=checkRes[key]; if(!r) return null; var txt=r.ok ? ('ok ' + (r.email||'')) : ('fail ' + (r.error && r.error.message || '')); var cls=r.ok ? 'dsub-ok' : 'dsub-bad'; var q=r.quota; if(q && q.remaining!=null) txt += ' quota:'+q.remaining+(q.limit!=null?'/'+q.limit:''); return React.createElement('div', {className: cls}, txt) })(),
                account.validationUrl ? React.createElement('div', { className: 'dsub-verify' },
                  t('verifyPrefix'),
                  React.createElement('a', { href: account.validationUrl, target: '_blank', rel: 'noopener noreferrer' }, t('verifyLink')),
                  t('verifySuffix'),
                ) : null,
(function(){
                  var parts=[]
                  var wins=account.usage
                  if(Array.isArray(wins)&&wins.length){
                    wins.forEach(function(w){
                      if(w&&w.usedPercent!=null)parts.push(t('limit')+' '+(w.ru||w.id)+': '+Math.round(w.usedPercent)+'/100%')
                    })
                  }
                  var q=account.quota
                  if(q){
                    var qa=[]
                    if(q.remaining!=null&&q.limit!=null)qa.push(q.remaining+'/'+q.limit)
                    else if(q.remaining!=null)qa.push(String(q.remaining))
                    if(q.usedPercent!=null)qa.push(Math.round(q.usedPercent)+'%')
                    if(q.resetAt){var d=new Date(q.resetAt);qa.push(d.toLocaleTimeString())}
                    if(qa.length)parts.push(t('quota')+': '+qa.join(' / '))
                  }
                  if(!wins&&!q&&account.usagePercent!=null)parts.push(Math.round(account.usagePercent)+'/100%')
                  var at=(q&&q.measuredAt)||(account.usageAt||0)
                  if(at){var m=Math.round((Date.now()-at)/60000);if(m>=1)parts.push(m+'m')}
                  if(!parts.length)return null
                  return React.createElement('span',{className:'dsub-sub'},parts.join(' \u00b7 '))
                })(),

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
        React.createElement('div', { className: 'dsub-foot' },
          React.createElement('button', {
            type: 'button', className: 'dsub-save',
            onClick: () => save().catch((e) => setErr(String(e.message || e))),
          }, t('save')),
          saved ? React.createElement('span', { className: 'dsub-ok' }, t('saved')) : null,
          err ? React.createElement('span', { className: 'dsub-bad' }, err) : null,
        ),
      )
    }

    // Карточка во вкладке «Плагины» — как карточки bash/agent-loop/web-search:
    // заголовок с именем, описанием и шевроном, сворачивание, каёмка.
    function PluginCard(props) {
      const t = (props && props.t) || ((key) => key)
      const [open, setOpen] = React.useState(false)
      return React.createElement('li', {
        className: 'dsub-card' + (open ? ' dsub-cardOpen' : ''),
      },
        React.createElement('button', {
          type: 'button',
          className: 'dsub-header',
          onClick: () => setOpen(!open),
          'aria-expanded': open,
        },
          React.createElement('div', { className: 'dsub-headText' },
            React.createElement('div', { className: 'dsub-name' }, t('title')),
            React.createElement('div', { className: 'dsub-description' }, t('cardIntro')),
          ),
          React.createElement('svg', {
            className: 'dsub-chevron' + (open ? ' dsub-chevronOpen' : ''),
            width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none',
          },
            React.createElement('path', {
              d: 'M4 6l4 4 4-4', stroke: 'currentColor', 'stroke-width': 1.5,
              'stroke-linecap': 'round', 'stroke-linejoin': 'round',
            }),
          ),
        ),
        open ? React.createElement('div', { className: 'dsub-body' },
          React.createElement(SubsSection, props),
        ) : null,
      )
    }

    function registerSettings(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { en, ru }), 'dsh-subscriptions: словари')
      // Подписи вне компонента берут переводчик, привязанный к namespace.
      const t = ctx.locale.bind(NS)
      // Штатное место — вкладка «Плагины»: карточка со своим заголовком и
      // сворачиванием вместо строки в боковом списке. Ключ регистрации обязан
      // равняться пространству настроек, иначе вкладка молча не покажет слот.
      let moved = false
      try {
        moved = !!ctx.slots.inject('settings.plugin.item', () => ctx.slots.register(
          {
            name: 'settings.plugin.item',
            key: NS,
            locale: NS,
            inject: () => ({ ctx: ctx }),
          },
          PluginCard,
        ))
      } catch { moved = false }
      if (moved) return
      // Запасной путь для сборок без settings.plugin.item: прежний раздел,
      // чтобы настройки не пропали.
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
