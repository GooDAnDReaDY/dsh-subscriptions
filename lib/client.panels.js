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


    return { WebhookTestButton, VaultSnapshotsPanel, ProviderPacksPanel, SourcesPanel }
  }
})
