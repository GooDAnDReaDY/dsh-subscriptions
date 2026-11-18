/* global window */
// #623: the accounts pane — the 740-line block that renders every provider's
// slot list inside the settings card. It was a single IIFE at the bottom of
// SubsSection, reading 44 names out of that component's closure, which made it
// impossible to render or test on its own.
//
// It owns no hooks, so it moves to a component without changing any behaviour:
// the caller passes one `scope` object and the pane destructures it, so every
// dependency is now a name you can see instead of a free variable.
window.__ModuleLoader__.load({
  id: '@goodandready/dsh-subscriptions',
  chunk: 'client.accounts.js',
  factory: (require) => {
    const React = require('react')

    /**
     * Build the accounts pane with host helpers injected.
     *
     * @param {object} deps
     * @param {Function} deps.h                  createElement with portal handling
     * @param {Function} deps.safeExternalUrl     sanitises links before render
     * @param {Function} deps.copyText            clipboard helper
     * @param {Function} deps.ResetCountdown      countdown component
     * @param {Function} deps.ResetCreditsPanel   credits panel component
     * @param {Function} deps.normalizePlanBadge  plan label normaliser
     * @param {Function} deps.barTone             quota bar colour
     * @param {Function} deps.formatRelativeReset readable reset time
     * @param {Function} deps.badgeFor            status badge for an account
     * @param {Function} deps.cleanErrorMessage   strips transport noise from messages
     */
    function createAccountsPane(deps) {
      const h = deps.h
      const safeExternalUrl = deps.safeExternalUrl
      const copyText = deps.copyText
      const ResetCountdown = deps.ResetCountdown
      const ResetCreditsPanel = deps.ResetCreditsPanel
      const normalizePlanBadge = deps.normalizePlanBadge
      const barTone = deps.barTone
      const formatRelativeReset = deps.formatRelativeReset
      const badgeFor = deps.badgeFor
      const cleanErrorMessage = deps.cleanErrorMessage

      /**
       * One provider's row list, with its own check/connect actions.
       *
       * @param {object} props
       * @param {Function} props.t      translator for the plugin namespace
       * @param {object} props.scope    state and actions from SubsSection
       */
      function AccountsPane(props) {
        const t = props.t
        const {
          accountOf,
          addSlot,
          batch,
          cancelBatch,
          checkRes,
          checking,
          complete,
          connect,
          copiedSsh,
          device,
          deviceStartLogin,
          doCheck,
          doParkQuarantine,
          doPing,
          doProbeQuarantine,
          doProxyCheck,
          doSyncModels,
          headlessInfo,
          importLocalCli,
          importToken,
          later,
          loginLinks,
          logout,
          modelsCatalog,
          moveSlot,
          names,
          newProviders,
          openHelp,
          paste,
          poolModelQuery,
          proxyRes,
          reload,
          reset,
          resetConsume,
          resetPrepare,
          runBatch,
          runWizard,
          savingsReport,
          setCopiedSsh,
          setErr,
          setOpenHelp,
          setPaste,
          setPoolModelQuery,
          setReset,
          setSlots,
          setTokenDraft,
          slots,
          switchOrg,
          telemetry,
          tokenDraft,
          updateSlot,
        } = props.scope

            const configuredSlot = (slot) => {
              const account = accountOf(slot.provider, slot.index)
              return !!((account && (account.configured || account.hasToken))
                || slot.label || slot.proxyUrl || slot.expiresAt
                || (Array.isArray(slot.tags) && slot.tags.length) || slot.vipOnly || slot.isPro || slot.weight)
            }
            const visibleNames = names.filter((prov) => newProviders.includes(prov.id)
              || slots.some((slot) => slot.provider === prov.id && configuredSlot(slot)))
            return h('div', { className: 'dsub-accountsPane', 'data-pane': 'accounts' },
              visibleNames.map((prov) => {
            const rows = slots
              .map((slot, i) => ({ slot: slot, i: i }))
              .filter((row) => row.slot.provider === prov.id)
            return h('div', { className: 'dsub-block', key: prov.id },
              h('div', { className: 'dsub-h', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, flexWrap: 'wrap' } },
                h('span', null, prov.name),
                h('div', { className: 'dsub-row', style: { marginTop: 0, gap: 4, flexWrap: 'wrap' } },
                  h('button', { type: 'button', className: 'dsub-mini', disabled: Boolean(batch), onClick: () => runBatch('check', prov.id).catch((e) => setErr(cleanErrorMessage(e.message || e))) }, t('checkAllAccounts')),
                  // #968: refresh quotas through the heartbeat instead of repeating
                  // the same per-account check twice.
                  h('button', { type: 'button', className: 'dsub-mini', disabled: Boolean(batch), onClick: () => {
                    fetch('/dsh-subscriptions/heartbeat/run', { method: 'POST' })
                      .then(() => reload())
                      .catch((e) => setErr(cleanErrorMessage(e.message || e)))
                  } }, t('refreshAllQuotas')),
                  h('button', { type: 'button', className: 'dsub-mini', disabled: Boolean(batch), onClick: () => runBatch('import', prov.id).catch((e) => setErr(cleanErrorMessage(e.message || e))) }, t('importAllCli')),
                  batch && batch.provider === prov.id ? h(React.Fragment, null,
                    h('span', { className: 'dsub-sub' }, t('batchProgress').replace('{done}', String(batch.done)).replace('{total}', String(batch.total))),
                    h('button', { type: 'button', className: 'dsub-mini', onClick: cancelBatch }, t('cancel'))
                  ) : null,
                ),
              ),
              rows.map((row) => {
                const account = accountOf(row.slot.provider, row.slot.index)
                const key = row.slot.provider + ':' + row.slot.index
                const rowPosition = rows.findIndex((candidate) => candidate.i === row.i)
                const on = !!account.configured
                const poolEnabled = row.slot.poolEnabled !== false
                const poolModels = Array.isArray(row.slot.poolModels) ? row.slot.poolModels : null
                const modelIdOf = (m) => (typeof m === 'string' ? m : (m && (m.id || m.slug || m.name)))
                const poolModelIds = Array.from(new Set(
                  (Array.isArray(modelsCatalog) ? modelsCatalog : [])
                    .filter((m) => m && m.provider === row.slot.provider)
                    .map((m) => modelIdOf(m))
                    .concat(Array.isArray(account.availableModels) ? account.availableModels.map(modelIdOf) : [])
                    .concat(poolModels || [])
                    .filter(Boolean)
                )).sort()
                const poolQuery = String(poolModelQuery[key] || '').trim().toLowerCase()
                const visiblePoolModelIds = poolQuery
                  ? poolModelIds.filter((id) => String(id).toLowerCase().includes(poolQuery))
                  : poolModelIds
                const selectedPoolCount = poolModels ? poolModels.length : poolModelIds.length
                const poolModeLabel = !poolModels
                  ? t('poolModelsAutomatic')
                  : (poolModels.length ? (poolModels.length + ' ' + t('poolModelsSelected')) : t('poolModelsNone'))
                const avatarSrc = safeExternalUrl(account.avatarUrl, true)
                const avatarEl = (avatarSrc ? h('img', {
                  src: avatarSrc,
                  alt: account.email || account.label || 'Avatar',
                  className: 'dsub-avatar',
                  onError: (e) => { e.target.style.display = 'none' },
                }) : (account.email ? h('span', {
                  className: 'dsub-avatar dsub-avatar-initials',
                  title: account.email,
                }, (account.email.charAt(0) || '?').toUpperCase()) : null))
                return h('div', { className: 'dsub-card', key: key },
                  h('div', { className: 'dsub-row', style: { alignItems: 'center' } },
                    avatarEl,
                    h('label', { className: 'dsub-ref-tag', title: t('defaultAccountHint') },
                      h('input', {
                        type: 'checkbox',
                        checked: !!row.slot.isDefault,
                        onChange: (e) => updateSlot(row.slot.provider, row.slot.index, { isDefault: e.target.checked }),
                      }),
                      ' ★'
                    ),
                    h('input', {
                      className: 'dsub-grow',
                      value: row.slot.label || '',
                      placeholder: account.email || account.label || (t('accountLabel') + ' ' + row.slot.index),
                      onChange: (e) => {
                        updateSlot(row.slot.provider, row.slot.index, { label: e.target.value })
                      },
                    }),
                    h('span', { className: 'dsub-badge' + (account.isRevoked ? ' dsub-badge-bad' : (account.validationUrl ? ' dsub-badge-warn' : (on ? ' dsub-badge-on' : ''))) }, badgeFor(account, t)),
                    account.capabilities && account.capabilities.vision ? h('span', { className: 'dsub-model-tag', title: 'Vision' }, '👁') : null,
                    account.capabilities && account.capabilities.tools ? h('span', { className: 'dsub-model-tag', title: 'Tools' }, '🔧') : null,
                    account.capabilities && account.capabilities.thinking ? h('span', { className: 'dsub-model-tag', title: 'Thinking' }, '🧠') : null,
                    normalizePlanBadge(row.slot.provider, account.plan || account.paidTierName || (account.quota && account.quota.plan)),
                    h('button', {
                      type: 'button', className: 'dsub-mini',
                      onClick: () => connect(row.slot.provider, row.slot.index).catch((e) => setErr(cleanErrorMessage(e.message || e))),
                    }, on ? t('reconnect') : t('connect')),
                    ((row.slot.provider === 'codex' || row.slot.provider === 'copilot' || row.slot.provider === 'grok') ? h('button', {
                      type: 'button', className: 'dsub-mini',
                      onClick: () => deviceStartLogin(row.slot.provider, row.slot.index).catch((e) => setErr(cleanErrorMessage(e.message || e))),
                    }, t('deviceLogin')) : null),
                    h('button', {
                      type: 'button', className: 'dsub-mini',
                      disabled: !on,
                      onClick: () => logout(row.slot.provider, row.slot.index).catch((e) => setErr(cleanErrorMessage(e.message || e))),
                    }, t('disconnect')),
                    h('button', {
                      type: 'button', className: 'dsub-mini',
                      disabled: checking[key],
                      title: t('smokeDesc'),
                      onClick: () => doCheck(row.slot.provider, row.slot.index).catch((e) => setErr(cleanErrorMessage(e.message || e))),
                    }, checking[key] ? t('checking') : ('⚡ ' + t('testConnection'))),
                    (function(){
                      var r = checkRes[key];
                      if (!r) return null;
                      var cls = r.ok ? 'dsub-badge-ok' : 'dsub-badge-bad';
                      var txt = r.ok ? ('✓ ' + (r.latencyMs != null ? r.latencyMs + 'ms' : 'OK')) : ('✗ ' + ((r.error && (r.error.code || r.error.message)) || 'FAIL'));
                      return h('span', { className: 'dsub-badge ' + cls, style: { marginLeft: 4 }, title: r.ok ? t('testConnectionSuccess') : ((r.error && r.error.message) || 'fail') }, txt);
                    })(),
                    (account && account.lastPingMs != null ? (function(){
                      var ms = account.lastPingMs;
                      var grade = account.latencyGrade || (ms < 250 ? 'good' : (ms < 750 ? 'fair' : 'poor'));
                      var cls = grade === 'good' ? 'dsub-badge-ok' : (grade === 'fair' ? 'dsub-badge-warn' : 'dsub-badge-bad');
                      return h('span', {
                        className: 'dsub-badge ' + cls,
                        style: { marginLeft: 4, cursor: 'pointer' },
                        title: 'Latency: ' + ms + 'ms (' + grade + '). Click to test.',
                        onClick: () => doPing(row.slot.provider, row.slot.index),
                      }, '📶 ' + ms + 'ms');
                    })() : null),
                    h('button', {
                      type: 'button',
                      className: 'dsub-mini',
                      title: t('syncModelsTitle'),
                      onClick: () => doSyncModels(row.slot.provider, row.slot.index),
                    }, '🔄 ' + t('syncModels')),
                    h('button', {
                      type: 'button', className: 'dsub-mini',
                      title: t('wizardTitle'),
                      onClick: () => runWizard(row.slot.provider, row.slot.index, row.slot.ref, false),
                    }, '🩺 ' + t('wizardButton')),
                    (account && account.quarantineUntil && Number(account.quarantineUntil) > Date.now() ? h(React.Fragment, null,
                      h('button', {
                        type: 'button', className: 'dsub-mini', title: t('probeWarmupTitle'),
                        disabled: checking[key],
                        onClick: () => doProbeQuarantine(row.slot.provider, row.slot.index, false),
                      }, checking[key] ? t('checking') : ('🔄 ' + t('probeWarmupNow'))),
                      h('button', {
                        type: 'button', className: 'dsub-mini', title: t('releaseQuarantineTitle'),
                        disabled: checking[key],
                        onClick: () => doProbeQuarantine(row.slot.provider, row.slot.index, true),
                      }, ('✕ ' + t('releaseQuarantine'))),
                    ) : (on ? h('button', {
                      type: 'button', className: 'dsub-mini', title: t('quarantineParkTitle'),
                      onClick: () => doParkQuarantine(row.slot.provider, row.slot.index, 3600000),
                    }, ('⏸ ' + t('quarantinePark'))) : null)),
                    h('button', {
                      type: 'button', className: 'dsub-mini', title: t('moveUp'),
                      disabled: rowPosition <= 0,
                      onClick: () => moveSlot(row.slot.provider, row.slot.index, -1),
                    }, '↑'),
                    h('button', {
                      type: 'button', className: 'dsub-mini', title: t('moveDown'),
                      disabled: rowPosition < 0 || rowPosition >= rows.length - 1,
                      onClick: () => moveSlot(row.slot.provider, row.slot.index, 1),
                    }, '↓'),
                    h('button', {
                      type: 'button', className: 'dsub-mini', title: t('copyRef'),
                      onClick: () => copyText(row.slot.ref || key),
                    }, '📋'),
                    h('button', {
                      type: 'button', className: 'dsub-mini', title: t('removeSlot'),
                      onClick: () => {
                        const slot = row.slot
                        Promise.resolve(on ? logout(slot.provider, slot.index) : null)
                          .then(() => setSlots((prev) => prev.filter((s) => !(s && s.provider === slot.provider && Number(s.index) === Number(slot.index)))))
                          .catch((e) => setErr(cleanErrorMessage(e.message || e)))
                      },
                    }, '\u00d7'),
                  ),
                  (account && (account.quota?.remainingPercent != null || account.usagePercent != null)) ? h('div', { className: 'dsub-sub', style: { marginTop: 4 } },
                    '📊 ' + t('usageRemaining') + ' ' + Math.round(account.quota?.remainingPercent != null ? Number(account.quota.remainingPercent) : (100 - Number(account.usagePercent))) + '%'
                  ) : null,
                  (function() {
                    const accSavings = savingsReport && savingsReport.byAccount && savingsReport.byAccount[row.slot.ref]
                    if (!accSavings) return null
                    return h('div', { className: 'dsub-row', style: { marginTop: 4, gap: 6, fontSize: '11px' } },
                      h('span', { className: 'dsub-pillTag', style: { background: 'color-mix(in srgb,var(--dsw-alias-brand-primary) 15%,transparent)', color: 'var(--dsw-alias-brand-primary)' } },
                        '💰 ' + t('deliveredValue') + ': $' + accSavings.equivalentCost.toFixed(2) + (accSavings.roiLabel !== 'n/a' ? ' (' + accSavings.roiLabel + ' ROI)' : '')
                      ),
                      accSavings.cacheSavingsCost > 0 ? h('span', { className: 'dsub-pillTag', style: { background: 'color-mix(in srgb,var(--dsw-alias-state-success-primary) 15%,transparent)', color: 'var(--dsw-alias-state-success-primary)' } },
                        '⚡ ' + t('cacheSavings') + ': $' + accSavings.cacheSavingsCost.toFixed(2)
                      ) : null,
                    )
                  })(),
                  (account && account.quarantineUntil && Number(account.quarantineUntil) > Date.now()) ? h('div', { className: 'dsub-row', style: { marginTop: 4 } },
                    h('span', { className: 'dsub-sub', style: { color: 'var(--dsw-alias-state-error-primary)', fontVariantNumeric: 'tabular-nums' } },
                      '⛔ ' + (account.quarantineReason || 'QUARANTINE') + ' · ' + t('resetsIn') + ' ' + formatRelativeReset(account.quarantineUntil, t('lang'), Date.now())
                    ),
                  ) : (account && (account.resetAt || (account.quota && account.quota.resetAt)) && Number(account.resetAt || account.quota.resetAt) > Date.now()) ? h('div', { className: 'dsub-row', style: { marginTop: 4 } },
                    h(ResetCountdown, { resetAt: account.resetAt || account.quota.resetAt }),
                  ) : null,
                  h('div', { className: 'dsub-manual' },
                    h('span', { className: 'dsub-sub' }, t('manualTitle')),
                  h('div', { className: 'dsub-row' },
                    h('input', {
                      className: 'dsub-grow',
                      value: paste[key] || '',
                      placeholder: t('pastePlaceholder'),
                      onChange: (e) => setPaste((p) => Object.assign({}, p, { [key]: e.target.value })),
                    }),
                    h('button', {
                      type: 'button', className: 'dsub-mini',
                      onClick: () => complete(row.slot.provider, row.slot.index).catch((e) => setErr(cleanErrorMessage(e.message || e))),
                    }, t('submitCode')),
                  ),
                  (headlessInfo[key] ? h('div', {
                    className: 'dsub-panel-box',
                    style: { marginTop: 6, padding: '8px 12px', background: 'var(--dsw-alias-bg-layer-2)' }
                  },
                    h('div', { style: { fontWeight: 600, fontSize: '11px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
                      h('span', null, '🌐 ' + t('headlessTip')),
                      h('button', {
                        type: 'button',
                        className: 'dsub-mini',
                        onClick: () => {
                          copyText(headlessInfo[key].sshTunnelCommand).then((ok) => {
                            if (!ok) return
                            setCopiedSsh((m) => Object.assign({}, m, { [key]: true }))
                            later(() => setCopiedSsh((m) => Object.assign({}, m, { [key]: false })), 2000)
                          })
                        }
                      }, copiedSsh[key] ? ('✓ ' + t('headlessCopied')) : ('📋 ' + t('headlessCopySsh')))
                    ),
                    h('div', { style: { fontFamily: 'monospace', fontSize: '11px', margin: '4px 0', wordBreak: 'break-all' } },
                      headlessInfo[key].sshTunnelCommand
                    ),
                    safeExternalUrl(headlessInfo[key].svgDataUrl, true) ? h('div', { style: { marginTop: 6, textAlign: 'center' } },
                      h('div', { className: 'dsub-sub', style: { marginBottom: 4 } }, t('headlessScanQr')),
                      h('img', {
                        src: safeExternalUrl(headlessInfo[key].svgDataUrl, true),
                        alt: 'QR Code',
                        style: { width: '130px', height: '130px', borderRadius: '4px', background: '#fff', padding: '4px' }
                      })
                    ) : null
                  ) : null),
                  h('div', { className: 'dsub-row', style: { justifyContent: 'space-between' } },
                    h('button', {
                      type: 'button',
                      className: 'dsub-mini',
                      title: t('importLocalCliTitle'),
                      style: { display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 },
                      onClick: () => importLocalCli(row.slot.provider, row.slot.index).catch((e) => setErr(cleanErrorMessage(e.message || e))),
                    }, t('importLocalCli')),
                    h('button', {
                      type: 'button',
                      className: 'dsub-mini' + (openHelp[key] ? ' dsub-btnActive' : ''),
                      title: t('howToGetTokenTitle'),
                      onClick: (e) => { if (e) { e.preventDefault(); e.stopPropagation(); } setOpenHelp((h) => Object.assign({}, h, { [key]: !h[key] })); },
                    }, t('howToGetToken')),
                  ),
                  h('div', { className: 'dsub-row' },
                    h('input', {
                      className: 'dsub-grow',
                      value: tokenDraft[key] || '',
                      placeholder: t('importTokenPlace'),
                      onChange: (e) => setTokenDraft((d) => Object.assign({}, d, { [key]: e.target.value })),
                    }),
                    h('button', {
                      type: 'button', className: 'dsub-mini',
                      title: t('importToken'),
                      onClick: () => importToken(row.slot.provider, row.slot.index).catch((e) => setErr(cleanErrorMessage(e.message || e))),
                    }, t('importToken')),
                  ),
                  (account && account.lastDoctorVerdict ? (function(){
                    var doc = account.lastDoctorVerdict;
                    return h('div', {
                      className: 'dsub-helpBox',
                      style: {
                        marginTop: 6,
                        padding: '8px 12px',
                        borderLeft: '3px solid var(--dsw-alias-brand-primary)',
                        background: 'var(--dsw-alias-bg-layer-2)',
                      },
                    },
                      h('div', { style: { fontWeight: 600, color: 'var(--dsw-alias-label-primary)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 } },
                        '🩺 ' + doc.title
                      ),
                      h('div', { style: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)', marginBottom: 4 } }, doc.details),
                      h('div', { style: { fontSize: 12, color: 'var(--dsw-alias-brand-primary)', fontWeight: 500 } },
                        '💡 ' + (t('recommendation') || 'Recommendation') + ': ' + doc.recommendation
                      )
                    );
                  })() : null),
                  (openHelp[key] ? (function renderInlineHelp(){
                    const prov = row.slot.provider;
                    const info = {
                      title: prov,
                      stepsZh: ['请在上方输入框中粘贴令牌或 API Key 并点击“保存令牌”。'],
                      stepsEn: ['Paste your token or API key into the field above and click "Save token".'],
                    };
                    const isZh = t('lang') === 'zh';
                    const steps = (isZh && info.stepsZh) ? info.stepsZh : (info.stepsEn || []);
                    return h('div', { className: 'dsub-helpBox' },
                      h('div', { className: 'dsub-helpHead' },
                        h('span', null, 'ℹ️ ' + info.title + ' — ' + t('instructionsTitle')),
                        h('button', {
                          type: 'button', className: 'dsub-mini',
                          style: { padding: '1px 6px', fontSize: 11 },
                          onClick: (e) => {
                            if (e) { e.preventDefault(); e.stopPropagation(); }
                            setOpenHelp((h) => Object.assign({}, h, { [key]: false }));
                          },
                        }, '✕')
                      ),
                      steps.map((st, i) => h('div', { key: i, className: 'dsub-helpStep' }, st))
                    );
                  })() : null),
                  h('div', { className: 'dsub-row' },
                    h('input', {
                      className: 'dsub-grow',
                      value: row.slot.proxyUrl || '',
                      placeholder: t('proxyPlaceholder'),
                      onChange: (e) => {
                        updateSlot(row.slot.provider, row.slot.index, { proxyUrl: e.target.value })
                      },
                    }),
                    h('input', {
                      className: 'dsub-grow',
                      value: (Array.isArray(row.slot.proxyBypass) ? row.slot.proxyBypass : []).join(','),
                      placeholder: t('proxyBypassPlaceholder'),
                      onChange: (e) => {
                        updateSlot(row.slot.provider, row.slot.index, {
                          proxyBypass: e.target.value.split(',').map((host) => host.trim()).filter(Boolean),
                        })
                      },
                    }),
                    h('button', {
                      type: 'button', className: 'dsub-mini',
                      disabled: checking['proxy:' + key],
                      onClick: () => doProxyCheck(row.slot.provider, row.slot.index).catch((e) => setErr(cleanErrorMessage(e.message || e))),
                    }, checking['proxy:' + key] ? '\u2026' : t('proxyCheck')),
                    h('span', {
                      style: { fontSize: '11px', color: 'var(--dsw-alias-label-secondary)', display: 'inline-flex', alignItems: 'center', gap: '3px' },
                      title: t('maxConcurrencySlotTitle')
                    },
                      '⚡',
                      h('input', {
                        type: 'number',
                        min: 1,
                        max: 20,
                        style: { width: '44px', padding: '1px 4px', fontSize: '11px', textAlign: 'center' },
                        value: row.slot.maxConcurrency !== undefined ? row.slot.maxConcurrency : 1,
                        title: t('maxConcurrencySlotTitle'),
                        onChange: (e) => {
                          const val = parseInt(e.target.value, 10)
                          updateSlot(row.slot.provider, row.slot.index, { maxConcurrency: isNaN(val) ? 1 : Math.max(1, val) })
                        },
                      })
                    ),
                    h('span', {
                      style: { fontSize: '11px', color: 'var(--dsw-alias-label-secondary)', display: 'inline-flex', alignItems: 'center', gap: '3px' },
                      title: t('monthlyCostSlotTitle')
                    },
                      '💰',
                      h('input', {
                        type: 'number',
                        min: 0,
                        step: 0.01,
                        style: { width: '56px', padding: '1px 4px', fontSize: '11px', textAlign: 'center' },
                        value: row.slot.monthlyCost !== undefined && row.slot.monthlyCost !== null ? row.slot.monthlyCost : 20,
                        title: t('monthlyCostSlotTitle'),
                        onChange: (e) => {
                          const val = parseFloat(e.target.value)
                          updateSlot(row.slot.provider, row.slot.index, { monthlyCost: isNaN(val) ? 20 : Math.max(0, val) })
                        },
                      })
                    ),
                    h('details', { className: 'dsub-details' },
                      h('summary', { className: 'dsub-summary' }, t('slotAdvanced')),
                      h('div', { className: 'dsub-row' },
                        h('label', { className: 'dsub-ref-tag', title: t('vipOnlyHint') },
                          h('input', {
                            type: 'checkbox',
                            checked: !!row.slot.vipOnly,
                            onChange: (e) => updateSlot(row.slot.provider, row.slot.index, { vipOnly: e.target.checked }),
                          }),
                          ' ' + t('vipOnly')
                        ),
                        h('label', { className: 'dsub-ref-tag', title: t('isProHint') },
                          h('input', {
                            type: 'checkbox',
                            checked: !!row.slot.isPro,
                            onChange: (e) => updateSlot(row.slot.provider, row.slot.index, { isPro: e.target.checked }),
                          }),
                          ' ' + t('isPro')
                        ),
                        h('label', { className: 'dsub-ref-tag', title: t('poolEnabledHint') },
                          h('input', {
                            type: 'checkbox',
                            checked: poolEnabled,
                            onChange: (e) => updateSlot(row.slot.provider, row.slot.index, { poolEnabled: e.target.checked }),
                          }),
                          ' ' + t('poolEnabledSlot')
                        ),
                      ),
                      h('details', { className: 'dsub-details' },
                        h('summary', { className: 'dsub-summary' },
                          '🎯 ' + t('poolModelsTitle') + ' · ' + poolModeLabel
                        ),
                        h('div', { className: 'dsub-sub' }, t('poolModelsHint')),
                        h('div', { className: 'dsub-row' },
                          h('input', {
                            className: 'dsub-inp dsub-grow',
                            value: poolModelQuery[key] || '',
                            placeholder: t('poolModelsSearch'),
                            'aria-label': t('poolModelsSearch'),
                            onChange: (e) => setPoolModelQuery((q) => Object.assign({}, q, { [key]: e.target.value })),
                          }),
                        ),
                        h('div', { className: 'dsub-sub' },
                          t('poolModelsCount')
                            .replace('{shown}', String(visiblePoolModelIds.length))
                            .replace('{selected}', String(selectedPoolCount))
                            .replace('{total}', String(poolModelIds.length))
                        ),
                        h('div', { className: 'dsub-row' },
                          h('button', {
                            type: 'button', className: 'dsub-mini' + (!poolModels ? ' dsub-btnActive' : ''),
                            onClick: () => updateSlot(row.slot.provider, row.slot.index, { poolModels: undefined }),
                          }, t('poolModelsAutomatic')),
                          h('button', {
                            type: 'button', className: 'dsub-mini',
                            onClick: () => updateSlot(row.slot.provider, row.slot.index, { poolModels: visiblePoolModelIds.slice() }),
                          }, t('poolModelsAll')),
                          h('button', {
                            type: 'button', className: 'dsub-mini' + (poolModels && poolModels.length === 0 ? ' dsub-btnActive' : ''),
                            onClick: () => {
                              const base = poolModels || poolModelIds
                              updateSlot(row.slot.provider, row.slot.index, {
                                poolModels: base.filter((id) => !visiblePoolModelIds.includes(id)),
                              })
                            },
                          }, t('poolModelsNone')),
                        ),
                        visiblePoolModelIds.length ? h('div', { className: 'dsub-row', style: { flexWrap: 'wrap', gap: 6 } },
                          visiblePoolModelIds.map((modelId) => {
                            const checked = poolModels ? poolModels.includes(modelId) : true
                            return h('label', { key: modelId, className: 'dsub-ref-tag', title: modelId },
                              h('input', {
                                type: 'checkbox',
                                checked,
                                onChange: () => {
                                  let next
                                  if (poolModels) {
                                    next = checked
                                      ? poolModels.filter((id) => id !== modelId)
                                      : poolModels.concat([modelId])
                                  } else {
                                    next = poolModelIds.filter((id) => id !== modelId)
                                  }
                                  updateSlot(row.slot.provider, row.slot.index, { poolModels: next })
                                },
                              }),
                              ' ',
                              h('code', null, modelId)
                            )
                          })
                        ) : h('div', { className: 'dsub-sub' }, poolModelIds.length ? t('poolModelsNoMatches') : t('poolModelsNoCatalog')),
                      ),
                      h('div', { className: 'dsub-row' },
                        h('span', { className: 'dsub-ref-tag' }, t('tags')),
                        h('input', {
                          className: 'dsub-inp',
                          style: { width: '160px', minWidth: '160px' },
                          value: (Array.isArray(row.slot.tags) ? row.slot.tags : []).join(','),
                          placeholder: t('tagsPlaceholder'),
                          onChange: (e) => updateSlot(row.slot.provider, row.slot.index, {
                            tags: e.target.value.split(',').map((value) => value.trim()).filter(Boolean),
                          }),
                        }),
                        h('span', { className: 'dsub-ref-tag' }, t('weight')),
                        h('input', {
                          type: 'number', min: 0, max: 100,
                          style: { width: '52px', padding: '1px 4px', fontSize: '11px', textAlign: 'center' },
                          value: row.slot.weight !== undefined ? row.slot.weight : 0,
                          onChange: (e) => {
                            const value = parseInt(e.target.value, 10)
                            updateSlot(row.slot.provider, row.slot.index, { weight: isNaN(value) ? 0 : Math.max(0, value) })
                          },
                        }),
                        h('span', { className: 'dsub-ref-tag' }, t('maxQueueSizeSlot')),
                        h('input', {
                          type: 'number', min: 0, max: 1000,
                          style: { width: '58px', padding: '1px 4px', fontSize: '11px', textAlign: 'center' },
                          value: row.slot.maxQueueSize !== undefined ? row.slot.maxQueueSize : 0,
                          onChange: (e) => {
                            const value = parseInt(e.target.value, 10)
                            updateSlot(row.slot.provider, row.slot.index, { maxQueueSize: isNaN(value) ? 0 : Math.max(0, value) })
                          },
                        }),
                      ),
                    ),
                  ),
                  (function(){
                    var r = proxyRes[key]
                    if (!r) return null
                    var txt = r.ok ? (t('proxyOk') + ' ' + r.latencyMs + 'ms' + (r.viaProxy ? '' : ' (direct)')) : (t('proxyFail') + ': ' + ((r.error && r.error.message) || ''))
                    return h('div', { className: r.ok ? 'dsub-ok' : 'dsub-bad' }, txt)
                  })(),
                  ),
                  (function devicePanel(){
                    var d = device[key]
                    if (!d) return null
                    var txt = d.status === 'authorized' ? t('deviceAuthorized') : (d.status === 'expired' ? t('deviceExpired') : t('devicePending'))
                    var cls = d.status === 'authorized' ? 'dsub-ok' : (d.status === 'expired' ? 'dsub-bad' : 'dsub-verify')
                    return h('div', { className: 'dsub-verify' },
                      h('div', { className: cls }, txt),
                      d.status === 'pending' ? h(React.Fragment, null,
                        h('div', { style: { fontSize: '2em', fontWeight: 700, letterSpacing: '0.15em', margin: '4px 0' } }, d.userCode),
                        h('div', { className: 'dsub-row' },
                          h('button', {
                            type: 'button', className: 'dsub-mini',
                            onClick: () => { copyText(d.userCode) },
                          }, t('deviceCopy')),
                          h('a', { href: safeExternalUrl(d.authUrl) || undefined, target: '_blank', rel: 'noopener noreferrer', className: 'dsub-mini' }, t('verifyLink')),
                        ),
                        h('div', { className: 'dsub-sub' }, t('deviceHint')),
                      ) : null,
                    )
                  })(),
                  (row.slot.provider === 'codex' && on ? h(ResetCreditsPanel, {
                    t,
                    st: reset[key] || { phase: 'idle' },
                    onPrepare: () => resetPrepare(row.slot.provider, row.slot.index, key).catch((e) => setErr(String(e && e.message || e))),
                    onAck: (checked) => setReset((m) => Object.assign({}, m, { [key]: Object.assign({}, m[key], { ack: checked }) })),
                    onConsume: () => resetConsume(key).catch((e) => setErr(String(e && e.message || e))),
                    onCancel: () => setReset((m) => Object.assign({}, m, { [key]: { phase: 'idle' } })),
                  }) : null),
                  account.accountNotice ? h('div', { className: 'dsub-verify' }, account.accountNotice) : null,
                  account.scopeWarning ? h('div', { className: 'dsub-scope-banner' },
                    h('span', { style: { color: 'var(--dsw-alias-state-warn-primary)' } }, '⚠️ ' + t('scopeWarning') + ': ' + account.scopeWarning),
                    h('button', {
                      type: 'button',
                      className: 'dsub-mini',
                      onClick: () => connect(row.slot.provider, row.slot.index).catch((e) => setErr(cleanErrorMessage(e.message || e))),
                    }, '🔄 ' + t('reconnectScope'))
                  ) : null,
                  (account.isRevoked || account.authWarning) ? h('div', { className: 'dsub-bad dsub-row', style: { alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '6px' } },
                    h('span', null, '⛔ ' + (account.authWarning || t('sessionRevokedWarning'))),
                    h('button', {
                      type: 'button',
                      className: 'dsub-mini dsub-btn-primary',
                      onClick: () => connect(row.slot.provider, row.slot.index).catch((e) => setErr(cleanErrorMessage(e.message || e))),
                    }, '🔄 ' + t('reconnectNow'))
                  ) : null,
                  account.refreshError ? h('div', { className: 'dsub-bad dsub-row', style: { alignItems: 'center', justifyContent: 'space-between', gap: '8px' } },
                    h('span', null, t('reconnectRequired') + ': ' + account.refreshError),
                    h('button', {
                      type: 'button',
                      className: 'dsub-mini dsub-btn-primary',
                      onClick: () => connect(row.slot.provider, row.slot.index).catch((e) => setErr(cleanErrorMessage(e.message || e))),
                    }, '🔄 ' + t('reconnectNow'))
                  ) : null,
                  (function(){ var r=checkRes[key]; if(!r) return null; var txt=r.ok ? ('ok ' + (r.email||'')) : ('fail ' + (r.error && r.error.message || '')); var cls=r.ok ? 'dsub-ok' : 'dsub-bad'; var q=r.quota; if(q && q.remaining!=null) txt += ' quota:'+q.remaining+(q.limit!=null?'/'+q.limit:''); return h('div', {className: cls}, txt) })(),
                  loginLinks[key] ? h('div', { className: 'dsub-verify' },
                    h('a', { href: loginLinks[key], target: '_blank', rel: 'noopener noreferrer' }, t('verifyLink'))
                  ) : null,
                  safeExternalUrl(account.validationUrl) ? h('div', { className: 'dsub-verify' },
                    t('verifyPrefix'),
                    h('a', { href: safeExternalUrl(account.validationUrl) || undefined, target: '_blank', rel: 'noopener noreferrer' }, t('verifyLink')),
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
                      var tone = barTone(p)
                      var tagCls = tone.tag
                      var fillBg = tone.color
                      return h('div', { key: label + '#' + pct + '#' + (detail == null ? '' : detail), className: 'dsub-usage-card' },
                        h('div', { className: 'dsub-usage-head' },
                          h('span', null, label),
                          h('span', { className: tagCls }, p + '%')
                        ),
                        h('div', { className: 'dsub-usage-track' },
                          h('div', {
                            className: 'dsub-usage-fill',
                            style: { width: p + '%', background: fillBg }
                          })
                        ),
                        detail ? h('div', { className: 'dsub-usage-meta' }, detail) : null
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
                            if (est > 0) extra = h('span', null, t('forecast') + ' ' + est)
                          }
                          var resetElem = w.resetAt ? h(ResetCountdown, { key: 'reset-' + idx, resetAt: w.resetAt }) : null
                          var extraContent = (resetElem && extra)
                            ? h('span', { className: 'dsub-row', style: { gap: '6px' } }, resetElem, extra)
                            : (resetElem || extra)
                          items.push(renderItem(windowLabel(w), w.usedPercent, extraContent))
                        }
                      })
                    }
                    if (hasQuota) {
                      items.push(renderItem(t('quota'), q.usedPercent, q.resetAt ? h(ResetCountdown, { key: 'reset', resetAt: q.resetAt }) : null))
                    } else if (hasUsagePct) {
                      items.push(renderItem(t('quota'), account.usagePercent, null))
                    }
                    var at = (q && q.measuredAt) || (account.usageAt || 0)
                    var agoStr = null
                    if (at) {
                      var m = Math.round((Date.now() - at) / 60000)
                      if (m >= 1) agoStr = m + 'm ' + (t('lang') === 'zh' ? '前' : 'ago')
                    }
                    return h('div', { className: 'dsub-panel-box' },
                      h('div', { className: 'dsub-panel-title' },
                        h('span', null, '📊 ' + t('usageLimitsTitle')),
                        agoStr ? h('span', { className: 'dsub-sub' }, agoStr) : null
                      ),
                      h('div', { className: 'dsub-usage-grid' }, items)
                    )
                  })(),
                  ((account.email || account.plan || account.paidTierName || account.ref || (telemetry && telemetry.accounts && telemetry.accounts[account.ref])) ? h('div', { className: 'dsub-slot-meta-row' },
                    account.email ? h('span', { className: 'dsub-sub' },
                      h('strong', null, '👤 '),
                      account.email
                    ) : null,
                    (account.plan || account.paidTierName) ? h('span', { className: 'dsub-sub' },
                      h('strong', null, t('plan') + ': '),
                      account.plan || account.paidTierName
                    ) : null,
                    (account.organizations && account.organizations.length > 0) ? h('span', { className: 'dsub-sub', style: { display: 'inline-flex', alignItems: 'center', gap: 4 } },
                      h('strong', null, '🏢 ' + t('workspaceTitle') + ':'),
                      h('select', {
                        className: 'dsub-select',
                        style: { padding: '1px 6px', fontSize: '12px' },
                        value: account.selectedOrgId || '',
                        onChange: (e) => switchOrg(account.provider, account.index, e.target.value),
                      },
                        account.organizations.map((org) => h('option', { key: org.id, value: org.id }, org.name + (org.role ? ' (' + org.role + ')' : '')))
                      )
                    ) : null,
                    (function(){
                      const accTelem = telemetry && telemetry.accounts && telemetry.accounts[account.ref]
                      if (!accTelem) return null
                      const parts = []
                      if (accTelem.avgTtftMs != null) parts.push('TTFT: ' + accTelem.avgTtftMs + 'ms')
                      else if (accTelem.lastTtftMs != null) parts.push('TTFT: ' + accTelem.lastTtftMs + 'ms')
                      if (accTelem.avgTps != null) parts.push(accTelem.avgTps + ' t/s')
                      else if (accTelem.lastTps != null) parts.push(accTelem.lastTps + ' t/s')
                      if (parts.length === 0) return null
                      return h('span', { className: 'dsub-speed-tag', title: t('speedMetricsHint') },
                        '⚡ ' + parts.join(' · ')
                      )
                    })(),
                    (account.activeStreams > 0 || account.queuedStreams > 0) ? h('span', { className: 'dsub-ref-tag', title: t('concurrencyQueueHint') },
                      account.activeStreams > 0 ? ('⚡ ' + account.activeStreams + ' ' + t('activeStreams')) : null,
                      (account.activeStreams > 0 && account.queuedStreams > 0) ? ' · ' : null,
                      account.queuedStreams > 0 ? ('⏳ ' + account.queuedStreams + ' ' + t('queuedStreams')) : null
                    ) : null,
                    account.runwayText ? h('span', {
                      className: 'dsub-ref-tag',
                      style: {
                        color: account.pacingStatus === 'critical' ? 'var(--dsw-alias-state-error-primary)' : (account.pacingStatus === 'elevated' ? 'var(--dsw-alias-state-warn-primary)' : 'var(--dsw-alias-state-success-primary)'),
                      },
                      title: t('pacingRunwayHint')
                    }, '⏱️ ' + t('runwayPrefix') + ': ' + account.runwayText) : null,
                    (account.valueDelivered && account.valueDelivered.equivalentCost > 0) ? h('span', {
                      className: 'dsub-speed-tag',
                      title: t('valueDeliveredHint')
                    }, '📊 ' + account.valueDelivered.formattedCost + ' (' + account.valueDelivered.roiLabel + ' ROI)') : null,
                    (account.billing && account.billing.badgeText) ? h('span', {
                      className: 'dsub-ref-tag',
                      style: { color: 'var(--dsw-alias-state-error-primary)', fontWeight: 600 },
                      title: account.billing.warning || t('billingAlertHint')
                    }, '⚠️ ' + account.billing.badgeText) : null,
                    (!account.billing?.badgeText && account.renewalCountdown) ? h('span', {
                      className: 'dsub-ref-tag',
                      title: t('renewalHint')
                    }, '📅 ' + account.renewalCountdown) : null,
                    (account.capabilities && Array.isArray(account.capabilities.tags) && account.capabilities.tags.length > 0) ? h('span', {
                      className: 'dsub-ref-tag',
                      title: t('capabilitiesHint')
                    }, '⚡ ' + account.capabilities.tags.join(' · ')) : null,
                    account.isEncryptedAtRest ? h('span', { className: 'dsub-ref-tag', title: t('atRestEncryptedTitle') },
                      '🔒 ' + t('atRestEncrypted')
                    ) : null,
                    account.ref ? h('span', { className: 'dsub-ref-tag' },
                      h('span', null, t('storedAs')),
                      h('code', null, account.ref)
                    ) : null
                  ) : null),
                )
              }),
              h('button', {
                type: 'button', className: 'dsub-mini', title: t('connectAnotherHint'),
                'aria-label': t('connectAnother'),
                onClick: async () => {
                  try {
                    const res = await fetch('/dsh-subscriptions/accounts/next-slot', {
                      method: 'POST',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({ provider: prov.id }),
                    })
                    const data = await res.json().catch(() => ({}))
                    if (!res.ok || !data.ok) throw new Error((data.error && data.error.message) || ('HTTP ' + res.status))
                    await connect(data.provider, data.index)
                  } catch (e) { setErr(cleanErrorMessage(e.message || e)) }
                },
              }, '＋ ' + t('connectAnother')),
              h('button', {
                type: 'button', className: 'dsub-mini',
                onClick: () => addSlot(prov.id),
              }, t('addAccount')),
            )
          }),
            )
      }

      return { AccountsPane }
    }

    return { createAccountsPane }
  },
})
