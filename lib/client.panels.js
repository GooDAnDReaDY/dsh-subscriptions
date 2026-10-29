/* global window */
window.__ModuleLoader__.load({
  id: '@goodandready/dsh-subscriptions',
  chunk: 'client.panels.js',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement

    function WebhookTestButton(props) {
      const t = (props && props.t) || ((k) => k)
      const [state, setState] = React.useState({ busy: false, message: '', error: null })
      const send = () => {
        setState({ busy: true, message: '', error: null })
        fetch('/dsh-subscriptions/webhook/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
          .then(async (res) => {
            const data = await res.json().catch(() => ({}))
            if (!res.ok || !data.delivered) throw new Error((data.error && data.error.message) || ('HTTP ' + res.status))
            setState({ busy: false, message: t('delivered'), error: null })
          })
          .catch((err) => setState({ busy: false, message: '', error: String(err && err.message || err) }))
      }
      return h('div', { className: 'dsub-row' },
        h('button', { type: 'button', className: 'dsub-mini', disabled: state.busy, onClick: send }, state.busy ? '…' : t('sendTest')),
        state.message ? h('span', { className: 'dsub-ok' }, state.message) : null,
        state.error ? h('span', { className: 'dsub-bad' }, state.error) : null,
      )
    }

    // #736: vault snapshot list with create/restore. Payload stays server-side.
    function VaultSnapshotsPanel(props) {
      const t = (props && props.t) || ((k) => k)
      const [state, setState] = React.useState({ snapshots: [], stats: null, message: '', error: null, busy: false })
      const pull = () => {
        fetch('/dsh-subscriptions/vault/snapshots', { cache: 'no-store' })
          .then((res) => res.json())
          .then((data) => setState((st) => Object.assign({}, st, { snapshots: data.snapshots || [], stats: data.stats || null, error: null })))
          .catch((err) => setState((st) => Object.assign({}, st, { error: String(err && err.message || err) })))
      }
      React.useEffect(() => { pull() }, [])
      const call = (url, body) => fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body || {}),
      }).then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data.ok) throw new Error((data.error && data.error.message) || ('HTTP ' + res.status))
        return data
      })
      const create = () => {
        setState((st) => Object.assign({}, st, { busy: true, message: '', error: null }))
        call('/dsh-subscriptions/vault/snapshots', { label: 'manual' })
          .then((data) => { setState((st) => Object.assign({}, st, { busy: false, message: t('created') + ' ' + data.snapshot.id })); pull() })
          .catch((err) => setState((st) => Object.assign({}, st, { busy: false, error: String(err && err.message || err) })))
      }
      const restore = (id) => {
        setState((st) => Object.assign({}, st, { busy: true, message: '', error: null }))
        call('/dsh-subscriptions/vault/snapshots/restore', { id })
          .then((data) => { setState((st) => Object.assign({}, st, { busy: false, message: t('restoredSlots') + ' ' + data.slotCount })); pull() })
          .catch((err) => setState((st) => Object.assign({}, st, { busy: false, error: String(err && err.message || err) })))
      }
      return h('div', { className: 'dsub-section-card' },
        h('div', { className: 'dsub-section-title' }, t('vaultSnapshots'), h('button', { type: 'button', className: 'dsub-mini', onClick: create, disabled: state.busy }, state.busy ? '…' : t('createSnapshot'))),
        h('div', { className: 'dsub-section-desc' }, t('vaultSnapshotsHint')),
        state.stats ? h('div', { className: 'dsub-dim' }, state.stats.count + ' snapshots · ' + state.stats.bytes + ' bytes · ' + state.stats.path) : null,
        state.snapshots.length ? state.snapshots.map((snap) => h('div', { className: 'dsub-row', key: snap.id },
          h('span', { className: 'dsub-h' }, snap.id),
          h('span', { className: 'dsub-dim' }, (snap.label || '-') + ' · ' + snap.slotCount + ' slots · ' + snap.createdAt),
          h('button', { type: 'button', className: 'dsub-mini', disabled: state.busy, onClick: () => restore(snap.id) }, t('restoreSnapshot')),
        )) : h('div', { className: 'dsub-dim' }, t('noSnapshots')),
        state.message ? h('div', { className: 'dsub-ok' }, state.message) : null,
        state.error ? h('div', { className: 'dsub-bad' }, state.error) : null,
      )
    }

    // #724: provider pack manager. Displays ids/models only; headers are masked.
    function ProviderPacksPanel(props) {
      const t = (props && props.t) || ((k) => k)
      const [state, setState] = React.useState({ packs: [], text: '', message: '', error: null, busy: false })
      const publicPack = (pack) => {
        const copy = Object.assign({}, pack)
        if (copy.clientSecret) copy.clientSecret = '••••'
        if (copy.headers && typeof copy.headers === 'object') {
          copy.headers = Object.fromEntries(Object.keys(copy.headers).map((key) => [key, '••••']))
        }
        return copy
      }
      const pull = () => {
        fetch('/dsh-subscriptions/config', { cache: 'no-store' })
          .then((res) => res.json())
          .then((cfg) => setState((st) => Object.assign({}, st, { packs: (cfg.config && cfg.config.providerPacks) || [] })))
          .catch((err) => setState((st) => Object.assign({}, st, { error: String(err && err.message || err) })))
      }
      React.useEffect(() => { pull() }, [])
      const parse = () => {
        const raw = JSON.parse(state.text || '{}')
        return raw && raw.pack ? raw.pack : raw
      }
      const validate = (pack) => fetch('/dsh-subscriptions/provider-packs/validate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ pack }),
      }).then(async (res) => {
        const data = await res.json()
        if (!res.ok || !data.ok) throw new Error((data.error && data.error.message) || ('HTTP ' + res.status))
        return data.pack
      })
      const save = () => {
        setState((st) => Object.assign({}, st, { busy: true, message: '', error: null }))
        Promise.resolve().then(parse)
          .then(async (pack) => {
            const checked = await validate(pack)
            const cfg = await fetch('/dsh-subscriptions/config', { cache: 'no-store' }).then((res) => res.json())
            const packs = ((cfg.config && cfg.config.providerPacks) || []).filter((p) => p && p.id !== pack.id)
            packs.push(pack)
            const res = await fetch('/dsh-subscriptions/config', {
              method: 'PUT',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ config: Object.assign({}, cfg.config, { providerPacks: packs }), revision: cfg.revision }),
            })
            if (!res.ok) throw new Error('HTTP ' + res.status)
            setState((st) => Object.assign({}, st, { packs, busy: false, message: t('saved') + ' ' + checked.id, text: '' }))
          })
          .catch((err) => setState((st) => Object.assign({}, st, { busy: false, error: String(err && err.message || err) })))
      }
      const exportPacks = () => setState((st) => Object.assign({}, st, { text: JSON.stringify(st.packs.map(publicPack), null, 2), message: t('exported') }))
      return h('div', { className: 'dsub-section-card' },
        h('div', { className: 'dsub-section-title' }, t('providerPacks'), h('button', { type: 'button', className: 'dsub-mini', onClick: pull }, '↻')),
        h('div', { className: 'dsub-section-desc' }, t('providerPacksHint')),
        state.packs.length ? state.packs.map((pack) => h('div', { className: 'dsub-row', key: pack.id },
          h('span', { className: 'dsub-h' }, pack.id),
          h('span', { className: 'dsub-dim' }, (pack.displayName || '') + ' · ' + ((pack.models || []).length) + ' models'),
        )) : h('div', { className: 'dsub-dim' }, t('noPacks')),
        h('textarea', {
          className: 'dsub-inp',
          style: { width: '100%', minHeight: 120, fontFamily: 'ui-monospace,monospace', padding: 8 },
          value: state.text,
          placeholder: '{"id":"acme","displayName":"Acme AI","authUrl":"https://…","tokenUrl":"https://…","baseUrl":"https://…","clientId":"…","models":[{"id":"acme-1"}]}',
          onChange: (e) => setState((st) => Object.assign({}, st, { text: e.target.value, message: '', error: null })),
        }),
        h('div', { className: 'dsub-row' },
          h('button', { type: 'button', className: 'dsub-mini', disabled: state.busy, onClick: save }, state.busy ? '…' : t('validateAndSave')),
          h('button', { type: 'button', className: 'dsub-mini', onClick: exportPacks }, t('exportPacks')),
        ),
        state.message ? h('div', { className: 'dsub-ok' }, state.message) : null,
        state.error ? h('div', { className: 'dsub-bad' }, state.error) : null,
      )
    }

    // #713: read-only source chain panel. Never renders key values.
    function SourcesPanel(props) {
      const t = (props && props.t) || ((k) => k)
      const [state, setState] = React.useState({ loading: true, data: null, error: null })
      const pull = () => {
        fetch('/dsh-subscriptions/sources', { cache: 'no-store' })
          .then((res) => res.json())
          .then((data) => setState({ loading: false, data, error: null }))
          .catch((err) => setState({ loading: false, data: null, error: String(err && err.message || err) }))
      }
      React.useEffect(() => {
        pull()
        const id = setInterval(pull, 30 * 1000)
        return () => clearInterval(id)
      }, [])
      const sourceLabel = (source) => source === 'api-key' ? t('apiKeySource') : (source === 'oauth' ? t('oauthSource') : (source === 'ollama' ? t('ollamaSource') : t('sourceNone')))
      return h('div', { className: 'dsub-section-card' },
        h('div', { className: 'dsub-section-title' }, t('sources'), h('button', { type: 'button', className: 'dsub-mini', onClick: pull }, state.loading ? '…' : '↻')),
        h('div', { className: 'dsub-section-desc' }, t('sourcesHint')),
        state.error ? h('div', { className: 'dsub-bad' }, state.error) : null,
        state.data && state.data.keyRotation && !state.data.keyRotation.available
          ? h('div', { className: 'dsub-dim' }, t('keyRotationOffline') + (state.data.keyRotation.reason ? ': ' + state.data.keyRotation.reason : ''))
          : null,
        state.data && state.data.keyRotation && state.data.keyRotation.available
          ? h('div', { className: 'dsub-dim' }, t('keyRotationHealth') + ': ' + state.data.keyRotation.healthyKeys + '/' + state.data.keyRotation.totalKeys + ' healthy keys')
          : null,
        (state.data && state.data.providers ? state.data.providers : []).map((row) => h('div', { className: 'dsub-row', key: row.provider },
          h('span', { className: 'dsub-h' }, row.provider),
          h('span', { className: 'dsub-pillTag' }, sourceLabel(row.selected)),
          row.candidates.map((c, i) => h('span', { key: i, className: 'dsub-dim' },
            sourceLabel(c.source) + (c.available ? ' ✓' : ' ✕'))),
        )),
      )
    }


    // #789/#807/#812/#802: account dashboard, model editor, lazy usage and speed controls.
    function AccountsDashboardPanel(props) {
      const t = (props && props.t) || ((k) => k)
      const [data, setData] = React.useState(null)
      const [provider, setProvider] = React.useState('')
      const [query, setQuery] = React.useState('')
      const [sort, setSort] = React.useState('risk')
      const [usage, setUsage] = React.useState({})
      const [speed, setSpeed] = React.useState('standard')
      const [analytics, setAnalytics] = React.useState(null)
      const [compact, setCompact] = React.useState(false)
      const [editing, setEditing] = React.useState(false)
      const [draft, setDraft] = React.useState({})
      const usageRef = React.useRef({ inflight: {}, gen: {} })
      const pull = () => fetch('/dsh-subscriptions/config', { cache: 'no-store' })
        .then((res) => res.json())
        .then((cfg) => {
          setData(cfg)
          setSpeed((cfg.config && cfg.config.codexSubagentSpeed) || 'standard')
          setDraft(JSON.parse(JSON.stringify((cfg.config && cfg.config.modelOverrides) || {})))
          if (!provider && cfg.accounts && cfg.accounts.length) setProvider(cfg.accounts[0].provider)
        })
        .catch(() => {})
      React.useEffect(() => {
        pull()
        fetch('/dsh-subscriptions/analytics', { cache: 'no-store' })
          .then((res) => res.json())
          .then((out) => setAnalytics((out && out.analytics) || null))
          .catch(() => {})
      }, [])
      const saveOverrides = () => {
        if (!data || !data.config) return
        fetch('/dsh-subscriptions/config', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ config: Object.assign({}, data.config, { modelOverrides: draft }), revision: data.revision }),
        }).then(() => { setEditing(false); pull() }).catch(() => {})
      }
      const cancelOverrides = () => {
        setDraft(JSON.parse(JSON.stringify((data && data.config && data.config.modelOverrides) || {})))
        setEditing(false)
      }
      const loadUsage = (row) => {
        const key = row.provider + ':' + row.index
        if (usageRef.current.inflight[key]) return
        const gen = (usageRef.current.gen[key] || 0) + 1
        usageRef.current.gen[key] = gen
        usageRef.current.inflight[key] = true
        setUsage((m) => Object.assign({}, m, { [key]: { loading: true } }))
        fetch('/dsh-subscriptions/usage?provider=' + encodeURIComponent(row.provider) + '&index=' + encodeURIComponent(row.index), { cache: 'no-store' })
          .then((res) => res.json())
          .then((out) => {
            if (usageRef.current.gen[key] !== gen) return
            setUsage((m) => Object.assign({}, m, { [key]: { value: out, loading: false } }))
          })
          .catch((e) => {
            if (usageRef.current.gen[key] === gen) setUsage((m) => Object.assign({}, m, { [key]: { loading: false, error: String(e && e.message || e) } }))
          })
          .finally(() => { usageRef.current.inflight[key] = false })
      }
      const saveSpeed = (value) => {
        setSpeed(value)
        if (!data || !data.config) return
        fetch('/dsh-subscriptions/config', {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ config: Object.assign({}, data.config, { codexSubagentSpeed: value }), revision: data.revision }),
        }).then(pull).catch(() => {})
      }
      const accounts = (data && data.accounts) || []
      const selected = provider || (accounts[0] && accounts[0].provider) || ''
      const rows = accounts.filter((row) => row.provider === selected).sort((a, b) => {
        if (sort === 'name') return String(a.label || a.email || a.ref).localeCompare(String(b.label || b.email || b.ref))
        if (sort === 'quota') return (b.usagePercent || 0) - (a.usagePercent || 0)
        return (b.usagePercent || 0) + (b.errors || 0) * 5 - ((a.usagePercent || 0) + (a.errors || 0) * 5)
      })
      const models = ((data && data.modelsCatalog) || []).filter((m) => m.provider === selected)
      const q = query.trim().toLowerCase()
      const shown = models.filter((m) => !q || [m.id, m.name, m.alias].some((v) => String(v || '').toLowerCase().includes(q)))
      const providers = Array.from(new Set(accounts.map((row) => row.provider).filter(Boolean)))
      return h('div', { className: 'dsub-section-card' },
        h('div', { className: 'dsub-section-title' }, t('accountsDashboard'), h('button', { type: 'button', className: 'dsub-mini', onClick: pull }, '↻')),
        h('div', { className: 'dsub-row' },
          h('select', { className: 'dsub-select', value: selected, onChange: (e) => setProvider(e.target.value) },
            providers.map((id) => h('option', { key: id, value: id }, id))),
          h('select', { className: 'dsub-select', value: sort, onChange: (e) => setSort(e.target.value) },
            ['risk', 'quota', 'name'].map((id) => h('option', { key: id, value: id }, t('sort' + id[0].toUpperCase() + id.slice(1))))),
          h('span', { className: 'dsub-sub' }, t('speedSubagent') + ':'),
          h('select', { className: 'dsub-select', value: speed, onChange: (e) => saveSpeed(e.target.value) },
            h('option', { value: 'standard' }, 'Standard'), h('option', { value: 'fast' }, 'Fast')),
        ),
        rows.map((row, i) => {
          const key = row.provider + ':' + row.index
          const u = usage[key]
          return h('div', { key: key + ':' + i, className: 'dsub-group', style: { padding: '8px' } },
            h('div', { className: 'dsub-row' },
              h('span', { className: 'dsub-h' }, '#' + row.index + ' ' + (row.label || row.email || row.ref)),
              h('span', { className: 'dsub-pillTag' }, row.quarantineUntil > Date.now() ? t('statusQuarantined') : (row.cooldownUntil > Date.now() ? t('statusCooling') : t('statusHealthy')))),
            h('div', { className: 'dsub-sub' }, t('quotaUsed') + ': ' + (row.usagePercent == null ? '—' : row.usagePercent + '%') + ' · ' + t('requests') + ' ' + (row.requests || 0) + ' · ' + t('errors') + ' ' + (row.errors || 0)),
            h('div', { className: 'dsub-row' },
              h('button', { type: 'button', className: 'dsub-mini', onClick: () => loadUsage(row) }, u && u.loading ? '…' : t('loadUsage')),
              u && u.error ? h('span', { className: 'dsub-bad' }, u.error) : null,
              u && u.value ? h('span', { className: 'dsub-dim' }, JSON.stringify(u.value).slice(0, 180)) : null),
          )
        }),
        h('div', { className: 'dsub-row' },
          h('label', { className: 'dsub-sub' }, h('input', { type: 'checkbox', checked: compact, onChange: (e) => setCompact(e.target.checked) }), ' ' + t('compact')),
        ),
        h('div', { className: 'dsub-h' }, t('heatmap')),
        h('div', { className: 'dsub-row', style: { gap: 2 } },
          ((analytics && analytics.hourly) || []).slice(-24).map((hour, i) => h('span', {
            key: i,
            title: (hour && hour.requests || 0) + ' req',
            style: { display: 'inline-block', width: 8, height: 18, background: 'rgba(88,166,255,' + Math.min(1, ((hour && hour.requests) || 0) / 10 + 0.1) + ')' },
          }))),
        h('div', { className: 'dsub-row' },
          h('span', { className: 'dsub-h' }, t('modelEditor') + ' · ' + t('discovered') + ' ' + models.length + ' · ' + t('shown') + ' ' + shown.length),
          h('button', { type: 'button', className: 'dsub-mini', onClick: () => setEditing(!editing) }, t('editModels')),
          editing ? h('button', { type: 'button', className: 'dsub-mini', onClick: saveOverrides }, t('save')) : null,
          editing ? h('button', { type: 'button', className: 'dsub-mini', onClick: cancelOverrides }, t('cancel')) : null,
        ),
        h('input', { className: 'dsub-grow', value: query, placeholder: t('searchModels'), onChange: (e) => setQuery(e.target.value) }),
        shown.slice(0, 40).map((m) => h('div', { key: m.id, className: 'dsub-row' },
          h('span', { className: 'dsub-h' }, m.independent ? '★ ' : ''),
          editing
            ? h('input', {
              className: 'dsub-grow',
              value: (draft[m.id] && draft[m.id].name) || '',
              placeholder: m.name || m.id,
              onChange: (e) => setDraft((d) => Object.assign({}, d, { [m.id]: Object.assign({}, d[m.id], { name: e.target.value }) })),
            })
            : h('span', { className: 'dsub-sub' }, (draft[m.id] && draft[m.id].name) || m.name || m.id),
          editing ? h('input', {
            type: 'number',
            className: 'dsub-inp',
            style: { width: '90px', minWidth: '90px' },
            value: (draft[m.id] && draft[m.id].contextWindow) || '',
            placeholder: 'ctx',
            onChange: (e) => setDraft((d) => Object.assign({}, d, { [m.id]: Object.assign({}, d[m.id], { contextWindow: Number(e.target.value) || undefined }) })),
          }) : null,
          editing ? h('select', {
            className: 'dsub-select',
            value: (draft[m.id] && draft[m.id].reasoningEffort) || '',
            onChange: (e) => setDraft((d) => Object.assign({}, d, { [m.id]: Object.assign({}, d[m.id], { reasoningEffort: e.target.value || undefined }) })),
          }, ['', 'low', 'medium', 'high'].map((level) => h('option', { key: level || 'default', value: level }, level || 'effort'))) : null,
          editing ? h('label', { className: 'dsub-dim' },
            h('input', {
              type: 'checkbox',
              checked: !!(draft[m.id] && draft[m.id].hidden),
              onChange: (e) => setDraft((d) => Object.assign({}, d, { [m.id]: Object.assign({}, d[m.id], { hidden: e.target.checked }) })),
            }), ' ' + t('hidden')) : null,
          h('span', { className: 'dsub-dim' }, m.id))),
      )
    }

    return { WebhookTestButton, VaultSnapshotsPanel, ProviderPacksPanel, SourcesPanel, AccountsDashboardPanel }
  }
})
