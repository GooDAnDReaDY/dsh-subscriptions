/* global window */
// #623 / #1094: the diagnostic wizard and the vault backup panel.
//
// Between them these were 168 lines of render code inside SubsSection, plus the
// four async handlers that exist only to serve them. Neither owns a hook, so
// moving them changes no behaviour — every piece of state arrives through props.
//
// The epic's acceptance criterion is client.js under 150 000 B, and this is what
// takes it there.
window.__ModuleLoader__.load({
  id: '@goodandready/dsh-subscriptions',
  chunk: 'client.modals.js',
  factory: () => {
    /**
     * Build the modal components with host helpers injected.
     *
     * @param {object} deps
     * @param {Function} deps.h  createElement with portal handling
     */
    function createModals(deps) {
      const h = deps.h

      /**
       * The diagnostic wizard: run the doctor over one account or all of them,
       * then show each step, the summary and the recommendations.
       *
       * @param {object} props
       * @param {Function} props.t      translator for the plugin namespace
       * @param {object} props.state    modal, setModal, run, copyText
       */
      function DiagnosticWizard(props) {
        const t = props.t
        const {
          modal: wizardModal, setModal: setWizardModal, run: runWizard, copyText,
        } = props.state
        if (!wizardModal) return null

          return h('div', { className: 'dsub-modalWrap', onClick: (e) => { if (e.target === e.currentTarget) setWizardModal(null) } },
            h('div', { className: 'dsub-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('wizardTitle') },
              h('div', { className: 'dsub-modalHead' },
                h('div', { className: 'dsub-modalTitleWrap' },
                  h('div', { className: 'dsub-modalIcon' }, '🩺'),
                  h('div', null,
                    h('div', { style: { fontWeight: 700, fontSize: '15px' } }, t('wizardTitle')),
                    h('div', { style: { fontSize: '11.5px', opacity: 0.7 } },
                      wizardModal.provider && wizardModal.provider !== 'all' ? (wizardModal.provider.toUpperCase() + ' #' + wizardModal.index + (wizardModal.ref ? ' (' + wizardModal.ref + ')' : '')) : t('wizardAll')
                    ),
                  ),
                ),
                h('button', { type: 'button', className: 'dsub-mini', onClick: () => setWizardModal(null) }, '✕ ' + t('closeModal')),
              ),
              h('div', { style: { marginTop: '14px' } },
                h('label', { className: 'dsub-row', style: { marginBottom: '10px' } },
                  h('input', {
                    type: 'checkbox',
                    checked: !!wizardModal.includeNetwork,
                    onChange: (e) => runWizard(wizardModal.provider === 'all' ? null : wizardModal.provider, wizardModal.index, wizardModal.ref, e.target.checked),
                  }),
                  h('span', { style: { fontSize: '12px' } }, t('wizardIncludeNetwork')),
                ),
                wizardModal.loading ? h('div', { className: 'dsub-alert-ok', style: { marginBottom: '12px' } }, '⏳ ' + t('wizardRunning')) : null,
                wizardModal.error ? h('div', { className: 'dsub-alert-bad', style: { marginBottom: '12px' } }, wizardModal.error) : null,
                wizardModal.report ? h('div', null,
                  h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' } },
                    h('span', {
                      className: 'dsub-badge ' + (wizardModal.report.overallStatus === 'healthy' ? 'dsub-badge-ok' : (wizardModal.report.overallStatus === 'degraded' ? 'dsub-badge-warn' : 'dsub-badge-bad'))
                    }, (wizardModal.report.overallStatus === 'healthy' ? '🟢 ' + t('wizardHealthy') : (wizardModal.report.overallStatus === 'degraded' ? '🟡 ' + t('wizardDegraded') : '🔴 ' + t('wizardFailing')))),
                    h('span', { style: { fontSize: '11.5px', opacity: 0.7 } },
                      ((wizardModal.report.summary && wizardModal.report.summary.passed) || 0) + ' ' + t('wizardPassed') + ' · ' + ((wizardModal.report.summary && wizardModal.report.summary.warnings) || 0) + ' ' + t('wizardWarn') + ' · ' + ((wizardModal.report.summary && wizardModal.report.summary.failed) || 0) + ' ' + t('wizardFail')
                    ),
                  ),
                  h('div', { className: 'dsub-trace-box', style: { marginBottom: '12px' } },
                    (Array.isArray(wizardModal.report.steps) ? wizardModal.report.steps : []).map((st, idx) => {
                      const icon = st.status === 'pass' ? '✅' : (st.status === 'warn' ? '⚠️' : (st.status === 'fail' ? '❌' : '⚪'))
                      const color = st.status === 'pass' ? 'var(--dsw-alias-state-success-primary)' : (st.status === 'warn' ? 'var(--dsw-alias-state-warn-primary)' : (st.status === 'fail' ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-label-secondary)'))
                      return h('div', { key: idx, className: 'dsub-trace-row' },
                        h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
                          h('span', null, icon),
                          h('span', { style: { fontWeight: 600 } }, st.name),
                          st.latencyMs != null ? h('span', { style: { fontSize: '10px', opacity: 0.6 } }, st.latencyMs + 'ms') : null,
                        ),
                        h('span', { style: { fontSize: '11px', color: color } }, st.message),
                      )
                    })
                  ),
                  wizardModal.report.recommendations && wizardModal.report.recommendations.length ? h('div', { style: { marginBottom: '12px' } },
                    h('div', { style: { fontSize: '11.5px', fontWeight: 600, color: 'var(--dsw-alias-state-warn-primary)', marginBottom: '4px' } }, '💡 ' + t('wizardRecommendations')),
                    wizardModal.report.recommendations.map((rec, rIdx) => h('div', { key: rIdx, className: 'dsub-alert-bad', style: { marginBottom: '4px', fontSize: '11.5px' } }, rec))
                  ) : null,
                  h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' } },
                    h('button', {
                      type: 'button',
                      className: 'dsub-mini',
                      onClick: () => {
                        const txt = JSON.stringify(wizardModal.report, null, 2)
                        copyText(txt)
                      },
                    }, '📋 ' + t('wizardCopy')),
                  ),
                ) : null,
              ),
            ),
          )
      }

      /**
       * Vault backup and restore, including the WebDAV sync controls that share
       * the same panel.
       *
       * @param {object} props
       * @param {Function} props.t
       * @param {object} props.state
       */
      function VaultBackupPanel(props) {
        const t = props.t
        const {
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
        } = props.state
        if (!backupModal) return null

          return h('div', { className: 'dsub-panel-box', style: { marginTop: '10px' } },
            h('div', { className: 'dsub-panel-title' },
              h('span', null, backupModal === 'export' ? ('🔒 ' + t('backupExportTitle')) : ('📥 ' + t('backupImportTitle'))),
              h('button', {
                type: 'button',
                className: 'dsub-mini',
                onClick: () => { setBackupModal(null); setBackupPass(''); setBackupData(''); setBackupErr(''); setBackupInfo('') }
              }, '✕ ' + t('closeModal'))
            ),
            h('div', { className: 'dsub-panel-desc' },
              backupModal === 'export' ? t('backupExportHint') : t('backupImportHint')
            ),
            h('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '8px' } },
              backupModal === 'import' ? h('div', { className: 'dsub-row', style: { gap: '8px', alignItems: 'center' } },
                h('input', {
                  type: 'file',
                  accept: '.enc,.txt',
                  className: 'dsub-mini',
                  style: { maxWidth: '220px' },
                  onChange: (e) => {
                    const f = e.target.files && e.target.files[0]
                    if (!f) return
                    const reader = new window.FileReader()
                    reader.onload = (evt) => {
                      if (evt.target && evt.target.result) setBackupData(String(evt.target.result))
                    }
                    reader.readAsText(f)
                  },
                }),
                h('span', { className: 'dsub-sub' }, t('orPasteVaultPayload'))
              ) : null,
              backupModal === 'import' ? h('textarea', {
                className: 'dsub-diag',
                style: { width: '100%', height: '80px', fontFamily: 'monospace', fontSize: '11px' },
                placeholder: t('backupPayloadPlaceholder'),
                value: backupData,
                onChange: (e) => setBackupData(e.target.value),
              }) : null,
              h('div', { className: 'dsub-row' },
                h('input', {
                  type: 'password',
                  className: 'dsub-grow',
                  placeholder: t('backupPassphrase'),
                  value: backupPass,
                  onChange: (e) => setBackupPass(e.target.value),
                }),
                backupModal === 'export' ? h('button', {
                  type: 'button',
                  className: 'dsub-mini',
                  disabled: backupLoading || !backupPass || backupPass.length < 12,
                  onClick: doExportBackup,
                }, backupLoading ? '…' : t('backupExportAction')) : h('button', {
                  type: 'button',
                  className: 'dsub-mini',
                  disabled: backupLoading || !backupPass || !backupData,
                  onClick: doImportBackup,
                }, backupLoading ? '…' : t('backupImportAction'))
              ),
              backupErr ? h('div', { className: 'dsub-bad' }, backupErr) : null,
              backupInfo ? h('div', { className: 'dsub-ok' }, backupInfo) : null,
              (backupModal === 'export' && backupData) ? h('div', { className: 'dsub-row' },
                h('button', {
                  type: 'button',
                  className: 'dsub-mini',
                  onClick: () => { copyText(backupData) },
                }, t('diagCopy')),
                h('button', {
                  type: 'button',
                  className: 'dsub-mini',
                  onClick: downloadBackupFile,
                }, t('backupDownload')),
                h('pre', { className: 'dsub-diag', style: { maxHeight: '60px', overflow: 'hidden', textOverflow: 'ellipsis' } }, backupData)
              ) : null,
              h('div', {
                className: 'dsub-panel-box',
                style: { marginTop: 10, padding: '10px 12px', borderTop: '1px solid var(--dsw-alias-border-l2)' }
              },
                h('div', { className: 'dsub-panel-title' },
                  h('span', null, '☁️ ' + t('vaultSyncTitle')),
                  h('div', { style: { display: 'flex', gap: 6 } },
                    h('button', {
                      type: 'button',
                      className: 'dsub-mini',
                      disabled: vaultSyncLoading,
                      onClick: doVaultSyncPush,
                    }, vaultSyncLoading ? '…' : t('vaultSyncPush')),
                    h('button', {
                      type: 'button',
                      className: 'dsub-mini',
                      disabled: vaultSyncLoading,
                      onClick: doVaultSyncPull,
                    }, vaultSyncLoading ? '…' : t('vaultSyncPull'))
                  )
                ),
                vaultSyncInfo ? h('div', { className: 'dsub-sub', style: { marginTop: 4 } },
                  t('vaultSyncBackend') + ' ' + (vaultSyncInfo.backend || 'webdav') + ' · ' +
                  t('vaultSyncLastPush') + ' ' + (vaultSyncInfo.lastPushAt ? new Date(vaultSyncInfo.lastPushAt).toLocaleTimeString() : 'never') + ' · ' +
                  t('vaultSyncLastPull') + ' ' + (vaultSyncInfo.lastPullAt ? new Date(vaultSyncInfo.lastPullAt).toLocaleTimeString() : 'never')
                ) : null
              )
            )
          )
      }

      return { DiagnosticWizard, VaultBackupPanel }
    }

    return { createModals }
  },
})
