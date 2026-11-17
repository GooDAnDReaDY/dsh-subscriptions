/* global window */
// #1087: the policy surface lives in its own lazy chunk. The main bundle is at
// 88% of the DSH Store file limit, so 44 new controls cannot be added inline;
// splitting also keeps the settings card's first paint unchanged.
window.__ModuleLoader__.load({
  id: '@goodandready/dsh-subscriptions',
  chunk: 'client.policy.js',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement

    /**
     * One row per managed Config key. `scale` converts between the stored unit and
     * the shown unit (ms <-> s), so the value on disk keeps its documented shape.
     * Every label is a locale key equal to the Config key name; the dictionaries
     * carry the English source text and the Chinese translation.
     */
    const FIELDS = [
      // routing
      { key: 'switchAtRemaining', section: 'routing', type: 'number', step: 0.5, min: 0, max: 100 },
      { key: 'autoPacing', section: 'routing', type: 'bool' },
      { key: 'drainBeforeReset', section: 'routing', type: 'bool' },
      { key: 'drainSafetyPercent', section: 'routing', type: 'number', min: 0, max: 100 },
      { key: 'proactiveGuard', section: 'routing', type: 'bool' },
      { key: 'proactiveMinRemaining', section: 'routing', type: 'number', min: 0, max: 100 },
      { key: 'promptCacheTtlMinutes', section: 'routing', type: 'number', min: 0 },
      { key: 'modelAccountRules', section: 'routing', type: 'json' },
      { key: 'routingPresets', section: 'routing', type: 'json' },
      { key: 'scheduleRules', section: 'routing', type: 'json' },
      { key: 'tiers', section: 'routing', type: 'json' },

      // health and recovery
      { key: 'refreshAheadMs', section: 'health', type: 'number', scale: 1000, min: 0 },
      { key: 'refreshRetryMs', section: 'health', type: 'number', scale: 1000, min: 0 },
      { key: 'selfHealIntervalMin', section: 'health', type: 'number', min: 0 },
      { key: 'warmupAt', section: 'health', type: 'text' },
      { key: 'leaseEnabled', section: 'health', type: 'bool' },
      { key: 'leaseTtlMs', section: 'health', type: 'number', scale: 1000, min: 1 },

      // network
      { key: 'proxyPool', section: 'network', type: 'list' },
      { key: 'proxyPoolCooldownMs', section: 'network', type: 'number', scale: 1000, min: 0 },
      { key: 'namespacedRoutes', section: 'network', type: 'bool' },

      // model tools
      { key: 'codexWebSearch', section: 'tools', type: 'bool' },
      { key: 'codexWebSearchModel', section: 'tools', type: 'text' },
      { key: 'nativeTools', section: 'tools', type: 'bool' },

      // alerts
      { key: 'alertThresholds', section: 'alerts', type: 'list' },
      { key: 'webhookAllowPrivate', section: 'alerts', type: 'bool' },

      // vault synchronisation
      { key: 'vaultSyncEnabled', section: 'vault', type: 'bool' },
      { key: 'vaultSyncAutoPush', section: 'vault', type: 'bool' },
      { key: 'vaultSyncIntervalHours', section: 'vault', type: 'number', min: 0 },
      { key: 'vaultSyncTimeoutMs', section: 'vault', type: 'number', scale: 1000, min: 1 },
      { key: 'vaultSyncAllowPrivate', section: 'vault', type: 'bool' },
      { key: 'vaultSyncWebdavUrl', section: 'vault', type: 'text' },
      { key: 'vaultSyncWebdavUsername', section: 'vault', type: 'text' },
      { key: 'vaultSyncWebdavPassword', section: 'vault', type: 'secret' },
      { key: 'vaultSyncGistBaseUrl', section: 'vault', type: 'text' },
      { key: 'vaultSyncGistId', section: 'vault', type: 'text' },
      { key: 'vaultSyncGistToken', section: 'vault', type: 'secret' },
      { key: 'vaultSyncS3Endpoint', section: 'vault', type: 'text' },
      { key: 'vaultSyncS3Bucket', section: 'vault', type: 'text' },
      { key: 'vaultSyncS3Key', section: 'vault', type: 'text' },
      { key: 'vaultSyncS3Region', section: 'vault', type: 'text' },
      { key: 'vaultSyncS3AccessKey', section: 'vault', type: 'text' },
      { key: 'vaultSyncS3SecretKey', section: 'vault', type: 'secret' },
      { key: 'vaultSyncProviders', section: 'vault', type: 'list' },
      { key: 'vaultSyncPassphrase', section: 'vault', type: 'secret' },
    ]

    const SECTIONS = [
      { id: 'routing', title: 'policyRouting' },
      { id: 'health', title: 'policyHealth' },
      { id: 'network', title: 'policyNetwork' },
      { id: 'tools', title: 'policyTools' },
      { id: 'alerts', title: 'policyAlerts' },
      { id: 'vault', title: 'policyVault' },
    ]

    const toShown = (field, value) => {
      if (field.scale && typeof value === 'number') return value / field.scale
      return value
    }
    const fromShown = (field, value) => {
      if (field.scale) return Number(value) * field.scale
      return value
    }

    function setField(setDraft, key, value) {
      setDraft((draft) => Object.assign({}, draft, { [key]: value }))
    }

    /** JSON-backed list/object editor: keeps the raw text until it parses. */
    function JsonField(props) {
      const { t, field, value, onCommit } = props
      const [raw, setRaw] = React.useState(() => JSON.stringify(value == null ? [] : value, null, 2))
      const [bad, setBad] = React.useState(false)
      const onChange = (event) => {
        const text = event.target.value
        setRaw(text)
        try {
          const parsed = JSON.parse(text === '' ? '[]' : text)
          setBad(false)
          onCommit(parsed)
        } catch {
          // Keep the invalid text in place so the user can finish typing; the
          // field reports its own state instead of silently discarding input.
          setBad(true)
        }
      }
      return h('div', { className: 'dsub-field' },
        h('label', { className: 'dsub-h', htmlFor: 'dsub-policy-' + field.key }, t(field.key)),
        h('textarea', {
          id: 'dsub-policy-' + field.key,
          className: 'dsub-textarea',
          rows: 3,
          spellCheck: false,
          value: raw,
          onChange,
          'aria-invalid': bad ? 'true' : 'false',
        }),
        h('div', { className: bad ? 'dsub-bad' : 'dsub-sub' }, t(field.key + 'Hint')),
      )
    }

    function Field(props) {
      const { t, field, draft, setDraft } = props
      const value = draft[field.key]
      const commit = (next) => setField(setDraft, field.key, next)

      if (field.type === 'json') {
        return h(JsonField, { t, field, value, onCommit: commit })
      }

      if (field.type === 'bool') {
        return h('div', { className: 'dsub-field' },
          h('label', { className: 'dsub-row', style: { cursor: 'pointer' } },
            h('input', {
              type: 'checkbox',
              checked: value !== false && Boolean(value),
              onChange: (event) => commit(event.target.checked),
            }),
            h('span', null, t(field.key)),
          ),
          h('div', { className: 'dsub-sub' }, t(field.key + 'Hint')),
        )
      }

      const shown = field.type === 'list'
        ? (Array.isArray(value) ? value.join(', ') : '')
        : (toShown(field, value) == null ? '' : String(toShown(field, value)))

      return h('div', { className: 'dsub-field' },
        h('label', { className: 'dsub-h', htmlFor: 'dsub-policy-' + field.key }, t(field.key)),
        h('input', {
          id: 'dsub-policy-' + field.key,
          className: 'dsub-input',
          type: field.type === 'secret' ? 'password' : (field.type === 'number' ? 'number' : 'text'),
          autoComplete: 'off',
          min: field.min,
          max: field.max,
          step: field.step,
          value: shown,
          onChange: (event) => {
            const text = event.target.value
            if (field.type === 'list') {
              commit(text.split(',').map((part) => part.trim()).filter(Boolean))
              return
            }
            if (field.type === 'number') {
              if (text === '') { commit(undefined); return }
              const num = Number(text)
              if (Number.isFinite(num)) commit(fromShown(field, num))
              return
            }
            commit(text)
          },
        }),
        h('div', { className: 'dsub-sub' }, t(field.key + 'Hint')),
      )
    }

    /**
     * Renders one topic of the policy surface. The settings card mounts one
     * instance per tab it belongs to, so each control sits next to the feature it
     * governs instead of in a single wall of fields.
     */
    function PolicyPanel(props) {
      const { t, draft, setDraft, section } = props
      if (!draft) return null
      const meta = SECTIONS.find((entry) => entry.id === section)
      const fields = FIELDS.filter((field) => field.section === section)
      if (!fields.length) return null
      return h('details', { className: 'dsub-group', 'data-pane': section === 'vault' ? 'vault' : (section === 'alerts' ? 'notifications' : (section === 'tools' ? 'models' : 'routing')) },
        h('summary', { className: 'dsub-groupHead' }, t(meta ? meta.title : section)),
        h('div', { className: 'dsub-sub' }, t('policyHint')),
        fields.map((field) => h(Field, { key: field.key, t, field, draft, setDraft })),
      )
    }

    /** Exposed for the schema-vs-UI guard so it cannot drift from the controls. */
    const POLICY_KEYS = FIELDS.map((field) => field.key)

    return { PolicyPanel, POLICY_KEYS }
  },
})
