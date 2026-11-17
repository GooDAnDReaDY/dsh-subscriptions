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

    // #1103: experience modes. The loader hands this chunk only framework
    // modules, so it cannot import `lib/experience-modes.js`; the tables are
    // therefore mirrored here and `test/experience-modes.test.mjs` compares them
    // with the server module, so drift fails the build instead of shipping.
    const MODE_IDS = ['simple', 'balanced', 'power']
    // Locale keys per mode. Kept beside the ids so the picker cannot reference a
    // label the dictionaries do not have; the test checks all six keys exist.
    const MODE_LABELS = {
      simple: { key: 'modeSimple', hintKey: 'modeSimpleHint' },
      balanced: { key: 'modeBalanced', hintKey: 'modeBalancedHint' },
      power: { key: 'modePower', hintKey: 'modePowerHint' },
    }
    const MODE_TABLES = {
      simple: {
        core: [
          'switchAtRemaining', 'autoPacing', 'promptCacheTtlMinutes', 'hideDeprecatedModels',
          'privacyMask', 'enableToasts', 'alertThresholds', 'composerQuota', 'showSubsPill',
        ],
        advanced: [],
      },
      balanced: {
        core: [
          'switchAtRemaining', 'autoPacing', 'drainBeforeReset', 'drainSafetyPercent',
          'promptCacheTtlMinutes', 'refreshAheadMs', 'refreshRetryMs', 'warmupAt',
          'leaseEnabled', 'leaseTtlMs', 'proxyPool', 'proxyPoolCooldownMs',
          'alertThresholds', 'enableToasts', 'privacyMask',
        ],
        advanced: [
          'proactiveGuard', 'proactiveMinRemaining', 'selfHealIntervalMin', 'scheduleRules',
          'routingPresets', 'nativeTools', 'codexWebSearch',
        ],
      },
      power: { core: [], advanced: [], showAll: true },
    }

    function normalizeMode(value) {
      const mode = String(value || '').trim().toLowerCase()
      return MODE_IDS.indexOf(mode) !== -1 ? mode : 'balanced'
    }

    function modeSurface(mode) {
      const id = normalizeMode(mode)
      if (id === 'power') return { mode: 'power', showAll: true, keys: [], advanced: [] }
      const spec = MODE_TABLES[id]
      return { mode: id, showAll: false, keys: spec.core.slice(), advanced: spec.advanced.slice() }
    }

    function modeIncludes(mode, key) {
      const surface = modeSurface(mode)
      if (surface.showAll) return true
      return surface.keys.indexOf(key) !== -1 || surface.advanced.indexOf(key) !== -1
    }

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
     *
     * #1103: `mode` decides which fields are presented first. It is purely a
     * view: a field the mode hides keeps its stored value, and the summary line
     * says how many are held back so the count is never a mystery.
     */
    function PolicyPanel(props) {
      const { t, draft, setDraft, section, mode } = props
      if (!draft) return null
      const meta = SECTIONS.find((entry) => entry.id === section)
      const all = FIELDS.filter((field) => field.section === section)
      if (!all.length) return null

      const surface = modeSurface(mode)
      const visible = surface.showAll ? all : all.filter((field) => modeIncludes(surface.mode, field.key))
      const hiddenCount = all.length - visible.length
      if (!visible.length) {
        // Nothing in this topic belongs to the current mode: say so instead of
        // rendering an empty group that looks broken.
        return h('div', { className: 'dsub-sub' },
          t(meta ? meta.title : section) + ': ' + hiddenCount + ' ' + t('modeHiddenCount'))
      }

      return h('details', { className: 'dsub-group', 'data-pane': section === 'vault' ? 'vault' : (section === 'alerts' ? 'notifications' : (section === 'tools' ? 'models' : 'routing')) },
        h('summary', { className: 'dsub-groupHead' }, t(meta ? meta.title : section)),
        h('div', { className: 'dsub-sub' }, t('policyHint')),
        hiddenCount > 0
          ? h('div', { className: 'dsub-sub', style: { opacity: 0.75 } },
            hiddenCount + ' ' + t('modeHiddenCount') + ' · ' + t('modeSwitchHint'))
          : null,
        visible.map((field) => h(Field, { key: field.key, t, field, draft, setDraft })),
      )
    }

    /**
     * The mode selector. Sits once in the card, above the policy groups, and
     * writes only `experienceMode` — it never touches the settings it reveals.
     */
    function ModePicker(props) {
      const { t, draft, setDraft } = props
      if (!draft) return null
      const current = normalizeMode(draft.experienceMode)
      return h('div', { className: 'dsub-group', 'data-pane': 'routing' },
        h('div', { className: 'dsub-groupHead' }, t('modeTitle')),
        h('div', { className: 'dsub-sub' }, t('modeHint')),
        h('div', { className: 'dsub-row', style: { marginTop: 8 } },
          h('select', {
            className: 'dsub-select',
            value: current,
            'aria-label': t('modeTitle'),
            onChange: (event) => setDraft((d) => Object.assign({}, d, { experienceMode: event.target.value })),
          },
            MODE_IDS.map((id) => h('option', { key: id, value: id }, t(MODE_LABELS[id].key))),
          ),
        ),
        h('div', { className: 'dsub-sub', style: { marginTop: 6 } }, t(MODE_LABELS[current].hintKey)),
      )
    }

    /** Exposed for the schema-vs-UI guard so it cannot drift from the controls. */
    const POLICY_KEYS = FIELDS.map((field) => field.key)

    return { PolicyPanel, ModePicker, POLICY_KEYS }
  },
})
