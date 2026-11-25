function ignoreClientError(label) {
  return function onIgnoredClientError(err) {
    if (typeof console !== 'undefined' && console.debug) {
      console.debug('[dsh-subscriptions:client] ignored ' + (label || 'error') + ':', err && err.message || err)
    }
  }
}

window.__ModuleLoader__.load({
  id: '@goodandready/dsh-subscriptions',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    const React = require('react')
    // #31: overlays must live beside the app root. Inside the session header
    // their wrapper inherits the header's stacking context and clipping, so the
    // card is cut off. Portal every `.dsub-modalWrap` to document.body.
    let createPortal = null
    try {
      const ReactDOM = require('react-dom')
      if (ReactDOM && typeof ReactDOM.createPortal === 'function') createPortal = ReactDOM.createPortal
    } catch {
      createPortal = null
    }
    const h = (type, props, ...children) => {
      const element = React.createElement(type, props, ...children)
      const className = props && props.className
      if (createPortal && typeof className === 'string' && className.split(/\s+/).indexOf('dsub-modalWrap') !== -1
        && typeof document !== 'undefined' && document.body) {
        return createPortal(element, document.body)
      }
      return element
    }
    // #959: shared modal behaviour — scroll lock, Escape, Tab trap, focus restore.
    function useModalA11y(open, onClose) {
      React.useEffect(() => {
        if (!open || typeof document === 'undefined') return undefined
        const previous = document.activeElement
        const body = document.body
        const oldOverflow = body ? body.style.overflow : ''
        if (body) body.style.overflow = 'hidden'
        const onKey = (event) => {
          if (event.key === 'Escape' && typeof onClose === 'function') {
            event.preventDefault()
            onClose()
            return
          }
          if (event.key !== 'Tab') return
          const wrap = document.querySelector('.dsub-modalWrap')
          const card = wrap && wrap.querySelector('.dsub-modal')
          if (!card) return
          const focusable = [...card.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]
            .filter((el) => el.offsetParent !== null)
          if (!focusable.length) return
          const first = focusable[0]
          const last = focusable[focusable.length - 1]
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault()
            last.focus()
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault()
            first.focus()
          }
        }
        document.addEventListener('keydown', onKey, true)
        return () => {
          document.removeEventListener('keydown', onKey, true)
          if (body) body.style.overflow = oldOverflow
          try { if (previous && typeof previous.focus === 'function') previous.focus() } catch (err) { debugIgnored("client.js: focus restore", err) }
        }
      }, [open, onClose])
    }
    let t = (key) => key
    const setT = (fn) => { t = fn }
    function debugIgnored(label, err) {
      if (typeof console !== 'undefined' && typeof console.debug === 'function') {
        console.debug('[dsh-subscriptions] ignored ' + label + ': ' + (err && err.message || err))
      }
    }
    class ErrorBoundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { hasError: false, error: null }
      }
      static getDerivedStateFromError(error) {
        return { hasError: true, error }
      }
      componentDidCatch(error, info) {
        try { console.error("[dsh-subscriptions UI error]", error, info) } catch (err) { debugIgnored("client.js: fallback if console fails", err) }
      }
      render() {
        if (this.state.hasError) {
          return h(
            "div",
            { style: { padding: "12px", border: "1px solid var(--dsw-alias-state-error-primary)", borderRadius: "8px", background: "var(--dsw-alias-bg-layer-2)", margin: "8px 0", fontSize: "13px" } },
            h("div", { style: { fontWeight: 600, color: "var(--dsw-alias-state-error-primary)", marginBottom: "4px" } }, t('uiErrorTitle')),
            h("div", { style: { color: "var(--dsw-alias-label-secondary)", fontSize: "12px", marginBottom: "8px" } }, String(this.state.error && this.state.error.message || this.state.error || t('uiErrorUnknown'))),
            h("button", {
              className: "dsub-mini",
              onClick: () => this.setState({ hasError: false, error: null })
            }, t('settingsRetry'))
          )
        }
        return this.props.children
      }
    }
    const cssId = 'dsh-subscriptions/settings.module.css'
    if (typeof document !== 'undefined' && !document.querySelector('link[data-plugin-css="' + cssId + '"]')) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = '/dsh-subscriptions/client.css'
      link.dataset.pluginCss = cssId
      link.setAttribute('data-dsh-plugin', 'dsh-subscriptions')
      document.head.appendChild(link)
    }
    const NS = 'dsh-subscriptions'
    const PKG = '@goodandready/dsh-subscriptions'
    const ROW_ID = 'dsh-subscriptions'
    const ROW_CONFIG_KEY = PKG + '#' + ROW_ID
    function safeExternalUrl(raw, allowDataImage) {
      const text = String(raw == null ? '' : raw).trim()
      if (!text) return ''
      if (allowDataImage && /^data:image\/(?:png|jpe?g|gif|webp|svg\+xml)[;,]/i.test(text)) return text
      try {
        const base = (typeof window !== 'undefined' && window.location && window.location.origin) || 'http://127.0.0.1'
        const url = new URL(text, base)
        if (url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'dsh-app:') return url.href
      } catch (err) { debugIgnored("client.js: invalid url", err) }
      return ''
    }
    async function copyText(text) {
      try {
        if (typeof navigator === 'undefined' || !navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') return false
        await navigator.clipboard.writeText(String(text == null ? '' : text))
        return true
      } catch {
        return false
      }
    }
    // #1057: the English dictionary is a lazy chunk; it is registered as soon
    // as it arrives, before the Chinese one.
    let en = {}
                function cleanErrorMessage(raw) {
      if (!raw) return ''
      var text = typeof raw === 'string' ? raw : (raw.message || String(raw))
      text = text.trim()
      if (text.charAt(0) === '{' && text.charAt(text.length - 1) === '}') {
        try {
          var parsed = JSON.parse(text)
          if (parsed.error && parsed.error.message) text = parsed.error.message
          else if (parsed.message) text = parsed.message
          else if (parsed.code) text = parsed.code
        } catch (err) { debugIgnored("client.js: ignore parse error", err) }
      }
      var firstLine = text.split('\n')[0].trim()
      if (firstLine.length > 160) return firstLine.slice(0, 157) + '...'
      return firstLine
    }
    function normalizePlanBadge(provider, plan) {
      if (!plan && provider !== 'kimi' && provider !== 'glm') return null
      var p = String(plan || '').toLowerCase().replace(/[^a-z0-9]/g, '')
      var label = plan
      if (provider === 'codex') {
        if (p.indexOf('pro20') >= 0 || p === 'pro') label = 'Pro 20x'
        else if (p.indexOf('pro5') >= 0 || p.indexOf('prolite') >= 0) label = 'Pro 5x'
        else if (p.indexOf('team') >= 0) label = 'Team'
        else if (p.indexOf('plus') >= 0) label = 'Plus'
        else if (p.indexOf('enterp') >= 0) label = 'Enterprise'
      } else if (provider === 'claude') {
        if (p.indexOf('enterp') >= 0) label = 'Enterprise'
        else if (p.indexOf('team') >= 0) label = 'Team'
        else if (p.indexOf('max') >= 0) label = 'Max'
        else if (p.indexOf('pro') >= 0) label = 'Pro'
      } else if (provider === 'grok') {
        if (p.indexOf('super') >= 0) label = 'SuperGrok'
        else if (p.indexOf('plus') >= 0) label = 'X Premium+'
        else if (p.indexOf('premium') >= 0) label = 'X Premium'
      } else if (provider === 'antigravity') {
        if (p.indexOf('ultra') >= 0) label = 'Ultra'
        else if (p.indexOf('pro') >= 0) label = 'Pro'
      } else if (provider === 'kimi') {
        label = 'Coding Plan'
      } else if (provider === 'glm') {
        label = '150% Boost'
      } else if (provider === 'perplexity') {
        label = 'Pro'
      } else if (provider === 'jetbrains') {
        label = 'AI Assistant'
      }
      return label ? h('span', { className: 'dsub-planBadge' }, label) : null
    }
    function pad2(n) {
      return String(n).padStart(2, '0')
    }
    function formatMmSs(totalSeconds) {
      const total = Math.max(0, Math.ceil(Number(totalSeconds) || 0))
      return pad2(Math.floor(total / 60)) + ':' + pad2(total % 60)
    }
    function barTone(pct, normalColor = 'var(--dsw-alias-state-success-primary)') {
      const p = Number(pct) || 0
      if (p >= 90) return { cls: 'dsub-barFull', tag: 'dsub-tag-bad', color: 'var(--dsw-alias-state-error-primary)' }
      if (p >= 70) return { cls: 'dsub-barWarn', tag: 'dsub-tag-warn', color: 'var(--dsw-alias-state-warn-primary)' }
      return { cls: '', tag: 'dsub-tag-ok', color: normalColor }
    }
    function ledClass(pct) {
      const p = Number(pct) || 0
      return p >= 90 ? 'dsub-ledBad' : (p >= 70 ? 'dsub-ledWarn' : 'dsub-ledOk')
    }
    function formatRelativeReset(resetAt, lang, now) {
      if (!resetAt || !Number.isFinite(resetAt) || resetAt <= 0) return ''
      var delta = resetAt - (now || Date.now())
      var isZh = lang === 'zh'
      if (delta <= 0) return isZh ? '刚刚' : 'just now'
      var totalMinutes = Math.max(1, Math.round(delta / 60000))
      var days = Math.floor(totalMinutes / 1440)
      var hours = Math.floor((totalMinutes % 1440) / 60)
      var minutes = totalMinutes % 60
      var bits = []
      if (days) bits.push(days + (isZh ? '天' : 'd'))
      if (hours) bits.push(hours + (isZh ? '小时' : 'h'))
      if (minutes || !bits.length) bits.push(minutes + (isZh ? '分' : 'm'))
      return (isZh ? '' : 'in ') + bits.join(' ') + (isZh ? '后' : '')
    }
    function ResetCountdown(props) {
      const [now, setNow] = React.useState(Date.now())
      React.useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 1000)
        return () => clearInterval(id)
      }, [])
      const ms = (props.resetAt || 0) - now
      if (ms <= 0) return null
      const total = Math.floor(ms / 1000)
      const d = new Date(props.resetAt)
      const timeStr = pad2(d.getHours()) + ':' + pad2(d.getMinutes())
      const relStr = formatRelativeReset(props.resetAt, t('lang'), now)
      if (total > 3600) {
        return h('span', { className: 'dsub-sub', style: { fontVariantNumeric: 'tabular-nums' } },
          '⏳ ' + t('windowResetsAt') + ' ' + timeStr + ' (' + relStr + ')')
      }
      return h('span', { className: 'dsub-sub', style: { fontVariantNumeric: 'tabular-nums' } },
        '⏳ ' + t('windowResetsAt') + ' ' + timeStr + ' (' + relStr + ' · ' + formatMmSs(total) + ')')
    }
    // #960: the reset-credit countdown lives in its own component so a 1 s tick
    // never re-renders the whole settings section.
    function ResetCreditsPanel(props) {
      const t = (props && props.t) || ((key) => key)
      const st = (props && props.st) || { phase: 'idle' }
      const [now, setNow] = React.useState(() => Date.now())
      React.useEffect(() => {
        if (!st || st.phase !== 'confirm' || st.result) return undefined
        setNow(Date.now())
        const id = setInterval(() => {
          if (typeof document === 'undefined' || document.visibilityState !== 'hidden') setNow(Date.now())
        }, 1000)
        return () => clearInterval(id)
      }, [st && st.phase, st && st.readyAt, st && st.result])
      function resultText(code) {
        if (code === 'reset') return t('resetDone')
        if (code === 'nothing_to_reset') return t('resetNothing')
        if (code === 'no_credit') return t('resetNoCredit')
        if (code === 'already_redeemed') return t('resetRedeemed')
        return code
      }
      if (st.phase !== 'confirm') {
        return h('div', { className: 'dsub-panel-box' },
          h('div', { className: 'dsub-panel-title' },
            h('span', null, '⚡ ' + t('resetCredits')),
            h('button', {
              type: 'button',
              className: 'dsub-mini',
              disabled: st.phase === 'loading',
              onClick: () => { if (typeof props.onPrepare === 'function') props.onPrepare() },
            }, st.phase === 'loading' ? '…' : t('resetCreditsAction'))
          ),
          h('div', { className: 'dsub-panel-desc' }, t('resetCreditsHint'))
        )
      }
      const ready = now >= st.readyAt
      const secs = Math.max(0, Math.ceil((st.readyAt - now) / 1000))
      return h('div', { className: 'dsub-panel-box dsub-panel-warn' },
        h('div', { className: 'dsub-panel-title' },
          h('span', null, '⚠️ ' + t('resetCredits')),
          h('span', { className: 'dsub-tag-ok' }, t('resetAvailable') + ': ' + st.availableCount)
        ),
        st.creditExpiresAt ? h('div', { className: 'dsub-panel-desc' },
          t('resetExpires') + ': ' + new Date(st.creditExpiresAt).toLocaleString()
        ) : null,
        h('label', { className: 'dsub-row', style: { cursor: 'pointer', margin: '4px 0' } },
          h('input', {
            type: 'checkbox',
            checked: !!st.ack,
            onChange: (e) => { if (typeof props.onAck === 'function') props.onAck(e.target.checked) },
          }),
          h('span', { style: { fontSize: '12px', fontWeight: 500 } }, t('resetAck')),
        ),
        h('div', { className: 'dsub-row', style: { gap: '8px' } },
          h('button', {
            type: 'button',
            className: 'dsub-mini dsub-btn-danger',
            disabled: !st.ack || !ready || !!st.busy,
            onClick: () => { if (typeof props.onConsume === 'function') props.onConsume() },
          }, st.busy ? t('resetBusy') : (ready ? t('resetGo') : (t('resetWait') + ' ' + secs + 's'))),
          !ready && !st.busy ? h('span', { className: 'dsub-sub' }, t('resetWait') + ' ' + secs + 's') : null,
          st.ack && ready ? h('span', { className: 'dsub-ok', style: { fontSize: '12px', fontWeight: 600 } }, '✓ ' + t('resetReady')) : null,
          h('button', {
            type: 'button',
            className: 'dsub-mini',
            style: { marginLeft: 'auto' },
            onClick: () => { if (typeof props.onCancel === 'function') props.onCancel() },
          }, t('cancel'))
        ),
        st.result ? h('div', { className: 'dsub-ok', style: { fontWeight: 600 } }, resultText(st.result)) : null,
        st.error ? h('div', { className: 'dsub-bad' }, st.error) : null,
      )
    }
    function badgeFor(account, t) {
      if (!account || !account.configured) return t('notConnected')
      if (account.isRevoked) return t('sessionRevokedBadge')
      if (account.validationUrl) return t('verifyAccount')
      if (account.quarantineReason && account.quarantineUntil && account.quarantineUntil > Date.now()) {
        if (account.quarantineReason === 'SESSION_REVOKED' || account.quarantineReason === 'REVOKED') return t('sessionRevokedBadge')
        return account.quarantineReason === 'VERIFY' ? t('verifyAccount') : String(account.quarantineReason)
      }
      if (account.cooldownUntil && account.cooldownUntil > Date.now()) {
        const leftSec = Math.max(0, Math.ceil((account.cooldownUntil - Date.now()) / 1000))
        return t("coolingDown") + " (" + formatMmSs(leftSec) + ")"
      }
      // #1122: an account with purchased credit is not out of capacity, it is
      // spending overage. Saying "usage full" sends the user looking for a problem
      // that is not there.
      if (account.creditsAvailable === true) return t('connected')
      if (account.usagePercent != null && account.usagePercent >= 100) return t('usageFull')
      return t('connected')
    }
    let ChevronIcon = null
    try {
      const primitives = require('@deepseek-ai/dsh-client-ui-primitives')
      ChevronIcon = primitives && primitives.IconChevronDownOutline14
    } catch {
      ChevronIcon = null
    }
    function FallbackChevron(props) {
      return h('svg', { className: props.className, width: 14, height: 14, viewBox: '0 0 14 14', fill: 'none' },
        h('path', { d: 'M3.5 5.25L7 8.75l3.5-3.5', stroke: 'currentColor', 'stroke-width': 1.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
      )
    }
    const Chevron = ChevronIcon || FallbackChevron
    function lazyPanel(name) {
      const Component = React.lazy(() => require.async('./client.panels.js').then((mod) => ({ default: mod[name] })))
      return function LazyPanel(props) {
        return h(React.Suspense, { fallback: null }, h(Component, props))
      }
    }
    // #1087: same lazy mechanism, but for a named export of another chunk.
    function lazyChunk(chunk, exportName) {
      const Component = React.lazy(() => require.async(chunk).then((mod) => ({ default: mod[exportName] })))
      return function LazyChunk(props) {
        return h(React.Suspense, { fallback: null }, h(Component, props))
      }
    }
    const WebhookTestButton = lazyPanel('WebhookTestButton')
    const VaultSnapshotsPanel = lazyPanel('VaultSnapshotsPanel')
    const ProviderPacksPanel = lazyPanel('ProviderPacksPanel')
    const SourcesPanel = lazyPanel('SourcesPanel')
    const AccountsDashboardPanel = lazyPanel('AccountsDashboardPanel')
    const SpeedToggle = lazyPanel('SpeedToggle')
    const GeneratedMediaRow = lazyPanel('GeneratedMediaRow')
    const SubscriptionsPanel = lazyPanel('SubscriptionsPanel')
    // #1087: the policy surface is large (44 Config keys) and the main bundle is
    // close to the Store limit, so it ships as its own chunk.
    const policyPanel = lazyChunk('./client.policy.js', 'PolicyPanel')
    // #1103: the mode selector lives in the same chunk as the policies it governs.
    const modePicker = lazyChunk('./client.policy.js', 'ModePicker')

    // #623: the accounts pane is 740 lines of provider slot lists. It owns no
    // hooks, so it ships as a chunk built with the host's `h`, and the caller
    // hands it the state it needs in one `scope` object.
    let accountsPanePromise = null
    function loadAccountsPane() {
      if (!accountsPanePromise) {
        accountsPanePromise = require.async('./client.accounts.js')
          .then((mod) => mod.createAccountsPane({
            h,
            safeExternalUrl,
            copyText,
            ResetCountdown,
            ResetCreditsPanel,
            normalizePlanBadge,
            barTone,
            formatRelativeReset,
            badgeFor,
            cleanErrorMessage,
          }))
      }
      return accountsPanePromise
    }
    const AccountsPane = React.lazy(() => loadAccountsPane().then((built) => ({ default: built.AccountsPane })))
    // #839 model-list helpers
    function modelListSearchText(model) {
      const parts = [model && model.id, model && model.name, model && model.alias, model && model.provider, model && model.providerName]
      if (model && Array.isArray(model.aliases)) parts.push.apply(parts, model.aliases)
      return parts.filter(Boolean).join(' ').toLowerCase()
    }
    function filterModelList(models, query) {
      const list = Array.isArray(models) ? models : []
      const q = String(query || '').trim().toLowerCase()
      if (!q) return list.slice()
      return list.filter((model) => modelListSearchText(model).includes(q))
    }
    function modelAvailabilityRank(model) {
      const status = String(model && model.pool && model.pool.status || 'unconfigured').toLowerCase()
      const order = { available: 0, degraded: 1, cooldown: 2, quarantined: 3, exhausted: 4, unconfigured: 5 }
      return order[status] != null ? order[status] : 6
    }
    function sortModelList(models, sortKey) {
      const list = Array.isArray(models) ? models.slice() : []
      const key = String(sortKey || 'name')
      const byName = (a, b) => String(a && (a.name || a.id) || '').localeCompare(String(b && (b.name || b.id) || ''), undefined, { numeric: true, sensitivity: 'base' })
      list.sort((a, b) => {
        if (key === 'provider') {
          const byProvider = String(a && (a.providerName || a.provider) || '').localeCompare(String(b && (b.providerName || b.provider) || ''), undefined, { sensitivity: 'base' })
          if (byProvider) return byProvider
        } else if (key === 'context') {
          const delta = Number(b && b.contextWindow || 0) - Number(a && a.contextWindow || 0)
          if (delta) return delta
        } else if (key === 'availability') {
          const delta = modelAvailabilityRank(a) - modelAvailabilityRank(b)
          if (delta) return delta
        }
        return byName(a, b)
      })
      return list
    }
    function modelListCounts(all, shown) {
      const total = Array.isArray(all) ? all.length : 0
      const visible = Array.isArray(shown) ? shown.length : 0
      return { total, shown: visible, hidden: Math.max(0, total - visible) }
    }
    // #839 end model-list helpers

    // #1118: SubsSection held all 54 states in one component. They are grouped
    // here by concern; names are unchanged, so no caller had to adapt.
    /** The settings draft, its revision and the saved/unsaved marker. */
    function useSettingsDraft() {
      const [draft, setDraft] = React.useState(null)
      const [revision, setRevision] = React.useState(null)
      const [saved, setSaved] = React.useState(false)
      const [savedSnapshot, setSavedSnapshot] = React.useState(null)
      return { draft, setDraft, revision, setRevision, saved, setSaved, savedSnapshot, setSavedSnapshot }
    }

    /** Per-account actions and their in-flight state. */
    function useAccountActions() {
      const [checking, setChecking] = React.useState({})
      const [batch, setBatch] = React.useState(null)
      const [checkRes, setCheckRes] = React.useState({})
      const [paste, setPaste] = React.useState({})
      const [device, setDevice] = React.useState({})
      const [loginLinks, setLoginLinks] = React.useState({})
      const [proxyRes, setProxyRes] = React.useState({})
      const [reset, setReset] = React.useState({})
      const [tokenDraft, setTokenDraft] = React.useState({})
      const [openHelp, setOpenHelp] = React.useState({})
      const [headlessInfo, setHeadlessInfo] = React.useState({})
      const [copiedSsh, setCopiedSsh] = React.useState({})
      return {
        checking, setChecking, batch, setBatch, checkRes, setCheckRes,
        paste, setPaste, device, setDevice, loginLinks, setLoginLinks,
        proxyRes, setProxyRes, reset, setReset, tokenDraft, setTokenDraft,
        openHelp, setOpenHelp, headlessInfo, setHeadlessInfo,
        copiedSsh, setCopiedSsh,
      }
    }

    /** Telemetry, analytics and the host health. */
    function useTelemetryState() {
      const [telemetry, setTelemetry] = React.useState(null)
      const [analytics, setAnalytics] = React.useState(null)
      const [savingsReport, setSavingsReport] = React.useState(null)
      const [queueStats, setQueueStats] = React.useState(null)
      const [hostPing, setHostPing] = React.useState({ ok: true, latencyMs: null })
      const [smoke, setSmoke] = React.useState({ testing: false, result: null })
      const [diag, setDiag] = React.useState('')
      const [diagReport, setDiagReport] = React.useState(null)
      const [sessionAnalysis, setSessionAnalysis] = React.useState(null)
      const [analyzingCache, setAnalyzingCache] = React.useState(false)
      return {
        telemetry, setTelemetry, analytics, setAnalytics,
        savingsReport, setSavingsReport, queueStats, setQueueStats,
        hostPing, setHostPing, smoke, setSmoke, diag, setDiag,
        diagReport, setDiagReport, sessionAnalysis, setSessionAnalysis,
        analyzingCache, setAnalyzingCache,
      }
    }

    /** Live host data: accounts, providers, models, versions. */
    function useHostCatalog() {
      const [accounts, setAccounts] = React.useState([])
      const [providers, setProviders] = React.useState([])
      const [modelsCatalog, setModelsCatalog] = React.useState([])
      const [clientVersions, setClientVersions] = React.useState(null)
      const [discovered, setDiscovered] = React.useState([])
      const [onboardingBusy, setOnboardingBusy] = React.useState(false)
      return {
        accounts, setAccounts, providers, setProviders,
        modelsCatalog, setModelsCatalog, clientVersions, setClientVersions,
        discovered, setDiscovered, onboardingBusy, setOnboardingBusy,
      }
    }

    /** The view: tab, mounted panes, search fields. */
    function useSettingsView() {
      const [tab, setTab] = React.useState('overview')
      const [mountedPanes, setMountedPanes] = React.useState({ overview: true })
      const [settingsQuery, setSettingsQuery] = React.useState('')
      const [pickerOpen, setPickerOpen] = React.useState(false)
      const [pickerQuery, setPickerQuery] = React.useState('')
      const [newProviders, setNewProviders] = React.useState([])
      const [modelQuery, setModelQuery] = React.useState('')
      const [modelSort, setModelSort] = React.useState('name')
      const [modelLimit, setModelLimit] = React.useState(40)
      const [poolModelQuery, setPoolModelQuery] = React.useState({})
      return {
        tab, setTab, mountedPanes, setMountedPanes, settingsQuery, setSettingsQuery,
        pickerOpen, setPickerOpen, pickerQuery, setPickerQuery,
        newProviders, setNewProviders, modelQuery, setModelQuery,
        modelSort, setModelSort, modelLimit, setModelLimit,
        poolModelQuery, setPoolModelQuery,
      }
    }

    /** Modals the card can raise. */
    function useCardModals() {
      const [wizardModal, setWizardModal] = React.useState(null)
      const [backupModal, setBackupModal] = React.useState(null)
      return { wizardModal, setWizardModal, backupModal, setBackupModal }
    }

    /** Vault backup, restore and sync state. */
    function useVaultBackup() {
      const [backupPass, setBackupPass] = React.useState('')
      const [backupData, setBackupData] = React.useState('')
      const [backupErr, setBackupErr] = React.useState('')
      const [backupInfo, setBackupInfo] = React.useState('')
      const [backupLoading, setBackupLoading] = React.useState(false)
      const [vaultSyncInfo, setVaultSyncInfo] = React.useState(null)
      const [vaultSyncLoading, setVaultSyncLoading] = React.useState(false)
      return {
        backupPass, setBackupPass, backupData, setBackupData,
        backupErr, setBackupErr, backupInfo, setBackupInfo,
        backupLoading, setBackupLoading,
        vaultSyncInfo, setVaultSyncInfo, vaultSyncLoading, setVaultSyncLoading,
      }
    }

    /** The plugin updater. */
    function useUpdater() {
      const [updater, setUpdater] = React.useState({ checking: false, updating: false, status: null, message: '' })
      return { updater, setUpdater }
    }

    /** The card's own feedback lines. */
    function useNotices() {
      const [err, setErr] = React.useState('')
      const [info, setInfo] = React.useState('')
      return { err, setErr, info, setInfo }
    }

    function SubsSection(props) {
      const t = (props && props.t) || ((key) => key)
      const { draft, setDraft, revision, setRevision, saved, setSaved, savedSnapshot, setSavedSnapshot } = useSettingsDraft()
      const { wizardModal, setWizardModal, backupModal, setBackupModal } = useCardModals()
      const {
        backupPass, setBackupPass, backupData, setBackupData,
        backupErr, setBackupErr, backupInfo, setBackupInfo,
        backupLoading, setBackupLoading,
        vaultSyncInfo, setVaultSyncInfo, vaultSyncLoading, setVaultSyncLoading,
      } = useVaultBackup()
      const { updater, setUpdater } = useUpdater()
      const { err, setErr, info, setInfo } = useNotices()
      const {
        checking, setChecking, batch, setBatch, checkRes, setCheckRes,
        paste, setPaste, device, setDevice, loginLinks, setLoginLinks,
        proxyRes, setProxyRes, reset, setReset, tokenDraft, setTokenDraft,
        openHelp, setOpenHelp, headlessInfo, setHeadlessInfo,
        copiedSsh, setCopiedSsh,
      } = useAccountActions()
      const {
        telemetry, setTelemetry, analytics, setAnalytics, savingsReport, setSavingsReport,
        queueStats, setQueueStats, hostPing, setHostPing, smoke, setSmoke,
        diag, setDiag, diagReport, setDiagReport,
        sessionAnalysis, setSessionAnalysis, analyzingCache, setAnalyzingCache,
      } = useTelemetryState()
      const {
        accounts, setAccounts, providers, setProviders, modelsCatalog, setModelsCatalog,
        clientVersions, setClientVersions, discovered, setDiscovered,
        onboardingBusy, setOnboardingBusy,
      } = useHostCatalog()
      const {
        tab, setTab, mountedPanes, setMountedPanes, settingsQuery, setSettingsQuery,
        pickerOpen, setPickerOpen, pickerQuery, setPickerQuery,
        newProviders, setNewProviders, modelQuery, setModelQuery,
        modelSort, setModelSort, modelLimit, setModelLimit, poolModelQuery, setPoolModelQuery,
      } = useSettingsView()
      const settingsRef = React.useRef(null)
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
          reload().catch(ignoreClientError('client.js: reload'))
        } catch (e) {
          setReset((m) => Object.assign({}, m, { [key]: Object.assign({}, st, { busy: false, error: String(e && e.message || e) }) }))
        }
      }
      const runAnalyzeSession = () => {
        setAnalyzingCache(true)
        fetch('/dsh-subscriptions/history?limit=50', { cache: 'no-store' })
          .then((r) => r.json())
          .then((h) => {
            const items = (h && h.items) || []
            const events = items.map((it) => ({
              usage: {
                inputTokens: it.inputTokens ?? it.promptTokens ?? (it.tokens && it.tokens.prompt) ?? 0,
                cacheReadTokens: it.cacheReadTokens ?? it.cachedTokens ?? (it.tokens && it.tokens.cached) ?? 0,
                outputTokens: it.outputTokens ?? it.completionTokens ?? (it.tokens && it.tokens.completion) ?? 0,
                promptTokens: it.inputTokens ?? it.promptTokens ?? (it.tokens && it.tokens.prompt) ?? 0,
                cachedTokens: it.cacheReadTokens ?? it.cachedTokens ?? (it.tokens && it.tokens.cached) ?? 0,
                completionTokens: it.outputTokens ?? it.completionTokens ?? (it.tokens && it.tokens.completion) ?? 0,
              },
            }))
            return fetch('/dsh-subscriptions/analyze-session', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ events }),
            })
          })
          .then((r) => r.json())
          .then((d) => {
            setAnalyzingCache(false)
            if (d && d.ok && d.analysis) {
              setSessionAnalysis(d.analysis)
            }
          })
          .catch((e) => {
            setAnalyzingCache(false)
            setErr(cleanErrorMessage(e && e.message || e))
          })
      }
      const genDiag = () => {
        fetch('/dsh-subscriptions/diagnostics', { cache: 'no-store' })
          .then((r) => r.json())
          .then((d) => {
            if (d && d.ok && d.report) setDiagReport(d.report)
            const txt = d && d.ok ? JSON.stringify(d.report, null, 2) : (t('errorPrefix') + ': ' + ((d && d.error && d.error.message) || t('uiErrorUnknown')))
            setDiag(txt)
            copyText(txt)
          })
          .catch((e) => setDiag(t('errorPrefix') + ': ' + String(e && e.message || e)))
      }
      const loadVaultSyncStatus = () => {
        fetch('/dsh-subscriptions/vault/sync/status')
          .then((r) => r.json())
          .then((d) => { if (d && d.ok) setVaultSyncInfo(d.status) })
          .catch((e) => setBackupErr(cleanErrorMessage(e && e.message ? e.message : e)))
      }
      const doVaultSyncPush = async () => {
        setBackupErr(''); setBackupInfo(''); setVaultSyncLoading(true)
        try {
          const res = await fetch('/dsh-subscriptions/vault/sync/push', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          })
          const d = await res.json().catch(() => ({}))
          if (!res.ok || !d.ok) throw new Error((d.error && d.error.message) || ('HTTP ' + res.status))
          setBackupInfo(t('vaultSyncPushOk'))
          if (d.status) setVaultSyncInfo(d.status)
        } catch (e) {
          setBackupErr(cleanErrorMessage(e.message || e))
        }
        setVaultSyncLoading(false)
      }
      const doVaultSyncPull = async () => {
        setBackupErr(''); setBackupInfo(''); setVaultSyncLoading(true)
        try {
          const res = await fetch('/dsh-subscriptions/vault/sync/pull', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          })
          const d = await res.json().catch(() => ({}))
          if (!res.ok || !d.ok) throw new Error((d.error && d.error.message) || ('HTTP ' + res.status))
          setBackupInfo(t('vaultSyncPullOk') + (d.result ? ' (' + d.result.slotCount + ' slots)' : ''))
          if (d.status) setVaultSyncInfo(d.status)
          if (d.accounts) setAccounts(d.accounts)
          await reload()
        } catch (e) {
          setBackupErr(cleanErrorMessage(e.message || e))
        }
        setVaultSyncLoading(false)
      }
            const runWizard = async (provider, index, ref, includeNetwork = false) => {
        setWizardModal({
          provider: provider || 'all',
          index: index || 1,
          ref: ref || null,
          loading: true,
          report: null,
          includeNetwork,
          error: '',
        })
        try {
          const res = await fetch('/dsh-subscriptions/diagnostic-wizard', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider, index, ref, includeNetwork }),
          })
          const d = await res.json()
          if (!d || !d.ok) throw new Error((d && d.error && d.error.message) || ('HTTP ' + res.status))
          setWizardModal((m) => Object.assign({}, m, { loading: false, report: d.report, error: '' }))
        } catch (e) {
          setWizardModal((m) => Object.assign({}, m, { loading: false, error: cleanErrorMessage(e && e.message || e) }))
        }
      }
      const doExportBackup = async () => {
        setBackupErr(''); setBackupInfo(''); setBackupLoading(true)
        try {
          const res = await fetch('/dsh-subscriptions/vault/export', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ passphrase: backupPass, algorithm: 'pbkdf2' }),
          })
          const d = await res.json().catch(() => ({}))
          if (!res.ok || !d.ok) throw new Error((d.error && d.error.message) || ('HTTP ' + res.status))
          setBackupData(d.vault)
          setBackupInfo(t('backupExportOk') + ' (' + d.slotCount + ' slots)')
        } catch (e) {
          setBackupErr(cleanErrorMessage(e.message || e))
        }
        setBackupLoading(false)
      }
      const doImportBackup = async () => {
        setBackupErr(''); setBackupInfo(''); setBackupLoading(true)
        try {
          const res = await fetch('/dsh-subscriptions/vault/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ passphrase: backupPass, vault: backupData.trim() }),
          })
          const d = await res.json().catch(() => ({}))
          if (!res.ok || !d.ok) throw new Error((d.error && d.error.message) || ('HTTP ' + res.status))
          setBackupInfo(t('backupImportOk') + ' (' + d.slotCount + ' slots)')
          if (d.accounts) setAccounts(d.accounts)
          await reload()
        } catch (e) {
          setBackupErr(cleanErrorMessage(e.message || e))
        }
        setBackupLoading(false)
      }
      const downloadBackupFile = () => {
        if (!backupData) return
        try {
          const blob = new window.Blob([backupData], { type: 'text/plain;charset=utf-8' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = 'dsh-subscriptions-vault.enc'
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
          URL.revokeObjectURL(url)
        } catch (err) { debugIgnored("client.js: ignore", err) }
      }
      useModalA11y(!!wizardModal, () => setWizardModal(null))
      useModalA11y(pickerOpen, () => setPickerOpen(false))
      const checkUpdater = () => {
        setUpdater((u) => Object.assign({}, u, { checking: true, message: '' }))
        return fetch('/dsh-subscriptions/update', { cache: 'no-store' })
          .then((res) => res.json())
          .then((data) => {
            setUpdater((u) => Object.assign({}, u, { checking: false, status: data }))
            return data
          })
          .catch((e) => {
            setUpdater((u) => Object.assign({}, u, { checking: false, message: cleanErrorMessage(e.message || e) }))
          })
      }
      const performUpdate = async () => {
        setUpdater((u) => Object.assign({}, u, { updating: true, message: '' }))
        try {
          const res = await fetch('/dsh-subscriptions/update', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-dsh-plugin-update': '1',
            },
          })
          const data = await res.json().catch(() => ({}))
          if (!res.ok || !data.ok) {
            throw new Error((data && data.error && (data.error.message || data.error.code)) || ('HTTP ' + res.status))
          }
          setUpdater((u) => Object.assign({}, u, { updating: false, message: t('updateSuccessRestart') }))
          setTimeout(() => {
            window.location.reload()
          }, 3500)
        } catch (e) {
          setUpdater((u) => Object.assign({}, u, { updating: false, message: (t('updateFailed') + ': ' + cleanErrorMessage(e.message || e)) }))
        }
      }
      const reloadTelemetry = () => {
        fetch('/dsh-subscriptions/telemetry', { cache: 'no-store' })
          .then((r) => r.json())
          .then((d) => { if (d && d.ok && d.telemetry) setTelemetry(d.telemetry) })
          .catch(ignoreClientError('client.js: telemetry'))
        fetch('/dsh-subscriptions/analytics', { cache: 'no-store' })
          .then((r) => r.json())
          .then((d) => { if (d && d.ok && d.analytics) setAnalytics(d.analytics) })
          .catch(ignoreClientError('client.js: analytics'))
        fetch('/dsh-subscriptions/analytics/savings', { cache: 'no-store' })
          .then((r) => r.json())
          .then((d) => { if (d && d.ok && d.savings) setSavingsReport(d.savings) })
          .catch(ignoreClientError('client.js: savings'))
        fetch('/dsh-subscriptions/queue', { cache: 'no-store' })
          .then((r) => r.json())
          .then((d) => { if (d && d.ok && d.queue) setQueueStats(d.queue) })
          .catch(ignoreClientError('client.js: queue'))
        fetch('/dsh-subscriptions/diagnostics', { cache: 'no-store' })
          .then((r) => r.json())
          .then((d) => { if (d && d.ok && d.report) setDiagReport(d.report) })
          .catch(ignoreClientError('client.js: diagReport'))
      }
      const doPing = async (provider, index) => {
        try {
          const res = await fetch('/dsh-subscriptions/probe?mode=ping', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider, index }),
          })
          const d = await res.json()
          if (d && d.ok) {
            setAccounts((accs) => accs.map((a) => (a.provider === provider && a.index === index) ? Object.assign({}, a, { lastPingMs: d.latencyMs, latencyGrade: d.latencyGrade, lastDoctorVerdict: null }) : a))
            setInfo('📶 Ping: ' + d.latencyMs + 'ms (' + d.latencyGrade + ')')
          } else if (d && d.doctor) {
            setAccounts((accs) => accs.map((a) => (a.provider === provider && a.index === index) ? Object.assign({}, a, { lastPingMs: d.latencyMs, latencyGrade: d.latencyGrade, lastDoctorVerdict: d.doctor }) : a))
            setErr('🩺 ' + d.doctor.title)
          }
        } catch (e) {
          setErr(cleanErrorMessage(e.message || e))
        }
      }
      const doSyncModels = async (provider, index) => {
        try {
          const res = await fetch('/dsh-subscriptions/accounts/sync-models', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider, index }),
          })
          const d = await res.json()
          if (d && d.ok) {
            setAccounts((accs) => accs.map((a) => (a.provider === provider && a.index === index) ? Object.assign({}, a, { availableModels: d.models }) : a))
            setInfo('✓ ' + (t('modelsSynced') || 'Models synced') + ': ' + d.count + ' models')
          } else {
            setErr('✗ ' + ((d && d.doctor && d.doctor.title) || (d && d.error && d.error.message) || 'Sync failed'))
          }
        } catch (e) {
          setErr(cleanErrorMessage(e.message || e))
        }
      }
      const runSmokeTest = async (provider, index) => {
        setSmoke({ testing: true, result: null })
        try {
          const res = await fetch('/dsh-subscriptions/probe?mode=smoke', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider, index }),
          })
          const d = await res.json()
          setSmoke({ testing: false, result: d })
          reloadTelemetry()
        } catch (e) {
          setSmoke({ testing: false, result: { ok: false, error: { message: String(e && e.message || e) } } })
        }
      }
      const batchCancelRef = React.useRef(false)
      const timersRef = React.useRef(new Set())
      React.useEffect(() => () => {
        for (const id of timersRef.current) clearTimeout(id)
        timersRef.current.clear()
      }, [])
      const later = (fn, ms) => {
        const id = setTimeout(() => {
          timersRef.current.delete(id)
          fn()
        }, ms)
        timersRef.current.add(id)
        return id
      }
      const applyPayload = (data) => {
        if (data && data.revision != null) setRevision(data.revision)
        const next = JSON.parse(JSON.stringify((data && data.config) || {}))
        setDraft(next)
        setSavedSnapshot(JSON.parse(JSON.stringify(next)))
        setAccounts((data && data.accounts) || [])
        setProviders((data && data.providers) || [])
        setModelsCatalog((data && data.modelsCatalog) || [])
        setClientVersions((data && data.clientVersions) || null)
      }
      // #945: the guard must survive re-renders, so it lives in refs.
      const reloadSeqRef = React.useRef(0)
      const reloadAbortRef = React.useRef(null)
      const reload = () => {
        const seq = ++reloadSeqRef.current
        if (reloadAbortRef.current) reloadAbortRef.current.abort()
        const controller = new AbortController()
        reloadAbortRef.current = controller
        const t0 = Date.now()
        return fetch('/dsh-subscriptions/config', { cache: 'no-store', signal: controller.signal })
          .then(async (res) => {
            const data = await res.json().catch(() => ({}))
            // #957: a rejected config fetch must surface an error, not render an
            // empty editable form.
            if (!res.ok || (data && data.ok === false)) {
              throw new Error((data && data.error && data.error.message) || ('config request failed: HTTP ' + res.status))
            }
            return data
          })
          .then((data) => {
            if (seq !== reloadSeqRef.current) return data
            setHostPing({ ok: true, latencyMs: Date.now() - t0 })
            applyPayload(data)
            reloadTelemetry()
            return data
          })
          .catch((err) => {
            if (seq === reloadSeqRef.current && err && err.name !== 'AbortError') {
              setHostPing({ ok: false, latencyMs: null })
              throw err
            }
            return null
          })
      }
      React.useEffect(() => {
        let alive = true
        reload().catch((e) => { if (alive) setErr(String(e && e.message ? e.message : e)) })
        checkUpdater().catch(ignoreClientError('client.js: checkUpdater'))
        return () => {
          alive = false
          if (reloadAbortRef.current) reloadAbortRef.current.abort()
        }
      }, [])
      React.useEffect(() => {
        const pendingKeys = Object.entries(device).filter(([, d]) => d && d.status === 'pending')
        if (!pendingKeys.length) return
        const timers = pendingKeys.map(([key, d]) => setInterval(() => {
          devicePollOnce(key.split(':')[0], Number(key.split(':')[1])).catch(ignoreClientError('client.js: devicePollOnce'))
        }, d.intervalMs || 5000))
        return () => timers.forEach(clearInterval)
      }, [device])
      const dirty = React.useMemo(
        () => Boolean(draft && savedSnapshot && JSON.stringify(draft) !== JSON.stringify(savedSnapshot)),
        [draft, savedSnapshot],
      )
      // #960: panes mount on first visit and then stay alive (tab state kept).
      React.useEffect(() => {
        setMountedPanes((m) => (m[tab] ? m : Object.assign({}, m, { [tab]: true })))
      }, [tab])
      const catalogAll = React.useMemo(() => (Array.isArray(modelsCatalog) && modelsCatalog.length ? modelsCatalog : [
        { id: 'gpt-4o', contextLabel: '128k', capabilities: ['vision'], pool: { status: t('sourceAvailable') } },
        { id: 'o1 / o3-mini', contextLabel: '200k', capabilities: ['reasoning'], pool: { status: t('sourceAvailable') } },
        { id: 'claude-3-7-sonnet', contextLabel: '200k', capabilities: ['reasoning'], pool: { status: t('sourceAvailable') } },
        { id: 'claude-3-5-sonnet', contextLabel: '200k', capabilities: ['coding'], pool: { status: t('sourceAvailable') } },
        { id: 'grok-beta', contextLabel: '128k', capabilities: ['fast'], pool: { status: t('sourceAvailable') } },
        { id: 'gemini-2.5-pro', contextLabel: '1M', capabilities: ['vision'], pool: { status: t('sourceAvailable') } },
        { id: 'kimi-k1.5', contextLabel: '128k', capabilities: ['math'], pool: { status: t('sourceAvailable') } },
        { id: 'glm-4-plus', contextLabel: '128k', capabilities: ['chinese'], pool: { status: t('sourceAvailable') } },
      ]), [modelsCatalog, t])
      const catalogSorted = React.useMemo(
        () => sortModelList(filterModelList(catalogAll, modelQuery), modelSort),
        [catalogAll, modelQuery, modelSort],
      )
      const catalogShown = React.useMemo(() => catalogSorted.slice(0, modelLimit), [catalogSorted, modelLimit])
      const catalogCounts = React.useMemo(() => modelListCounts(catalogAll, catalogShown), [catalogAll, catalogShown])
      const paneMounted = (id) => Boolean(mountedPanes[id] || tab === id)
      React.useEffect(() => {
        if (!dirty) return undefined
        const warn = (event) => {
          event.preventDefault()
          event.returnValue = ''
          return ''
        }
        window.addEventListener('beforeunload', warn)
        return () => window.removeEventListener('beforeunload', warn)
      }, [dirty])
      // #1043: filter the visible settings groups by the search query. The form
      // is a long static tree, so the filter toggles a class instead of
      // restructuring every group into a registry.
      React.useEffect(() => {
        const root = settingsRef.current
        if (!root) return
        const query = String(settingsQuery || '').trim().toLowerCase()
        const groupList = root.querySelectorAll('.dsub-group')
        for (const group of groupList) {
          if (!query) { group.classList.remove('dsub-hidden'); continue }
          const summary = group.querySelector('summary')
          const text = (((summary && summary.textContent) || '') + ' ' + (group.textContent || '')).toLowerCase()
          group.classList.toggle('dsub-hidden', !text.includes(query))
        }
      }, [settingsQuery, tab, Boolean(draft)])

      if (!draft) {
        return h('div', { className: 'dsub-wrap', 'data-tab': tab },
          h('div', { className: 'dsub-row' },
            h('span', { className: 'dsub-sub' }, err ? t('settingsUnavailable') : t('settingsLoading')),
            err ? h('button', {
              type: 'button', className: 'dsub-mini',
              onClick: () => { setErr(''); reload().catch((e) => setErr(String(e && e.message || e))) },
            }, t('settingsRetry')) : null,
          ),
          err ? h('div', { className: 'dsub-bad' }, err) : null,
        )
      }
      const slots = Array.isArray(draft.slots) ? draft.slots : []
      const setSlots = (next) => setDraft((d) => {
        const base = Array.isArray(d && d.slots) ? d.slots : []
        return Object.assign({}, d, { slots: typeof next === 'function' ? next(base) : next })
      })
      const updateSlot = (provider, index, patch) => setSlots((prev) => prev.map((s) => (
        s && s.provider === provider && Number(s.index) === Number(index) ? Object.assign({}, s, patch) : s
      )))
      const moveSlot = (provider, index, delta) => setSlots((prev) => {
        const positions = prev
          .map((slot, position) => ({ slot, position }))
          .filter((row) => row.slot && row.slot.provider === provider)
        const from = positions.findIndex((row) => Number(row.slot.index) === Number(index))
        const to = from + delta
        if (from < 0 || to < 0 || to >= positions.length) return prev
        const next = prev.slice()
        const a = positions[from].position
        const b = positions[to].position
        const tmp = next[a]
        next[a] = next[b]
        next[b] = tmp
        return next
      })
      const accountOf = (provider, index) => accounts.find((a) => a.provider === provider && a.index === index) || {}
      const save = async () => {
        setErr(''); setSaved(false)
        const payload = revision != null ? Object.assign({}, draft, { revision }) : draft
        const res = await fetch('/dsh-subscriptions/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          if (res.status === 409) {
            reload().catch(ignoreClientError('client.js: reload'))
            throw new Error((data.error && data.error.message) || 'Configuration modified concurrently; reloaded.')
          }
          throw new Error((data.error && data.error.message) || ('HTTP ' + res.status))
        }
        applyPayload(data)
        // #974: apply the composer Speed visibility immediately, without a reload.
        try {
          window.dispatchEvent(new CustomEvent('dsh-subscriptions:config', {
            detail: {
              showSpeedToggle: Boolean(data && data.config && data.config.showSpeedToggle),
              showSubsPill: Boolean(data && data.config && data.config.showSubsPill),
            },
          }))
        } catch (err) { debugIgnored("client.js: config visibility event", err) }
        setSaved(true); later(() => setSaved(false), 2000)
      }
      const connect = async (provider, index) => {
        setErr('')
        if (provider === 'copilot' || provider === 'grok') {
          return deviceStartLogin(provider, index).catch((e) => setErr(cleanErrorMessage(e.message || e)))
        }
        if (provider === 'antigravity' && (!draft || !draft.antigravityClientId || !String(draft.antigravityClientId).trim())) {
          setErr(t('missingClientIdAntigravity'))
          return
        }
        let popup = null
        try { popup = window.open('', '_blank') } catch { popup = null }
        try {
          const res = await fetch('/dsh-subscriptions/oauth/start?provider=' + encodeURIComponent(provider) + '&index=' + encodeURIComponent(index), { cache: 'no-store' })
          const data = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error((data.error && data.error.message) || ('HTTP ' + res.status))
          const key = provider + ':' + index
          if (data.headless) setHeadlessInfo((m) => Object.assign({}, m, { [key]: data.headless }))
          const authTarget = safeExternalUrl(data.url)
          if (authTarget) {
            if (popup && !popup.closed) {
              // #968: sever the opener while both documents are still same-origin.
              try { popup.opener = null } catch (err) { debugIgnored("client.js: opener", err) }
              popup.location.href = authTarget
            } else {
              setLoginLinks((m) => Object.assign({}, m, { [key]: authTarget }))
            }
          } else if (popup && !popup.closed) {
            popup.close()
          }
        } catch (e) {
          if (popup && !popup.closed) popup.close()
          throw e
        }
      }
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
        if (data.headless) setHeadlessInfo((m) => Object.assign({}, m, { [key]: data.headless }))
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
          reload().catch(ignoreClientError('client.js: reload'))
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
      const doParkQuarantine = async (provider, index, durationMs) => {
        setErr("")
        try {
          const res = await fetch("/dsh-subscriptions/quarantine/park", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider, index, durationMs: durationMs || 3600000, reason: "MANUAL_PARK" }),
          })
          const data = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error((data.error && data.error.message) || ("HTTP " + res.status))
          setAccounts(data.accounts || [])
          setInfo(t("toastQuarantined"))
          later(() => setInfo(""), 3000)
        } catch (e) { setErr(cleanErrorMessage(e.message || e)) }
      }
      const doProbeQuarantine = async (provider, index, releaseOnly) => {
        setErr("")
        const key = provider + ":" + index
        setChecking((c) => Object.assign({}, c, { [key]: true }))
        try {
          const res = await fetch("/dsh-subscriptions/quarantine/probe", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ provider, index, release: Boolean(releaseOnly) }),
          })
          const data = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error((data.error && data.error.message) || ("HTTP " + res.status))
          setAccounts(data.accounts || [])
          if (data.success || data.released) {
            setInfo(t("toastReleased"))
            later(() => setInfo(""), 3000)
          } else if (data.error) {
            setErr(cleanErrorMessage(data.error))
          }
        } catch (e) { setErr(cleanErrorMessage(e.message || e)) }
        setChecking((c) => Object.assign({}, c, { [key]: false }))
      }
      const doCheck = async (provider, index) => {
        const key = provider + ':' + index
        setChecking((c) => Object.assign({}, c, { [key]: true }))
        setErr('')
        try {
          const res = await fetch('/dsh-subscriptions/probe?mode=check', {
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
        later(() => setInfo(''), 3000)
      }
      const runBatch = async (kind, provider) => {
        if (batch) return
        const rows = slots.filter((slot) => slot && slot.provider === provider)
        if (!rows.length) return
        batchCancelRef.current = false
        setBatch({ kind, provider, done: 0, total: rows.length })
        const queue = rows.slice()
        const worker = async () => {
          while (queue.length && !batchCancelRef.current) {
            const slot = queue.shift()
            try {
              if (kind === 'import') await importLocalCli(slot.provider, slot.index)
              else await doCheck(slot.provider, slot.index)
            } catch (e) {
              setErr(cleanErrorMessage(e.message || e))
            } finally {
              setBatch((b) => b ? Object.assign({}, b, { done: b.done + 1 }) : b)
            }
          }
        }
        await Promise.all([worker(), worker()])
        setBatch(null)
      }
      const cancelBatch = () => {
        batchCancelRef.current = true
        setBatch((b) => b ? Object.assign({}, b, { cancelled: true }) : b)
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
      const switchOrg = async (provider, index, organizationId) => {
        setErr('')
        try {
          const res = await fetch('/dsh-subscriptions/accounts/switch-organization', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider, index, organizationId }),
          })
          const data = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error((data.error && data.error.message) || ('HTTP ' + res.status))
          if (data.accounts) setAccounts(data.accounts)
        } catch (e) {
          setErr(cleanErrorMessage(e.message || e))
        }
      }
      const addSlot = (provider) => {
        const used = slots.filter((s) => s.provider === provider).map((s) => s.index)
        let index = 1
        while (used.indexOf(index) >= 0) index++
        setNewProviders((prev) => prev.includes(provider) ? prev : prev.concat([provider]))
        setSlots((prev) => prev.concat([{ provider: provider, index: index, label: '' }]))
      }
      const names = providers.length ? providers : [
        { id: 'codex', name: 'ChatGPT Codex' },
        { id: 'claude', name: 'Claude' },
        { id: 'grok', name: 'Grok' },
        { id: 'antigravity', name: 'Antigravity' },
      ]
      const connectedCount = accounts.filter((a) => a.configured).length

      // #1044: first-run helper - look for credentials the CLIs already stored.
      const runDiscovery = async () => {
        setErr('')
        setOnboardingBusy(true)
        try {
          const res = await fetch('/dsh-subscriptions/discover-local', { cache: 'no-store' })
          const data = await res.json().catch(() => ({}))
          if (!res.ok) throw new Error((data.error && data.error.message) || ('HTTP ' + res.status))
          const rows = Array.isArray(data.sessions) ? data.sessions
            : Array.isArray(data.found) ? data.found
              : Array.isArray(data.accounts) ? data.accounts : []
          setDiscovered(rows)
          if (!rows.length) setInfo(t('onboardingNothingFound'))
        } catch (e) { setErr(cleanErrorMessage(e.message || e)) }
        finally { setOnboardingBusy(false) }
      }
      return h('div', { className: 'dsub-wrap', 'data-tab': tab, ref: settingsRef },
        h('div', { className: 'dsub-header-bar' },
          h('div', { className: 'dsub-row', style: { marginTop: 0 } },
            h('span', {
              className: 'dsub-badge ' + (hostPing.ok ? 'dsub-badge-ok' : 'dsub-badge-bad')
            }, hostPing.ok
              ? (hostPing.latencyMs != null ? t('hostOnline') + ' (' + hostPing.latencyMs + ' ms)' : t('hostOnline'))
              : t('hostOffline')
            ),
            h('span', {
              className: 'dsub-badge ' + (connectedCount > 0 ? 'dsub-badge-ok' : 'dsub-badge-warn')
            }, connectedCount > 0
              ? (connectedCount + ' ' + t('subsLogged'))
              : t('subsNotLogged')
            ),
            h('span', {
              className: 'dsub-badge dsub-badge-neutral'
            }, t('subsPoolTitle') + ': ' + accounts.length),
            updater.status && updater.status.updateAvailable
              ? h('span', { className: 'dsub-badge dsub-badge-warn' },
                  '⬆ ' + t('updateAvailable') + ' (v' + (updater.status.latestVersion || '') + ')'
                )
              : (updater.status && updater.status.currentVersion
                  ? h('span', { className: 'dsub-badge dsub-badge-neutral' },
                      'v' + updater.status.currentVersion
                    )
                  : null
                ),
          ),
          h('div', { className: 'dsub-row', style: { marginTop: 0, gap: '8px' } },
            h('button', {
              type: 'button',
              className: 'dsub-mini dsub-btn-primary',
              onClick: () => setPickerOpen(true),
            }, '➕ ' + t('providerGallery')),
            updater.status && updater.status.updateAvailable && updater.status.canAutoUpdate
              ? h('button', {
                  type: 'button',
                  className: 'dsub-mini dsub-btn-primary',
                  disabled: updater.updating,
                  onClick: () => performUpdate(),
                }, updater.updating ? t('updating') : (t('updateNow') + ' → v' + updater.status.latestVersion))
              : null,
            h('button', {
              type: 'button',
              className: 'dsub-mini',
              disabled: smoke.testing,
              onClick: () => runSmokeTest(),
            }, smoke.testing ? t('smokeTesting') : t('runSmoke')),
          ),
        ),
        h('div', { className: 'dsub-tabs' },
          [
            ['overview', t('tabOverview')],
            ['accounts', t('tabAccounts')],
            ['dashboard', t('tabDashboard')],
            ['routing', t('tabRouting')],
            ['models', t('tabModels')],
            ['vault', t('tabVault')],
            ['notifications', t('tabNotifications')],
            ['advanced', t('tabAdvanced')],
          ].map(([id, label]) => h('button', {
            key: id,
            type: 'button',
            className: 'dsub-tab' + (tab === id ? ' dsub-tabActive' : ''),
            'aria-pressed': tab === id,
            onClick: () => setTab(id),
          }, label)),
        ),
        h('input', {
          type: 'search',
          className: 'dsub-search',
          placeholder: t('settingsSearch'),
          'aria-label': t('settingsSearch'),
          value: settingsQuery,
          onChange: (e) => setSettingsQuery(e.target.value),
          onKeyDown: (e) => { if (e.key === 'Escape') setSettingsQuery('') },
        }),
        connectedCount === 0 ? h('div', { className: 'dsub-group', 'data-pane': 'accounts', style: { marginBottom: '14px' } },
          h('div', { className: 'dsub-groupHead' }, '🚀 ' + t('onboardingTitle')),
          h('ol', { className: 'dsub-onboard' },
            h('li', null, t('onboardingStep1') + ' ',
              h('button', { type: 'button', className: 'dsub-mini', onClick: () => setPickerOpen(true) }, t('onboardingChooseProvider'))),
            h('li', null, t('onboardingStep2') + ' ',
              h('button', { type: 'button', className: 'dsub-mini', disabled: onboardingBusy, onClick: runDiscovery },
                onboardingBusy ? t('onboardingSearching') : t('onboardingFindLocal'))),
            h('li', null, t('onboardingStep3') + ' ',
              h('button', { type: 'button', className: 'dsub-mini', onClick: () => runSmokeTest() }, t('runSmoke'))),
          ),
          discovered.length ? h('div', { className: 'dsub-sub', style: { marginTop: 8 } },
            t('onboardingFound') + ': ',
            discovered.slice(0, 8).map((row, idx) => h('button', {
              key: 'disc-' + idx,
              type: 'button',
              className: 'dsub-mini',
              style: { marginRight: 6, marginTop: 4 },
              onClick: () => importLocalCli(row.provider, Number(row.index) || 1).catch((e) => setErr(cleanErrorMessage(e.message || e))),
            }, String(row.provider || 'cli') + (row.email ? ' · ' + row.email : '')))
          ) : null,
        ) : null,
        updater.message ? h('div', {
          'data-pane': 'overview',
          className: updater.message.includes(t('updateSuccessRestart')) ? 'dsub-alert-ok' : 'dsub-alert-bad',
          style: { marginBottom: '12px' }
        }, updater.message) : null,
        clientVersions ? h('div', {
          'data-pane': 'overview',
          className: 'dsub-sub',
          style: { marginBottom: '10px' },
        }, t('clientVersions') + ': ' + ['codex', 'claude'].map((provider) => {
          const row = clientVersions[provider]
          return provider + ' ' + (row && row.version ? row.version : '?') + ' (' + (row && row.source || 'none') + ')'
        }).join(' · ')) : null,
        smoke.result ? h('div', {
          'data-pane': 'overview',
          className: smoke.result.ok ? 'dsub-alert-ok' : 'dsub-alert-bad',
          style: { marginBottom: '12px' }
        }, smoke.result.ok
          ? ('🟢 ' + t('smokeOk') + ': ' + (smoke.result.provider || 'Provider').toUpperCase() + ' · ' + (smoke.result.latencyMs != null ? smoke.result.latencyMs + ' ms' : 'OK') + (smoke.result.label ? ' (' + smoke.result.label + ')' : ''))
          : ('❌ ' + t('smokeFail') + ': ' + (smoke.result.error && (smoke.result.error.message || smoke.result.error.code) || 'Unknown error'))
        ) : null,
        telemetry && telemetry.totalRequests > 0 ? h('div', { className: 'dsub-grid-2', 'data-pane': 'overview', style: { marginBottom: '14px' } },
          h('div', { className: 'dsub-stat-box' },
            h('div', { className: 'dsub-stat-val' }, telemetry.successRequests + ' / ' + telemetry.totalRequests),
            h('div', { className: 'dsub-stat-lbl' }, t('statsRequests')),
          ),
          h('div', { className: 'dsub-stat-box' },
            h('div', { className: 'dsub-stat-val' }, (telemetry.avgLatencyMs || 0) + ' ms'),
            h('div', { className: 'dsub-stat-lbl' }, t('statsLatency')),
          ),
          h('div', { className: 'dsub-stat-box' },
            h('div', { className: 'dsub-stat-val' }, (telemetry.successRate || 100) + '%'),
            h('div', { className: 'dsub-stat-lbl' }, t('statsSuccessRate')),
          ),
          h('div', { className: 'dsub-stat-box' },
            h('div', { className: 'dsub-stat-val' }, (telemetry.cacheHitPercent || 0) + '%'),
            h('div', { className: 'dsub-stat-lbl' }, t('cacheHitRate')),
          ),
          h('div', { className: 'dsub-stat-box' },
            h('div', { className: 'dsub-stat-val' }, telemetry.lastRequestAt ? Math.round((Date.now() - telemetry.lastRequestAt) / 60000) + t('minuteAgoSuffix') : '—'),
            h('div', { className: 'dsub-stat-lbl' }, t('statsLastActivity')),
          ),
        ) : null,
        (analytics && (analytics.totalRequests > 0 || (analytics.hourly && analytics.hourly.some(function(b) { return b.requests > 0 })))) || (queueStats && (queueStats.totalActive > 0 || queueStats.totalQueued > 0)) ? h('details', { className: 'dsub-group', 'data-pane': 'overview', style: { marginBottom: '14px' } },
          h('summary', { className: 'dsub-groupHead' }, '📊 ' + t('analyticsTitle')),
          h('div', { className: 'dsub-sub', style: { marginTop: '4px' } }, t('analyticsDesc')),
          h('div', { className: 'dsub-grid-2', style: { marginTop: '10px' } },
            h('div', { className: 'dsub-stat-box' },
              h('div', { className: 'dsub-stat-val' }, ((analytics && analytics.cache && analytics.cache.cacheHitRate) || 0) + '%'),
              h('div', { className: 'dsub-stat-lbl' }, t('cacheHitRate') + (analytics && analytics.cache ? ' (' + (analytics.cache.cacheReadTokens || 0).toLocaleString() + ' tok)' : '')),
            ),
            h('div', { className: 'dsub-stat-box' },
              h('div', { className: 'dsub-stat-val' }, (analytics && analytics.performance && analytics.performance.ttft && analytics.performance.ttft.avgMs != null ? analytics.performance.ttft.avgMs + ' ms' : '—')),
              h('div', { className: 'dsub-stat-lbl' }, t('ttftMetric') + (analytics && analytics.performance && analytics.performance.ttft && analytics.performance.ttft.p95Ms != null ? ' · p95 ' + analytics.performance.ttft.p95Ms + ' ms' : '')),
            ),
            h('div', { className: 'dsub-stat-box' },
              h('div', { className: 'dsub-stat-val' }, (analytics && analytics.performance && analytics.performance.tps && analytics.performance.tps.avg != null ? analytics.performance.tps.avg + ' tok/s' : '—')),
              h('div', { className: 'dsub-stat-lbl' }, t('speedMetric') + (analytics && analytics.performance && analytics.performance.tps && analytics.performance.tps.p95 != null ? ' · p95 ' + analytics.performance.tps.p95 : '')),
            ),
            h('div', { className: 'dsub-stat-box' },
              h('div', { className: 'dsub-stat-val' }, (queueStats ? queueStats.totalActive : 0) + ' / ' + (queueStats ? queueStats.totalQueued : 0)),
              h('div', { className: 'dsub-stat-lbl' }, t('queueActive') + ' / ' + t('queueWaiting') + (queueStats && queueStats.metrics && queueStats.metrics.totalOverflowed ? ' · ' + queueStats.metrics.totalOverflowed + ' ' + t('queueRejected') : '')),
            ),
          ),
          analytics && Array.isArray(analytics.hourly) && analytics.hourly.length ? (function() {
            var maxReq = Math.max.apply(Math, [1].concat(analytics.hourly.map(function(b) { return b.requests || 0 })))
            return h('div', { style: { marginTop: '12px' } },
              h('div', { style: { fontSize: '11.5px', fontWeight: 600, color: 'var(--dsw-alias-label-secondary)' } }, t('activity24h')),
              h('div', { className: 'dsub-chart-wrap' },
                analytics.hourly.map(function(b, idx) {
                  var pct = Math.max(4, Math.round(((b.requests || 0) / maxReq) * 100))
                  var title = b.label + ': ' + b.requests + ' req (' + b.cacheReadTokens + ' cached tok, ' + b.errorCount + ' err)'
                  return h('div', {
                    key: idx,
                    className: 'dsub-chart-bar',
                    style: {
                      height: pct + '%',
                      backgroundColor: b.errorCount > 0 && b.requests === b.errorCount
                        ? 'var(--dsw-alias-state-error-primary)'
                        : (b.cacheReadTokens > 0 ? 'var(--dsw-alias-brand-primary)' : 'var(--dsw-alias-state-success-primary)'),
                    },
                    title: title,
                  })
                })
              ),
              h('div', { className: 'dsub-chart-labels' },
                h('span', null, '-24h'),
                h('span', null, '-18h'),
                h('span', null, '-12h'),
                h('span', null, '-6h'),
                h('span', null, 'Now'),
              ),
            )
          })() : null,
          analytics && Array.isArray(analytics.forecast) && analytics.forecast.some(function(f) { return f.willExhaustBeforeReset || (f.burnRateTokensPerHour > 0 && f.hoursToExhaustion != null && f.hoursToExhaustion < 72) }) ? h('div', { style: { marginTop: '12px' } },
            h('div', { style: { fontSize: '11.5px', fontWeight: 600, color: 'var(--dsw-alias-state-warn-primary)', marginBottom: '6px' } }, '⚠️ ' + t('forecastTitle')),
            analytics.forecast.filter(function(f) { return f.willExhaustBeforeReset || (f.burnRateTokensPerHour > 0 && f.hoursToExhaustion != null && f.hoursToExhaustion < 72) }).map(function(f, idx) {
              return h('div', { key: idx, className: 'dsub-alert-bad', style: { marginBottom: '6px' } },
                (f.provider ? f.provider.toUpperCase() : 'LLM') + ' (' + (f.label || f.ref) + '): ' +
                (f.willExhaustBeforeReset ? t('forecastExhaustWarning') : (t('forecastRunway') + ': ~' + f.hoursToExhaustion + 'h')) +
                ' · ' + t('forecastBurnRate') + ': ' + Number(f.burnRateTokensPerHour || 0).toLocaleString() + ' tok/h'
              )
            })
          ) : null,
        ) : null,
        telemetry && Array.isArray(telemetry.recentDecisions) && telemetry.recentDecisions.length ? h('details', { className: 'dsub-group', 'data-pane': 'overview', style: { marginBottom: '14px' } },
          h('summary', { className: 'dsub-groupHead' }, '🧭 ' + t('rotationDecisionsTitle')),
          h('div', { className: 'dsub-sub', style: { marginTop: '4px' } }, t('rotationDecisionsDesc')),
          h('div', { className: 'dsub-trace-box' },
            telemetry.recentDecisions.map((dec, idx) => {
              const reasonBadge = dec.cascaded ? ('🔀 ' + t('rotationCascaded')) : (dec.decisionReason === 'cache_pinned' ? ('📌 ' + t('cachePinnedBadge')) : (dec.decisionReason === 'session_pinned' ? '📌 Pinned' : ('⚡ ' + dec.decisionReason)))
              return h('div', { key: idx, className: 'dsub-trace-row' },
                h('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
                  dec.provider ? h('span', { className: 'dsub-brand dsub-brand-' + dec.provider, style: { fontSize: '9px', padding: '1px 4px' } }, dec.provider.toUpperCase()) : null,
                  h('span', { style: { fontWeight: 600 } }, dec.ref || '—'),
                  dec.model ? h('code', { style: { fontSize: '11px', opacity: 0.8 } }, dec.model) : null,
                ),
                h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                  h('span', { className: 'dsub-model-tag' }, reasonBadge),
                  h('span', { style: { fontSize: '10.5px', opacity: 0.6 } }, dec.attemptsCount > 1 ? (dec.attemptsCount + ' ' + t('rotationAttempts')) : ('1 ' + t('rotationAttempt'))),
                ),
              )
            })
          ),
        ) : null,
        accounts && accounts.length ? h('details', { className: 'dsub-group', 'data-pane': 'overview', style: { marginBottom: '14px' } },
          h('summary', { className: 'dsub-groupHead' }, '📊 ' + (t('healthMatrix') || 'Health Matrix & Quota Runway')),
          h('div', { style: { padding: '8px 0', overflowX: 'auto' } },
            h('table', { style: { width: '100%', fontSize: '12px', borderCollapse: 'collapse' } },
              h('thead', null,
                h('tr', { style: { borderBottom: '1px solid var(--dsw-alias-border-l2)', textAlign: 'left', opacity: 0.7 } },
                  h('th', { style: { padding: '6px' } }, t('healthAccount')),
                  h('th', { style: { padding: '6px' } }, t('healthScore')),
                  h('th', { style: { padding: '6px' } }, t('healthLatency')),
                  h('th', { style: { padding: '6px' } }, t('healthStatus')),
                  h('th', { style: { padding: '6px' } }, t('healthQuota')),
                ),
              ),
              h('tbody', null,
                accounts.map((acc, idx) => {
                  // #1098: a null score means the account has never been measured.
                  // Rendering 100 here (the old behaviour) claimed health nobody
                  // observed; show the state instead and keep the number honest.
                  const measured = acc.healthScore != null
                  const sc = measured ? acc.healthScore : null
                  const healthColor = !measured
                    ? 'var(--dsw-alias-label-tertiary)'
                    : (sc >= 80 ? 'var(--dsw-alias-state-success-primary)' : (sc >= 50 ? 'var(--dsw-alias-state-warn-primary)' : 'var(--dsw-alias-state-error-primary)'))
                  const isQ = acc.status === 'quarantine' || (acc.quarantineUntil && Number(acc.quarantineUntil) > Date.now())
                  const statusLabel = isQ ? ('⛔ ' + t('healthQuarantine')) : (acc.status === 'probing' ? ('🟡 ' + t('healthWarmup')) : (acc.configured ? ('🟢 ' + t('healthActive')) : ('⚪ ' + t('healthIdle'))))
                  const pct = acc.usagePercent != null ? Math.round(acc.usagePercent) : null
                  return h('tr', { key: (acc.ref || acc.provider + acc.index || idx), style: { borderBottom: '1px solid var(--dsw-alias-border-l3)' } },
                    h('td', { style: { padding: '6px', fontWeight: 600 } }, (acc.provider ? acc.provider.toUpperCase() : 'LLM') + ' #' + (acc.index || 1) + (acc.label ? ' (' + acc.label + ')' : '')),
                    h('td', { style: { padding: '6px', color: healthColor } }, measured ? sc + '%' : t('healthUnprobed')),
                    h('td', { style: { padding: '6px' } }, acc.latencyMs ? acc.latencyMs + ' ms' : '—'),
                    h('td', { style: { padding: '6px' } }, statusLabel),
                    h('td', { style: { padding: '6px' } }, pct != null ? (pct + '% used') : '—'),
                  )
                }),
              ),
            ),
          ),
        ) : null,
        h('div', { className: 'dsub-block' },
          h('div', { className: 'dsub-h' }, t('title')),
          h('div', { className: 'dsub-sub' },
            t('intro')),
          h('details', { className: 'dsub-group', 'data-pane': 'routing' },
            h('summary', { className: 'dsub-groupHead' }, t('groupAuth')),
          h('label', { className: 'dsub-row' },
            h('input', {
              type: 'checkbox',
              checked: !!draft.useWebCallback,
              onChange: (e) => setDraft((d) => Object.assign({}, d, { useWebCallback: e.target.checked })),
            }),
            h('span', null, t('useOrigin')),
          ),
          h('div', { className: 'dsub-sub' },
            t('useOriginHint')),
          h('div', { className: 'dsub-row' },
            h('span', { className: 'dsub-h' }, t('sidebarQuotaDisplay')),
            h('select', {
              className: 'dsub-select',
              value: draft.sidebarQuotaDisplay || 'off',
              onChange: (e) => setDraft((d) => Object.assign({}, d, { sidebarQuotaDisplay: e.target.value })),
            },
              h('option', { value: 'off' }, t('sidebarQuotaOff')),
              h('option', { value: 'auto' }, t('sidebarQuotaAuto')),
              h('option', { value: 'always' }, t('sidebarQuotaAlways')),
            ),
          ),
          h('div', { className: 'dsub-sub', style: { marginBottom: 8 } }, t('sidebarQuotaDisplayHint')),
          h('label', { className: 'dsub-row' },
            h('input', {
              type: 'checkbox',
              checked: !!draft.autoLoopback,
              onChange: (e) => setDraft((d) => Object.assign({}, d, { autoLoopback: e.target.checked })),
            }),
            h('span', null, t('autoLoopback')),
          ),
          h('div', { className: 'dsub-sub' },
            t('autoLoopbackHint')),
          ),
          h('details', { className: 'dsub-group', 'data-pane': 'advanced' },
            h('summary', { className: 'dsub-groupHead' }, t('groupPrivacy')),
          h('label', { className: 'dsub-row' },
            h('input', {
              type: 'checkbox',
              checked: !!draft.privacyMask,
              onChange: (e) => setDraft((d) => Object.assign({}, d, { privacyMask: e.target.checked })),
            }),
            h('span', null, t('privacyMask')),
          ),
          h('div', { className: 'dsub-sub' },
            t('privacyMaskHint')),
          h('label', { className: 'dsub-row' },
            h('input', {
              type: 'checkbox',
              checked: !!draft.hideDeprecatedModels,
              onChange: (e) => setDraft((d) => Object.assign({}, d, { hideDeprecatedModels: e.target.checked })),
            }),
            h('span', null, t('hideDeprecated')),
          ),
          h('div', { className: 'dsub-sub' },
            t('hideDeprecatedHint')),
          ),
          h('details', { className: 'dsub-group', 'data-pane': 'routing' },
            h('summary', { className: 'dsub-groupHead' }, t('groupDisplay')),
h('div', { className: 'dsub-row' },
            h('span', { className: 'dsub-h' }, t('composerQuotaDisplay')),
            h('select', {
              className: 'dsub-select',
              value: draft.composerQuotaDisplay || 'hidden',
              onChange: (e) => setDraft((d) => Object.assign({}, d, { composerQuotaDisplay: e.target.value })),
            },
              h('option', { value: 'current' }, t('composerQuotaDisplayCurrent')),
              h('option', { value: 'hidden' }, t('composerQuotaDisplayHidden')),
            ),
          ),
          h('div', { className: 'dsub-sub' }, t('composerQuotaDisplayHint')),          h('div', { className: 'dsub-row' },
            h('span', { className: 'dsub-h' }, t('quotaWidget')),
            h('select', {
              className: 'dsub-select',
              value: draft.quotaWidget || 'off',
              onChange: (e) => setDraft((d) => Object.assign({}, d, { quotaWidget: e.target.value })),
            },
              h('option', { value: 'off' }, t('quotaWidgetOff')),
              h('option', { value: 'docked' }, t('quotaWidgetDocked')),
              h('option', { value: 'floating' }, t('quotaWidgetFloating')),
            ),
          ),
          h('div', { className: 'dsub-sub' }, t('quotaWidgetHint')),
h('div', { className: 'dsub-row' },
            h('span', { className: 'dsub-h' }, t('composerQuota')),
            h('select', {
              className: 'dsub-select',
              value: draft.composerQuota || 'percent',
              onChange: (e) => setDraft((d) => Object.assign({}, d, { composerQuota: e.target.value })),
            },
              h('option', { value: 'off' }, t('composerQuotaOff')),
              h('option', { value: 'percent' }, t('composerQuotaPercent')),
              h('option', { value: 'bar' }, t('composerQuotaBar')),
              h('option', { value: 'forecast' }, t('composerQuotaForecast')),
            ),
          ),
          h('div', { className: 'dsub-sub' },
            t('composerQuotaHint')),
          h('label', { className: 'dsub-row' },
            h('input', {
              type: 'checkbox',
              checked: Boolean(draft.showSpeedToggle),
              onChange: (e) => setDraft((d) => Object.assign({}, d, { showSpeedToggle: e.target.checked })),
            }),
            h('span', null, t('showSpeedToggle')),
          ),
          h('div', { className: 'dsub-sub' }, t('showSpeedToggleHint')),
          h('label', { className: 'dsub-row' },
            h('input', {
              type: 'checkbox',
              checked: Boolean(draft.showSubsPill),
              onChange: (e) => setDraft((d) => Object.assign({}, d, { showSubsPill: e.target.checked })),
            }),
            h('span', null, t('showSubsPill')),
          ),
          h('div', { className: 'dsub-sub' }, t('showSubsPillHint')),
          ),
          h('details', { className: 'dsub-group', 'data-pane': 'routing' },
            h('summary', { className: 'dsub-groupHead' }, t('sources')),
            paneMounted('routing') ? h(SourcesPanel, { t, active: tab === 'routing' }) : null,
          ),
          h('div', { className: 'dsub-group', 'data-pane': 'dashboard' },
            paneMounted('dashboard') ? h(AccountsDashboardPanel, {
              t,
              labels: {
                accountsDashboard: t('accountsDashboard'),
                sortRisk: t('sortRisk'), sortQuota: t('sortQuota'), sortName: t('sortName'),
                speedSubagent: t('speedSubagent'),
                statusHealthy: t('statusHealthy'), statusCooling: t('statusCooling'), statusQuarantined: t('statusQuarantined'),
                quotaUsed: t('quotaUsed'), requests: t('requests'), errors: t('errors'), loadUsage: t('loadUsage'),
                modelEditor: t('modelEditor'), discovered: t('discovered'), shown: t('shown'), searchModels: t('searchModels'),
              },
            }) : null,
          ),
          h('details', { className: 'dsub-group', 'data-pane': 'models' },
            h('summary', { className: 'dsub-groupHead' }, t('providerPacks')),
            paneMounted('models') ? h(ProviderPacksPanel, { t }) : null,
          ),
          paneMounted('models') ? h(policyPanel, { t, draft, setDraft, section: 'tools', mode: draft.experienceMode }) : null,
          h('details', { className: 'dsub-group', 'data-pane': 'vault' },
            h('summary', { className: 'dsub-groupHead' }, t('vaultSnapshots')),
            paneMounted('vault') ? h(VaultSnapshotsPanel, { t }) : null,
          ),
          paneMounted('vault') ? h(policyPanel, { t, draft, setDraft, section: 'vault', mode: draft.experienceMode }) : null,
          h('details', { className: 'dsub-group', 'data-pane': 'notifications' },
            h('summary', { className: 'dsub-groupHead' }, t('notifications')),
h('div', { className: 'dsub-row' },
            h('span', { className: 'dsub-h' }, t('expiryNotifyDays')),
            h('input', {
              type: 'number',
              className: 'dsub-inp',
              style: { width: '80px', minWidth: '80px' },
              min: 0,
              max: 90,
              value: draft.expiryNotifyDays != null ? draft.expiryNotifyDays : 7,
              onChange: (e) => setDraft((d) => Object.assign({}, d, { expiryNotifyDays: Number(e.target.value) || 0 })),
            }),
          ),
          h('div', { className: 'dsub-sub' },
            t('expiryNotifyDaysHint')),
          h('div', { className: 'dsub-row' },
            h('span', { className: 'dsub-h' }, t('webhookUrl')),
            h('input', {
              type: 'url',
              className: 'dsub-inp',
              placeholder: 'https://hooks.example/…',
              value: draft.webhookUrl || '',
              onChange: (e) => setDraft((d) => Object.assign({}, d, { webhookUrl: e.target.value })),
            }),
          ),
          h('div', { className: 'dsub-sub' }, t('webhookUrlHint')),
          h('div', { className: 'dsub-row' },
            h('span', { className: 'dsub-h' }, t('webhookFormat')),
            h('select', {
              className: 'dsub-select',
              value: draft.webhookFormat || 'native',
              onChange: (e) => setDraft((d) => Object.assign({}, d, { webhookFormat: e.target.value })),
            },
              h('option', { value: 'native' }, t('webhookFormatNative')),
              h('option', { value: 'notify' }, t('webhookFormatNotify')),
            ),
          ),
          h('div', { className: 'dsub-row' },
            h('span', { className: 'dsub-h' }, t('webhookSecret')),
            h('input', {
              type: 'password',
              className: 'dsub-inp',
              autoComplete: 'new-password',
              value: draft.webhookSecret || '',
              onChange: (e) => setDraft((d) => Object.assign({}, d, { webhookSecret: e.target.value })),
            }),
          ),
          h('div', { className: 'dsub-row' },
            h('span', { className: 'dsub-h' }, t('digestIntervalHours')),
            h('input', {
              type: 'number',
              className: 'dsub-inp',
              style: { width: '80px', minWidth: '80px' },
              min: 0,
              max: 168,
              value: draft.digestIntervalHours != null ? draft.digestIntervalHours : 0,
              onChange: (e) => setDraft((d) => Object.assign({}, d, { digestIntervalHours: Number(e.target.value) || 0 })),
            }),
          ),
          h('div', { className: 'dsub-sub' }, t('digestHint')),
          h(WebhookTestButton, { t }),
          paneMounted('notifications') ? h(policyPanel, { t, draft, setDraft, section: 'alerts', mode: draft.experienceMode }) : null,
          ),
          h('details', { className: 'dsub-group', 'data-pane': 'routing' },
            h('summary', { className: 'dsub-groupHead' }, '🚦 ' + t('groupQueue')),
            h('label', { className: 'dsub-row' },
              h('input', {
                type: 'checkbox',
                checked: draft.enableQueue !== false,
                onChange: function(e) { setDraft(function(d) { return Object.assign({}, d, { enableQueue: e.target.checked }) }) },
              }),
              h('span', null, t('enableQueue')),
            ),
            h('div', { className: 'dsub-sub' }, t('enableQueueHint')),
            h('div', { className: 'dsub-row' },
              h('span', { className: 'dsub-h' }, t('accountMaxConcurrency')),
              h('input', {
                type: 'number',
                className: 'dsub-inp',
                style: { width: '80px', minWidth: '80px' },
                min: 1,
                max: 20,
                value: draft.accountMaxConcurrency != null ? draft.accountMaxConcurrency : 2,
                onChange: function(e) { setDraft(function(d) { return Object.assign({}, d, { accountMaxConcurrency: Math.max(1, Number(e.target.value) || 2) }) }) },
              }),
            ),
            h('div', { className: 'dsub-sub' }, t('accountMaxConcurrencyHint')),
            h('div', { className: 'dsub-row' },
              h('span', { className: 'dsub-h' }, t('maxQueueSize')),
              h('input', {
                type: 'number',
                className: 'dsub-inp',
                style: { width: '80px', minWidth: '80px' },
                min: 1,
                max: 100,
                value: draft.maxQueueSize != null ? draft.maxQueueSize : 20,
                onChange: function(e) { setDraft(function(d) { return Object.assign({}, d, { maxQueueSize: Math.max(1, Number(e.target.value) || 20) }) }) },
              }),
            ),
            h('div', { className: 'dsub-sub' }, t('maxQueueSizeHint')),
            h('div', { className: 'dsub-row' },
              h('span', { className: 'dsub-h' }, t('queueTimeoutSec')),
              h('input', {
                type: 'number',
                className: 'dsub-inp',
                style: { width: '80px', minWidth: '80px' },
                min: 1,
                max: 120,
                value: Math.round((draft.queueTimeoutMs != null ? draft.queueTimeoutMs : 30000) / 1000),
                onChange: function(e) { setDraft(function(d) { return Object.assign({}, d, { queueTimeoutMs: Math.max(1, Number(e.target.value) || 30) * 1000 }) }) },
              }),
            ),
            h('div', { className: 'dsub-sub' }, t('queueTimeoutSecHint')),
          ),
          h('details', { className: 'dsub-group', 'data-pane': 'routing' },
            h('summary', { className: 'dsub-groupHead' }, t('groupProvider')),
          h('label', { className: 'dsub-row' },
            h('input', {
              type: 'checkbox',
              checked: !!draft.codexFastMode,
              onChange: (e) => setDraft((d) => Object.assign({}, d, { codexFastMode: e.target.checked })),
            }),
            h('span', null, t('codexFastMode')),
          ),
          h('div', { className: 'dsub-sub' },
            t('codexFastModeHint')),
          h('div', { className: 'dsub-row' },
            h('span', { className: 'dsub-h' }, t('codexVerbosity')),
            h('select', {
              className: 'dsub-select',
              value: draft.codexVerbosity || 'default',
              onChange: (e) => setDraft((d) => Object.assign({}, d, { codexVerbosity: e.target.value })),
            },
              h('option', { value: 'default' }, t('codexVerbosityDefault')),
              h('option', { value: 'low' }, t('codexVerbosityLow')),
              h('option', { value: 'medium' }, t('codexVerbosityMedium')),
              h('option', { value: 'high' }, t('codexVerbosityHigh')),
            ),
          ),
          h('div', { className: 'dsub-sub' },
            t('codexVerbosityHint')),
          h('div', { className: 'dsub-row' },
            h('span', { className: 'dsub-h' }, t('copilotMode')),
            h('select', {
              className: 'dsub-select',
              value: draft.copilotMode || 'auto',
              onChange: (e) => setDraft((d) => Object.assign({}, d, { copilotMode: e.target.value })),
            },
              h('option', { value: 'auto' }, t('copilotModeAuto')),
              h('option', { value: 'cli' }, t('copilotModeCli')),
              h('option', { value: 'web' }, t('copilotModeWeb')),
            ),
          ),
          h('div', { className: 'dsub-sub' },
            t('copilotModeHint')),
          h('div', { className: 'dsub-row' },
            h('span', { className: 'dsub-h' }, t('copilotCliPath')),
            h('input', {
              className: 'dsub-input',
              type: 'text',
              value: draft.copilotCliPath || '',
              placeholder: 'copilot',
              onChange: (e) => setDraft((d) => Object.assign({}, d, { copilotCliPath: e.target.value })),
            }),
          ),
          h('div', { className: 'dsub-sub' },
            t('copilotCliPathHint')),
          ),
          h('details', { className: 'dsub-group', 'data-pane': 'routing' },
            h('summary', { className: 'dsub-groupHead' }, t('groupFallback')),
          h('label', { className: 'dsub-row' },
            h('input', {
              type: 'checkbox',
              checked: !!draft.ollamaFallback,
              onChange: (e) => setDraft((d) => Object.assign({}, d, { ollamaFallback: e.target.checked })),
            }),
            h('span', null, t('ollamaFallback')),
          ),
          h('div', { className: 'dsub-sub' },
            t('ollamaFallbackHint')),
          draft.ollamaFallback ? h('div', { className: 'dsub-row' },
            h('input', {
              type: 'text',
              className: 'dsub-inp dsub-grow',
              placeholder: 'http://localhost:11434',
              value: draft.ollamaBaseUrl || '',
              onChange: (e) => setDraft((d) => Object.assign({}, d, { ollamaBaseUrl: e.target.value })),
            }),
            h('input', {
              type: 'text',
              className: 'dsub-inp dsub-grow',
              placeholder: 'llama3:latest',
              value: draft.ollamaFallbackModel || '',
              onChange: (e) => setDraft((d) => Object.assign({}, d, { ollamaFallbackModel: e.target.value })),
            }),
          ) : null,
          ),
          h('details', { className: 'dsub-group', 'data-pane': 'models' },
            h('summary', { className: 'dsub-groupHead' }, '🎯 ' + t('modelsCatalogTitle')),
            h('div', { className: 'dsub-sub', style: { marginTop: '4px' } }, t('modelsCatalogDesc')),
            h('div', { className: 'dsub-row', style: { marginTop: 8, gap: 6, alignItems: 'center' } },
              h('input', {
                className: 'dsub-inp dsub-grow',
                value: modelQuery,
                placeholder: t('modelSearchPlaceholder'),
                'aria-label': t('modelSearchPlaceholder'),
                onChange: (e) => { setModelQuery(e.target.value); setModelLimit(40) },
              }),
              h('select', {
                className: 'dsub-select',
                value: modelSort,
                title: t('modelSortLabel'),
                'aria-label': t('modelSortLabel'),
                onChange: (e) => { setModelSort(e.target.value); setModelLimit(40) },
              },
                h('option', { value: 'name' }, t('modelSortName')),
                h('option', { value: 'provider' }, t('modelSortProvider')),
                h('option', { value: 'context' }, t('modelSortContext')),
                h('option', { value: 'availability' }, t('modelSortAvailability')),
              ),
            ),
            h('div', { className: 'dsub-sub', style: { marginTop: 4 } },
              t('modelListCounts')
                .replace('{shown}', String(catalogCounts.shown))
                .replace('{matched}', String(catalogSorted.length))
                .replace('{hidden}', String(catalogCounts.hidden))
                .replace('{total}', String(catalogCounts.total))
            ),
            h('div', { className: 'dsub-model-grid' },
              catalogShown.map((m, idx) => {
                const poolStatus = m.pool ? m.pool.status : 'unconfigured'
                const statusClass = 'dsub-model-status-' + poolStatus
                let poolLabel = ''
                if (poolStatus === t('sourceAvailable')) {
                  poolLabel = '🟢 ' + (m.pool && m.pool.remainingPercent != null ? (m.pool.remainingPercent + '%') : t('modelPoolAvailable'))
                } else if (poolStatus === 'degraded') {
                  poolLabel = '🟡 ' + t('modelPoolDegraded') + (m.pool ? ' (' + m.pool.healthyAccounts + '/' + m.pool.totalAccounts + ')' : '')
                } else if (poolStatus === 'quarantined') {
                  poolLabel = '⛔ ' + t('modelPoolQuarantined')
                } else if (poolStatus === 'cooldown') {
                  poolLabel = '❄️ ' + t('modelPoolCooldown')
                } else if (poolStatus === 'exhausted') {
                  poolLabel = '⚠️ ' + t('modelPoolExhausted')
                } else {
                  poolLabel = '⚪ ' + t('modelPoolUnconfigured')
                }
                const tags = []
                if (m.contextLabel) tags.push(m.contextLabel)
                if (Array.isArray(m.capabilities)) {
                  for (const c of m.capabilities) {
                    if (c === 'vision') tags.push('Vision')
                    else if (c === 'reasoning') tags.push('Reasoning')
                    else if (c === 'coding') tags.push('Coding')
                    else if (c === 'fast') tags.push('Fast')
                  }
                }
                return h('div', { key: (m.id || idx) + '_' + idx, className: 'dsub-model-chip' },
                  m.provider ? h('span', { className: 'dsub-brand dsub-brand-' + m.provider, style: { fontSize: '9px', padding: '1px 4px' } }, m.provider.toUpperCase()) : null,
                  h('code', null, m.name || m.id),
                  tags.length ? h('span', { className: 'dsub-model-tag' }, tags.join(' · ')) : null,
                  Array.isArray(m.catalogSources) && m.catalogSources.length ? h('span', { className: 'dsub-model-tag', title: t('modelCatalogSourceHint') }, '📚 ' + m.catalogSources.join('/')) : null,
                  h('span', { className: 'dsub-model-tag ' + statusClass }, poolLabel),
                )
              })
            ),
            catalogSorted.length === 0 ? h('div', { className: 'dsub-sub', style: { marginTop: 6 } }, t('modelNoMatches')) : null,
            catalogCounts.shown < catalogSorted.length ? h('div', { className: 'dsub-row', style: { marginTop: 6, gap: 6 } },
              h('button', {
                type: 'button', className: 'dsub-mini',
                onClick: () => setModelLimit((n) => n + 40),
              }, t('modelShowMore')),
              h('button', {
                type: 'button', className: 'dsub-mini',
                onClick: () => setModelLimit(catalogSorted.length),
              }, t('modelShowAll')),
            ) : null,
          ),
          h('details', { className: 'dsub-group', 'data-pane': 'models' },
            h('summary', { className: 'dsub-groupHead' }, '🏷 ' + t('modelNamesTitle')),
            h('div', { className: 'dsub-sub', style: { marginTop: 4 } }, t('modelNamesHint')),
            h('div', { style: { maxHeight: 260, overflow: 'auto', marginTop: 6 } },
              catalogShown.slice(0, 50).map((model) => {
                const current = (Array.isArray(draft.modelDisplayNames) ? draft.modelDisplayNames : [])
                  .find((row) => row && row.provider === model.provider && String(row.id) === String(model.id))
                return h('div', { key: 'name:' + model.provider + ':' + model.id, className: 'dsub-row', style: { gap: 6 } },
                  h('code', { style: { minWidth: 120, fontSize: 11 } }, model.id),
                  h('input', {
                    className: 'dsub-inp dsub-grow',
                    value: current ? current.name : '',
                    placeholder: model.name || model.id,
                    onChange: (e) => {
                      const value = e.target.value
                      setDraft((d) => {
                        const list = Array.isArray(d.modelDisplayNames) ? d.modelDisplayNames.slice() : []
                        const idx = list.findIndex((row) => row && row.provider === model.provider && String(row.id) === String(model.id))
                        if (value.trim()) {
                          const next = { provider: model.provider, id: String(model.id), name: value.slice(0, 80) }
                          if (idx >= 0) list[idx] = next
                          else list.push(next)
                        } else if (idx >= 0) {
                          list.splice(idx, 1)
                        }
                        return Object.assign({}, d, { modelDisplayNames: list })
                      })
                    },
                  }),
                  h('button', {
                    type: 'button', className: 'dsub-mini',
                    onClick: () => setDraft((d) => Object.assign({}, d, {
                      modelDisplayNames: (Array.isArray(d.modelDisplayNames) ? d.modelDisplayNames : [])
                        .filter((row) => !(row && row.provider === model.provider && String(row.id) === String(model.id))),
                    })),
                  }, t('modelNameReset')),
                )
              })
            ),
          ),
          h('details', { className: 'dsub-group', 'data-pane': 'models' },
            h('summary', { className: 'dsub-groupHead' }, '🧠 ' + t('reasoningEffortTitle')),
            h('div', { className: 'dsub-sub', style: { marginTop: '4px' } }, t('reasoningEffortDesc')),
            h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '10px' } },
              ['off', 'low', 'medium', 'high', 'max'].map((lvl) => {
                const label = lvl === 'off' ? t('reasoningLevelOff') : (lvl.charAt(0).toUpperCase() + lvl.slice(1))
                return h('span', {
                  key: lvl,
                  className: 'dsub-model-tag',
                  style: { padding: '4px 10px', fontSize: '12px', cursor: 'default' }
                }, '⚙️ ' + label)
              })
            )
          ),
          h('details', { className: 'dsub-details', 'data-pane': 'advanced' },
            h('summary', { className: 'dsub-summary' }, t('advancedSettings')),
            h('div', { className: 'dsub-block' },
              h('div', { className: 'dsub-row' },
                h('span', { className: 'dsub-h' }, t('cooldownMs')),
                h('input', {
                  type: 'number',
                  className: 'dsub-inp',
                  style: { width: '80px', minWidth: '80px' },
                  min: 1,
                  max: 120,
                  value: Math.round((draft.cooldownMs || 600000) / 60000),
                  onChange: (e) => setDraft((d) => Object.assign({}, d, { cooldownMs: (Number(e.target.value) || 10) * 60000 })),
                }),
              ),
              h('div', { className: 'dsub-sub' }, t('cooldownMsHint')),
              h('div', { className: 'dsub-row' },
                h('span', { className: 'dsub-h' }, t('probeIntervalMin')),
                h('input', {
                  type: 'number',
                  className: 'dsub-inp',
                  style: { width: '80px', minWidth: '80px' },
                  min: 1,
                  max: 1440,
                  value: draft.probeIntervalMin != null ? draft.probeIntervalMin : 15,
                  onChange: (e) => setDraft((d) => Object.assign({}, d, { probeIntervalMin: Number(e.target.value) || 15 })),
                }),
              ),
              h('div', { className: 'dsub-sub' }, t('probeIntervalMinHint')),
              h('label', { className: 'dsub-row' },
                h('input', {
                  type: 'checkbox',
                  checked: draft.notifyLimits !== false,
                  onChange: (e) => setDraft((d) => Object.assign({}, d, { notifyLimits: e.target.checked })),
                }),
                h('span', null, t('notifyLimits')),
              ),
              h('div', { className: 'dsub-sub' }, t('notifyLimitsHint')),
              h('label', { className: 'dsub-row', style: { marginTop: 10 } },
                h('input', {
                  type: 'checkbox',
                  checked: Boolean(draft.cascadingFallback),
                  onChange: (e) => setDraft((d) => Object.assign({}, d, { cascadingFallback: e.target.checked })),
                }),
                h('span', null, t('cascadingFallback')),
              ),
              h('div', { className: 'dsub-sub' }, t('cascadingFallbackHint')),
              Boolean(draft.cascadingFallback) ? h('div', { style: { marginTop: 8, padding: '8px 12px', background: 'var(--dsw-alias-bg-layer-2)', borderRadius: 8 } },
                h('div', { style: { fontSize: 12, fontWeight: 600, marginBottom: 4 } }, t('cascadingFallbackOrder')),
                h('div', { className: 'dsub-sub', style: { marginBottom: 8 } }, t('cascadingFallbackOrderHint')),
                h('div', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
                  (Array.isArray(draft.cascadingFallbackOrder) && draft.cascadingFallbackOrder.length ? draft.cascadingFallbackOrder : (providers.length ? providers : ['antigravity', 'claude', 'codex', 'grok', 'copilot', 'cursor'])).map((p, idx, arr) => {
                    return h('div', { key: p, style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px', background: 'var(--dsw-alias-bg-layer-1)', borderRadius: 6, fontSize: 12 } },
                      h('span', null, (idx + 1) + '. ' + p.toUpperCase()),
                      h('div', { style: { display: 'flex', gap: 4 } },
                        idx > 0 ? h('button', {
                          type: 'button', className: 'dsub-mini', style: { padding: '1px 6px', fontSize: 10 },
                          onClick: () => {
                            const next = arr.slice()
                            const tmp = next[idx - 1]
                            next[idx - 1] = next[idx]
                            next[idx] = tmp
                            setDraft((d) => Object.assign({}, d, { cascadingFallbackOrder: next }))
                          }
                        }, '▲') : null,
                        idx < arr.length - 1 ? h('button', {
                          type: 'button', className: 'dsub-mini', style: { padding: '1px 6px', fontSize: 10 },
                          onClick: () => {
                            const next = arr.slice()
                            const tmp = next[idx + 1]
                            next[idx + 1] = next[idx]
                            next[idx] = tmp
                            setDraft((d) => Object.assign({}, d, { cascadingFallbackOrder: next }))
                          }
                        }, '▼') : null,
                      )
                    )
                  })
                )
              ) : null,
            ),
            h('div', { className: 'dsub-row', style: { marginTop: 12 } },
              h('label', { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
                h('span', { style: { fontWeight: 600 } }, t('rotationStrategy')),
                h('span', { className: 'dsub-sub' }, t('rotationStrategyHint')),
                h('select', {
                  className: 'dsub-select',
                  value: draft.rotationStrategy || 'round-robin',
                  onChange: (e) => setDraft((d) => Object.assign({}, d, { rotationStrategy: e.target.value })),
                  style: { maxWidth: 320, marginTop: 4 }
                },
                  h('option', { value: 'round-robin' }, t('rotationRoundRobin')),
                  h('option', { value: 'least-loaded' }, t('rotationLeastLoaded')),
                  h('option', { value: 'quota-aware' }, t('rotationQuotaAware')),
                  h('option', { value: 'priority' }, t('rotationPriority')),
                  h('option', { value: 'lowest-latency' }, t('rotationLowestLatency')),
                ),
              ),
            ),
            h('div', { className: 'dsub-row', style: { marginTop: 12 } },
              h('label', { style: { display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' } },
                h('input', {
                  type: 'checkbox',
                  checked: draft.poolEnabled !== false,
                  onChange: (e) => setDraft((d) => Object.assign({}, d, { poolEnabled: e.target.checked })),
                }),
                h('span', null, t('poolEnabled')),
              ),
              h('div', { className: 'dsub-sub' }, t('poolEnabledHint')),
            ),
            h('div', { className: 'dsub-row', style: { marginTop: 8 } },
              h('label', { style: { display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' } },
                h('input', {
                  type: 'checkbox',
                  checked: draft.mediaPoolEnabled !== false,
                  onChange: (e) => setDraft((d) => Object.assign({}, d, { mediaPoolEnabled: e.target.checked })),
                }),
                h('span', null, t('mediaPoolEnabled')),
              ),
              h('div', { className: 'dsub-sub' }, t('mediaPoolEnabledHint')),
            ),
            h('div', { className: 'dsub-row', style: { marginTop: 12 } },
              h('label', { style: { display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' } },
                h('input', {
                  type: 'checkbox',
                  checked: draft.enableSoftFailureSentinel !== false,
                  onChange: (e) => setDraft((d) => Object.assign({}, d, { enableSoftFailureSentinel: e.target.checked })),
                }),
                h('span', null, t('softFailureSentinel')),
              ),
              h('div', { className: 'dsub-sub' }, t('softFailureSentinelHint')),
            ),
          ),
          // #1087: the managed policies that used to be YAML-only. Each topic is a
          // collapsible group so the pane does not become one wall of fields.
          // #1103: `mode` decides how much of that surface is presented first.
          paneMounted('routing') ? h(modePicker, { t, draft, setDraft }) : null,
          paneMounted('routing') ? h(policyPanel, { t, draft, setDraft, section: 'routing', mode: draft.experienceMode }) : null,
          paneMounted('routing') ? h(policyPanel, { t, draft, setDraft, section: 'health', mode: draft.experienceMode }) : null,
          paneMounted('routing') ? h(policyPanel, { t, draft, setDraft, section: 'network', mode: draft.experienceMode }) : null,
        ),
        h('div', { className: 'dsub-block', 'data-pane': 'advanced' },
          h('div', { className: 'dsub-row' },
            h('button', { type: 'button', className: 'dsub-mini', onClick: () => runWizard(null, null, null, false) }, '🩺 ' + t('wizardAll')),
            h('button', { type: 'button', className: 'dsub-mini', onClick: genDiag }, t('diagGenerate')),
            h('button', { type: 'button', className: 'dsub-mini', onClick: runAnalyzeSession }, analyzingCache ? '…' : t('cacheAnalyze')),
            h('button', { type: 'button', className: 'dsub-mini', onClick: () => { setBackupModal('export'); setBackupErr(''); setBackupInfo(''); loadVaultSyncStatus() } }, '🔒 ' + t('backupExport')),
            h('button', { type: 'button', className: 'dsub-mini', onClick: () => { setBackupModal('import'); setBackupErr(''); setBackupInfo(''); loadVaultSyncStatus() } }, '📥 ' + t('backupImport')),
            h('a', { href: 'https://github.com/GooDAnDReaDY/dsh-subscriptions/issues', target: '_blank', rel: 'noopener noreferrer', className: 'dsub-mini' }, t('diagIssues')),
          ),
          h('div', { className: 'dsub-sub' }, t('diagHint')),
          sessionAnalysis ? h('div', { className: 'dsub-sub', style: { marginTop: '6px', fontWeight: 500 } },
            t('cacheHitRate') + ': ' + sessionAnalysis.weightedCacheHitPercent + '% · ' +
            t('tokensSaved') + ': ' + sessionAnalysis.savedTokens + ' / ' + sessionAnalysis.totalTokens
          ) : null,
          diag ? h('div', { className: 'dsub-row' },
            h('button', {
              type: 'button', className: 'dsub-mini',
              onClick: () => { copyText(diag) },
            }, t('diagCopy')),
            h('pre', { className: 'dsub-diag' }, diag),
          ) : null,
          h('details', { className: 'dsub-details', style: { marginTop: 12 } },
            h('summary', { className: 'dsub-summary' }, '⚠️ ' + t('recentErrors')),
            h('div', { className: 'dsub-block' },
              h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 } },
                h('span', { className: 'dsub-sub' }, t('recentErrorsDesc')),
                h('button', {
                  type: 'button', className: 'dsub-mini',
                  onClick: async () => {
                    await fetch('/dsh-subscriptions/diagnostics/errors/clear', { method: 'POST' }).catch(ignoreClientError('client.js: clearErrors'))
                    genDiag()
                  }
                }, t('recentErrorsClear'))
              ),
              (diagReport && Array.isArray(diagReport.recentErrors) && diagReport.recentErrors.length ? diagReport.recentErrors : []).length === 0
                ? h('div', { className: 'dsub-dim', style: { padding: 8 } }, t('recentErrorsEmpty'))
                : h('div', { style: { display: 'flex', flexDirection: 'column', gap: 6 } },
                    (diagReport.recentErrors || []).map((err, i) => h('div', {
                      key: i,
                      style: { padding: '6px 10px', background: 'var(--dsw-alias-bg-layer-2)', borderRadius: 6, fontSize: 11.5, borderLeft: '3px solid var(--dsw-alias-state-error-primary)' }
                    },
                      h('div', { style: { display: 'flex', justifyContent: 'space-between', marginBottom: 2 } },
                        h('span', { style: { fontWeight: 600 } }, (err.provider || 'unknown').toUpperCase() + (err.model ? ' · ' + err.model : '')),
                        h('span', { className: 'dsub-dim' }, (err.ts || '').slice(11, 19))
                      ),
                      h('div', { style: { display: 'flex', gap: 6, alignItems: 'center' } },
                        err.code ? h('span', { className: 'dsub-pillTag', style: { background: 'color-mix(in srgb,var(--dsw-alias-state-error-primary) 15%,transparent)', color: 'var(--dsw-alias-state-error-primary)' } }, err.code) : null,
                        err.status ? h('span', { className: 'dsub-dim' }, 'HTTP ' + err.status) : null,
                        h('span', { style: { opacity: 0.9, wordBreak: 'break-word' } }, err.message)
                      )
                    ))
                  )
            )
          ),
        ),
        // #1094: both panels live in client.modals.js now.
        h(React.Suspense, { fallback: null },
          h(DiagnosticWizard, {
            t,
            state: {
              modal: wizardModal, setModal: setWizardModal, run: runWizard, copyText,
            },
          }),
        ),
        h(React.Suspense, { fallback: null },
          h(VaultBackupPanel, {
            t,
            state: {
              modal: backupModal, setModal: setBackupModal,
              pass: backupPass, setPass: setBackupPass,
              data: backupData, setData: setBackupData,
              error: backupErr, info: backupInfo, loading: backupLoading,
              setError: setBackupErr, setInfo: setBackupInfo,
              doExport: doExportBackup, doImport: doImportBackup,
              download: downloadBackupFile,
              copyText,
              syncLoading: vaultSyncLoading, syncInfo: vaultSyncInfo,
              doSyncPush: doVaultSyncPush, doSyncPull: doVaultSyncPull,
            },
          }),
        ),
        paneMounted('accounts') ? h(React.Suspense, { fallback: null }, h(AccountsPane, {
          t,
          scope: {
            accountOf, addSlot, batch, cancelBatch, checkRes, checking,
            complete, connect, copiedSsh, device, deviceStartLogin, doCheck,
            doParkQuarantine, doPing, doProbeQuarantine, doProxyCheck, doSyncModels,
            headlessInfo, importLocalCli, importToken, later, loginLinks, logout,
            modelsCatalog, moveSlot, names, newProviders, openHelp, paste,
            poolModelQuery, proxyRes, reload, reset, resetConsume, resetPrepare,
            runBatch, runWizard, savingsReport, setCopiedSsh, setErr, setOpenHelp,
            setPaste, setPoolModelQuery, setReset, setSlots, setTokenDraft, slots,
            switchOrg, telemetry, tokenDraft, updateSlot,
          },
        })) : null,
        pickerOpen ? h('div', {
          className: 'dsub-modalWrap',
          onClick: (e) => { if (e.target === e.currentTarget) setPickerOpen(false) },
        },
          h('div', { className: 'dsub-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('providerGallery') },
            h('div', { className: 'dsub-modalHead' },
              h('div', { className: 'dsub-modalTitleWrap' },
                h('div', { className: 'dsub-modalIcon' }, '➕'),
                h('div', { className: 'dsub-h' }, t('providerGallery')),
              ),
              h('button', {
                type: 'button', className: 'dsub-mini', 'aria-label': t('closeModal'),
                onClick: () => setPickerOpen(false),
              }, '✕'),
            ),
            h('div', { className: 'dsub-sub', style: { marginTop: 10 } }, t('providerGalleryHint')),
            h('input', {
              className: 'dsub-inp',
              style: { width: '100%', marginTop: 10 },
              placeholder: t('searchProviders'),
              value: pickerQuery,
              onChange: (e) => setPickerQuery(e.target.value),
              autoFocus: true,
            }),
            h('div', { className: 'dsub-model-grid', style: { marginTop: 12 } },
              names.filter((prov) => prov.name.toLowerCase().includes(pickerQuery.trim().toLowerCase())).map((prov) => h('button', {
                key: prov.id,
                type: 'button',
                className: 'dsub-mini',
                onClick: () => { addSlot(prov.id); setPickerOpen(false); setPickerQuery('') },
              }, prov.name)),
            ),
          ),
        ) : null,
        h('div', { className: 'dsub-foot' },
          h('button', {
            type: 'button', className: 'dsub-save',
            onClick: () => save().catch((e) => setErr(cleanErrorMessage(e.message || e))),
          }, t('save')),
          h('button', {
            type: 'button', className: 'dsub-mini',
            disabled: !dirty,
            onClick: () => reload().catch((e) => setErr(cleanErrorMessage(e.message || e))),
          }, t('cancel')),
          dirty ? h('span', { className: 'dsub-sub' }, t('unsavedChanges')) : null,
          saved ? h('span', { className: 'dsub-ok' }, t('saved')) : null,
          info ? h('span', { className: 'dsub-ok' }, info) : null,
          err ? h('span', { className: 'dsub-bad' }, err) : null,
        ),
      )
    }
    function SubsSettingsPage(props) {
      const pageT = (props && props.t) || t
      return h('div', { className: 'dsub-settingsPage' },
        h(ErrorBoundary, null, h(SubsSection, Object.assign({}, props, { t: pageT }))),
      )
    }
    function PluginCard(props) {
      const cardT = (props && props.t) || t
      const page = !!(props && props.view === 'page')
      const [open, setOpen] = React.useState(!!page)
      if (props && props.view === 'summary') {
        return h('div', { className: 'dsub-description' }, cardT('cardIntro'))
      }
      if (props && props.status === 'loading') {
        return h(page ? 'div' : 'li', {
          className: page ? 'dsub-page' : 'dsub-card',
        },
          h('div', { className: 'dsub-header', style: { cursor: 'default' } },
            h('div', { className: 'dsub-headText' },
              h('div', { className: 'dsub-name' }, cardT('title')),
              h('div', { className: 'dsub-description' }, cardT('loading') || cardT('settingsLoading') || 'Loading…'),
            ),
          )
        )
      }
      if (props && props.status === 'unavailable') {
        return h(page ? 'div' : 'li', {
          className: page ? 'dsub-page' : 'dsub-card',
        },
          h('div', { className: 'dsub-header', style: { cursor: 'default' } },
            h('div', { className: 'dsub-headText' },
              h('div', { className: 'dsub-name' }, cardT('title')),
              h('div', { className: 'dsub-description', style: { color: 'var(--dsw-alias-state-warn-primary)' } },
                cardT('unavailable') || cardT('settingsUnavailable') || 'Settings are unavailable',
              ),
            ),
          )
        )
      }
      if (props && props.status === 'error') {
        return h(page ? 'div' : 'li', {
          className: page ? 'dsub-page' : 'dsub-card',
        },
          h('div', { className: 'dsub-header', style: { cursor: 'default' } },
            h('div', { className: 'dsub-headText' },
              h('div', { className: 'dsub-name' }, cardT('title')),
              h('div', { className: 'dsub-description', style: { color: 'var(--dsw-alias-state-error-primary)' } },
                (props.error && (props.error.message || String(props.error))) || cardT('error') || cardT('settingsError') || 'Settings error',
              ),
            ),
          )
        )
      }
      return h(page ? 'div' : 'li', {
        className: page ? 'dsub-page' : 'dsub-card' + (open ? ' dsub-cardOpen' : ''),
      },
        h('button', {
          type: 'button',
          className: 'dsub-header',
          style: page ? { display: 'none' } : undefined,
          onClick: () => setOpen(!open),
          'aria-expanded': page ? true : open,
        },
          h('div', { className: 'dsub-headText' },
            h('div', { className: 'dsub-name' }, cardT('title')),
            h('div', { className: 'dsub-description' }, cardT('cardIntro')),
          ),
          h(Chevron, { className: 'dsub-chev' + (open ? ' dsub-chevOpen' : '') }),
        ),
        (page || open) ? h('div', { className: 'dsub-body' },
          // #958: legacy seats do not receive props.t from the host; fall back
          // to the card translator instead of rendering raw locale keys.
          h(ErrorBoundary, null, h(SubsSection, Object.assign({}, props, { t: (props && props.t) || t }))),
        ) : null,
      )
    }
    function registerSettings(ctx) {
      const addLocale = (locale, dictionary) => {
        try {
          return ctx.locale.register(NS, locale, dictionary)
        } catch {
          return () => {}
        }
      }
      ctx.effect(() => {
        const undo = []
        let alive = true
        const wantsZh = () => {
          try {
            if (typeof navigator !== 'undefined' && /^zh/i.test(String(navigator.language || ''))) return true
            return t('lang') === 'zh'
          } catch { return false }
        }
        Promise.resolve()
          // #1057: English dict is a chunk too; register it before Chinese.
          .then(() => require.async('./client.en.js'))
          .then((mod) => {
            if (!alive || !mod || !mod.en) return null
            en = mod.en
            undo.push(addLocale('en', en))
            // #968: only fetch the zh dictionary when the host/browser is Chinese.
            return wantsZh() ? require.async('./client.zh.js') : null
          })
          .then((mod) => {
            if (!alive || !mod || !mod.zh) return
            undo.push(addLocale('zh', mod.zh))
          })
          .catch(err => debugIgnored('client.js: locale chunks', err))
        return () => {
          alive = false
          for (const off of undo) off()
        }
      }, 'dsh-subscriptions: locales')
      setT(ctx.locale.bind(NS))
      ctx.effect(() => {
        if (!ctx.slots || typeof ctx.slots.inject !== 'function') return () => {}
        return ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
          name: 'conversation.input.right',
          id: 'subscriptions-speed',
          order: 50,
          locale: NS,
          inject: () => ({}),
        }, SpeedToggle))
      }, 'dsh-subscriptions: composer speed toggle')
      ctx.effect(() => {
        if (!ctx.slots || typeof ctx.slots.inject !== 'function') return () => {}
        // #901: `tool.call.images` is declared by the host's read_image toolview,
        // and the slot ledger rejects a second declaration of the same child.
        // This row renders its own attachments through the entry's loadImage prop.
        const offs = ['image_generate', 'video_generate'].map((key) => ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
          name: 'tool.call.toolview',
          key,
          locale: NS,
        }, GeneratedMediaRow)))
        return () => { for (const off of offs) if (typeof off === 'function') off() }
      }, 'dsh-subscriptions: generated media rows')
      ctx.effect(() => {
        const cleanups = []
        // #968: if the host registers the settings section after the fallback
        // timer fired, drop the legacy seats instead of rendering duplicate cards.
        let legacyOffs = null
        const unregisterLegacySeats = () => {
          if (!legacyOffs) return
          for (const off of legacyOffs) {
            try { off() } catch (err) { debugIgnored("client.js: legacy cleanup", err) }
          }
          legacyOffs = null
        }
        const registerLegacySeats = () => {
          if (legacyOffs) return
          legacyOffs = []
          if (!ctx.slots || typeof ctx.slots.inject !== 'function') return
          const un1 = ctx.slots.inject('plugins.item', () => ctx.slots.register(
            {
              name: 'plugins.item',
              id: ROW_ID,
              order: 60,
              label: () => t('title') || 'Subscriptions',
              locale: NS,
              inject: () => ({ ctx: ctx }),
            },
            PluginCard,
          ))
          if (typeof un1 === 'function') { cleanups.push(un1); legacyOffs.push(un1) }
          const unBundle = ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register(
            {
              name: 'plugins.bundle.config',
              key: PKG,
              locale: NS,
              inject: () => ({ ctx: ctx }),
            },
            PluginCard,
          ))
          if (typeof unBundle === 'function') { cleanups.push(unBundle); legacyOffs.push(unBundle) }
          for (const key of [ROW_CONFIG_KEY, ROW_ID + '#' + ROW_ID, ROW_ID]) {
            const unRow = ctx.slots.inject('plugins.row.config', () => ctx.slots.register(
              {
                name: 'plugins.row.config',
                key,
                locale: NS,
                inject: () => ({ ctx: ctx }),
              },
              PluginCard,
            ))
            if (typeof unRow === 'function') { cleanups.push(unRow); legacyOffs.push(unRow) }
          }
        }
        let hasSection = false
        try {
          if (ctx.slots && typeof ctx.slots.inject === 'function') {
            const unSection = ctx.slots.inject('settings.section', () => {
              hasSection = true
              unregisterLegacySeats()
              return ctx.slots.register(
                {
                  name: 'settings.section',
                  id: ROW_ID,
                  order: 60,
                  label: () => t('title') || 'Subscriptions',
                  locale: NS,
                  inject: () => ({ ctx: ctx }),
                },
                SubsSettingsPage,
              )
            })
            if (typeof unSection === 'function') cleanups.push(unSection)
            const timer = setTimeout(() => {
              if (!hasSection) registerLegacySeats()
            }, 250)
            cleanups.push(() => clearTimeout(timer))
          }
        } catch (err) {
          debugIgnored("client.js: settings.section registration failed", err)
        }
        return () => {
          for (const off of cleanups) {
            try { off() } catch (err) { debugIgnored("client.js: best-effort cleanup", err) }
          }
        }
      }, 'dsh-subscriptions: settings slots')
    }
        const ORDER = ['codex', 'claude', 'grok', 'antigravity']
    async function refreshLoggedIn() {
      try {
        const res = await fetch('/dsh-subscriptions/status', { cache: 'no-store' })
        const data = await res.json().catch(() => ({}))
        const loggedIn = (data && data.loggedIn) || {}
        const usage = (data && data.usagePercent) || {}
        const logged = ORDER.filter((p) => loggedIn[p])
        const maxUsage = logged.reduce((m, p) => Math.max(m, usage[p] || 0), 0)
        return {
          logged,
          usage: maxUsage,
          expiresAt: (data && data.expiresAt) || {},
          labels: (data && data.labels) || {},
          expiryNotifyDays: (data && data.expiryNotifyDays) || 7,
          composerQuota: (data && data.composerQuota) || 'off',
          composerQuotaDisplay: (data && data.composerQuotaDisplay) || 'hidden',
          showSubsPill: Boolean(data && data.showSubsPill),
          quotaWidget: (data && data.quotaWidget) || 'off',
          quotaWidgetPosition: (data && data.quotaWidgetPosition) || { right: 16, bottom: 16 },
          enableToasts: (data && data.enableToasts !== undefined) ? data.enableToasts !== false : true,
          active: (data && data.active) || null,
          error: null,
        }
      } catch { return { logged: [], usage: 0, expiresAt: {}, labels: {}, expiryNotifyDays: 7, fastMode: false, composerQuota: 'off', composerQuotaDisplay: 'hidden', showSubsPill: false, quotaWidget: 'off', enableToasts: true, active: null, error: 'status unavailable' } }
    }
    function currentModelProvider(props) {
      let session = null
      try {
        const ctx = typeof window !== 'undefined' ? window.__dshCtx : null
        session = (props && (props.session || props.conversation))
          || (ctx && ctx.sessions && (ctx.sessions.current || ctx.sessions.active
            || (typeof ctx.sessions.getCurrent === 'function' && ctx.sessions.getCurrent())))
          || null
      } catch (err) { debugIgnored("client.js: sessions service is optional", err) }
      const model = session && (session.model || session.modelId
        || (session.header && session.header.model) || (session.state && session.state.model))
      if (!model) return null
      if (typeof model === 'object') return model.provider || null
      const text = String(model)
      return text.includes('/') ? text.split('/')[0] : null
    }
    // #623: the session widgets live in their own chunk. They need formatters and
    // the modal hook that stay here, so the chunk is built with one `deps` object
    // rather than seventeen props and a second copy of each helper.
    let widgetsPromise = null
    function loadWidgets() {
      if (!widgetsPromise) {
        widgetsPromise = require.async('./client.widgets.js').then((mod) => mod.createWidgets({
          h,
          useModalA11y,
          createPortal,
          debugIgnored,
          cleanErrorMessage,
          ignoreClientError,
          formatRelativeReset,
          barTone,
          ledClass,
          formatMmSs,
          currentModelProvider,
          refreshLoggedIn,
          ErrorBoundary,
          NS,
          PKG,
        }))
      }
      return widgetsPromise
    }

    // #1094: the diagnostic wizard and the vault backup panel. They were 168 lines
    // of render code plus four handlers inside SubsSection; taking them out brings
    // client.js under the 150 000 B floor the epic sets. No hooks, so they move
    // unchanged — state comes in through props.
    let modalsPromise = null
    function loadModals() {
      if (!modalsPromise) {
        modalsPromise = require.async('./client.modals.js').then((mod) => mod.createModals({ h }))
      }
      return modalsPromise
    }
    const DiagnosticWizard = React.lazy(() => loadModals().then((built) => ({ default: built.DiagnosticWizard })))
    const VaultBackupPanel = React.lazy(() => loadModals().then((built) => ({ default: built.VaultBackupPanel })))

    /** A widget from the chunk, rendered only once the chunk has loaded. */
    function widget(exportName, props) {
      const Chunk = React.lazy(() => loadWidgets().then((built) => ({ default: built[exportName] })))
      return function LazyWidget(extra) {
        return h(React.Suspense, { fallback: null }, h(Chunk, Object.assign({}, props, extra)))
      }
    }

    function registerSubsPill(ctx) {
      const SubsPill = widget('SubsPill')
      ctx.effect(() => {
        ctx.slots.inject('conversation.session.header.actions', () =>
          ctx.slots.register(
            {
              name: 'conversation.session.header.actions',
              id: 'dsh-subscriptions-subs-pill',
              order: 15,
              locale: NS,
            },
            () => h(ErrorBoundary, null, h(SubsPill, { t, ctx })),
          ),
        )
      }, 'dsh-subscriptions: subs pill')
    }

    function registerComposerQuota(ctx) {
      const ComposerQuota = widget('ComposerQuota')
      ctx.effect(() => {
        ctx.slots.inject('conversation.input.right', () =>
          ctx.slots.register(
            {
              name: 'conversation.input.right',
              id: 'dsh-subscriptions-composer-quota',
              order: 5,
              locale: NS,
            },
            () => h(ErrorBoundary, null, h(ComposerQuota, { t })),
          ),
        )
      }, 'dsh-subscriptions: composer quota')
    }

    function registerQuotaCapsule(ctx) {
      const QuotaCapsule = widget('QuotaCapsule')
      ctx.effect(() => {
        ctx.slots.inject('conversation.session.header.utilities', () =>
          ctx.slots.register(
            {
              name: 'conversation.session.header.utilities',
              id: 'dsh-subscriptions-quota-capsule',
              order: 30,
              locale: NS,
            },
            () => h(ErrorBoundary, null, h(QuotaCapsule, { t, ctx })),
          ),
        )
      }, 'dsh-subscriptions: quota capsule')
    }

    function registerCentralDashboard(ctx) {
      ctx.effect(() => {
        if (!ctx.slots || typeof ctx.slots.inject !== 'function') return () => {}
        return ctx.slots.inject('main', () =>
          ctx.slots.register(
            {
              name: 'main',
              key: 'subscriptions-panel',
              locale: NS,
              inject: () => ({ close: () => ctx.get('layout')?.selectPanel(null) }),
            },
            () => h(ErrorBoundary, null, h(SubscriptionsPanel, {
              t,
              close: () => ctx.get('layout')?.selectPanel(null),
            })),
          ),
        )
      }, 'dsh-subscriptions: central dashboard')
    }

    function registerSidebarQuotaMeter(ctx) {
      const SidebarQuotaCard = widget('SidebarQuotaCard')
      ctx.effect(() => {
        try {
          ctx.inject(['layout'], (layoutCtx) => {
            if (!layoutCtx || !layoutCtx.slots || typeof layoutCtx.slots.inject !== 'function') return
            const layoutSlots = layoutCtx.slots
            layoutCtx.slots.inject('sidebar.footer.action', () =>
              layoutSlots.register(
                {
                  name: 'sidebar.footer.action',
                  id: 'subscriptions-quota',
                  order: 1,
                  locale: NS,
                  inject: () => ({ open: () => ctx.get('layout')?.selectPanel('subscriptions-panel') }),
                },
                () => h(ErrorBoundary, null, h(SidebarQuotaCard, {
                  t,
                  open: () => ctx.get('layout')?.selectPanel('subscriptions-panel'),
                })),
              ),
            )
          })
        } catch (err) { debugIgnored("client.js: sidebar quota meter", err) }
      }, 'dsh-subscriptions: sidebar quota meter')
    }

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
            }).catch(ignoreClientError('client.js: request'))
            return
          }
          if (cmd === 'status' || (cmd === 'login' && prov === 'status')) { refreshLoggedIn().catch(ignoreClientError('client.js: request')); return }
          if (!prov || !providerMatch.test(prov)) return
          fetch('/dsh-subscriptions/oauth/start?provider=' + encodeURIComponent(prov) + '&index=1', { cache: 'no-store' })
            .then((r) => r.json()).then((data) => {
              const target = data && safeExternalUrl(data.url)
              if (target) {
                const popup = window.open(target, '_blank', 'noopener')
                if (!popup) {
                  copyText(target)
                }
              }
            }).catch(ignoreClientError('client.js: request'))
        }
        const line = (line) => line.trim()
        const sources = [
          { name: 'login', description: t('slashLogin') },
          { name: 'fast', description: t('slashFast') },
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
              if (src.name === 'login' && /\bstatus\b/.test(t2)) {
                return refreshLoggedIn().then((result) => {
                  const providers = (result && Array.isArray(result.logged)) ? result.logged : []
                  return { text: t('connectedLabel') + ': ' + (providers.length ? providers.join(', ') : 'none') }
                })
              }
              if (src.name === 'fast') {
                const mode = /\bstandard\b|\boff\b/.test(t2) ? 'standard' : 'fast'
                const sid = (_session && (_session.id || _session.sessionId || (_session.header && _session.header.id))) || 'default'
                return fetch('/dsh-subscriptions/speed', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ sessionId: sid, mode }),
                }).then((r) => r.json()).then((d) => ({
                  text: t('codexSpeedLabel') + ': ' + (d && d.mode === 'fast' ? t('speedFast') : t('speedStandard')),
                })).catch((e) => ({ text: t('codexSpeedLabel') + ': ' + String(e && e.message || e) }))
              }
              run(src.name, t2)
              return Promise.resolve('handled')
            },
          }),
        )
        return () => { for (const off of disposers) off() }
      }, 'dsh-subscriptions: slash commands')
    }
    exports.inject = ['slots', 'locale']
    exports.apply = function apply(ctx) {
      if (typeof window !== 'undefined') {
        window.__dshCtx = ctx
      }
      setT(ctx.locale.bind(NS))
      try {
        ctx.inject(['pluginNavigation'], (navCtx) => {
          ctx.pluginNavigation = navCtx.pluginNavigation
        })
      } catch (err) { debugIgnored("client.js: optional", err) }
      try {
        ctx.inject(['layout'], (layoutCtx) => {
          ctx.layout = layoutCtx.layout
        })
      } catch (err) { debugIgnored("client.js: optional", err) }
      registerSettings(ctx)
      registerSubsPill(ctx)
      registerComposerQuota(ctx)
      registerQuotaCapsule(ctx)
      registerSlashCommands(ctx)
      registerCentralDashboard(ctx)
      registerSidebarQuotaMeter(ctx)
    }
    return module.exports
  },
})
