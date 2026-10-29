import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { calculateBurnRatePerHour } from './forecast.js'
import { parseBlob } from './blob.js'
import { credentialState } from './account-reliability.js'
import { computeHealthScore, healthBadge } from './health.js'

export function createDescribeRef({ credentials, resolveRaw, resolveMasterKey, ...maps }) {
  const { cooldowns, quarantines, quotas, quotaSamples, windows, health, usage, refreshFailures, doctorVerdicts, pings, dynamicModels } = maps
  return async function describeRef(ref, cfg = null) {
    const base = { ref, configured: false, writable: true, label: '', email: '' }
    try {
      if (typeof credentials.describe === 'function') {
        const d = await credentials.describe(credentialRef(ref))
        base.configured = !!(d && d.configured)
        base.writable = d && d.writable === false ? false : true
      } else {
        base.configured = !!(await resolveRaw(ref))
      }
    } catch {
      return base
    }
    let isEncryptedAtRest = false
    try {
      const resolved = await credentials.resolve(credentialRef(ref))
      const raw = resolved && resolved.value ? String(resolved.value) : ''
      if (raw.startsWith('DSHE1:') || raw.startsWith('DSHE2:') || raw.startsWith('DSHE3:')) {
        isEncryptedAtRest = true
      } else if (Boolean(resolveMasterKey(cfg))) {
        isEncryptedAtRest = true
      }
    } catch { /* best-effort */ }

    if (base.configured) {
      try {
        const blob = parseBlob(await resolveRaw(ref))
        const state = credentialState(blob)
        if (!state.usable) {
          base.configured = false
          base.credentialError = state.reason
          base.label = blob.label || blob.email || ''
          return {
            ...base,
            cooldownUntil: 0,
            quarantineUntil: 0,
            cooldownFamilies: null,
            cooldownModels: null,
            quota: null,
            isRevoked: false,
            authWarning: '',
            validationUrl: '',
            validationMessage: '',
            accountNotice: '',
            paidTierName: '',
          }
        }
        base.label = blob.label || blob.email || ''
        base.email = blob.email || ''
        base.plan = blob.plan || blob.paidTierName || ''
        base.avatarUrl = blob.avatarUrl || ''
        base.scopes = Array.isArray(blob.scopes) ? blob.scopes : []
        base.scopeWarning = blob.scopeWarning || ''
        if (Array.isArray(blob.usage)) { base.usage = blob.usage; base.usageAt = blob.usageAt || 0 }
        if (blob.validationUrl) base.validationUrl = blob.validationUrl
        if (blob.validationMessage) base.validationMessage = blob.validationMessage
        if (blob.accountNotice) base.accountNotice = blob.accountNotice
        if (blob.paidTierName) base.paidTierName = blob.paidTierName
        base.selectedOrgId = blob.selectedOrgId || blob.accountId || blob.projectId || ''
        base.selectedOrgName = blob.selectedOrgName || base.selectedOrgId || ''
        base.organizations = Array.isArray(blob.organizations) ? blob.organizations : []
      } catch { /* ignore parse */ }
    }
    return {
      ...base,
      cooldownUntil: cooldowns.get(ref) ? cooldowns.get(ref).until : 0,
      quarantineUntil: quarantines.get(ref) ? quarantines.get(ref).until : 0,
      quarantineReason: quarantines.get(ref) ? quarantines.get(ref).reason : null,
      cooldownFamilies: cooldowns.get(ref) && cooldowns.get(ref).families ? cooldowns.get(ref).families : null,
      cooldownModels: cooldowns.get(ref) && cooldowns.get(ref).models ? cooldowns.get(ref).models : null,
      quota: quotas.get(ref) || null,
      pacePerHour: quotas.get(ref)?.pacePerHour || calculateBurnRatePerHour(quotaSamples.get(ref) || [], Date.now()),
      samples: quotaSamples.get(ref) || [],
      usage: windows.get(ref) || base.usage || null,
      health: health.get(ref) || null,
      healthScore: computeHealthScore(health.get(ref) || null),
      healthBadge: healthBadge(computeHealthScore(health.get(ref) || null)),
      usagePercent: usage.has(ref) ? usage.get(ref) : null,
      refreshError: refreshFailures.get(ref)?.error || '',
      isTimeout: !!refreshFailures.get(ref)?.isTimeout,
      plan: base.plan || '',
      avatarUrl: base.avatarUrl || '',
      scopes: base.scopes || [],
      scopeWarning: base.scopeWarning || '',
      selectedOrgId: base.selectedOrgId || '',
      selectedOrgName: base.selectedOrgName || '',
      organizations: base.organizations || [],
      isEncryptedAtRest,
      isRevoked: Boolean(
        (quarantines.get(ref)?.reason === 'REVOKED' || quarantines.get(ref)?.reason === 'SESSION_REVOKED') ||
        (doctorVerdicts.get(ref)?.code === 'TOKEN_EXPIRED' || doctorVerdicts.get(ref)?.code === 'TOKEN_REVOKED') ||
        (/invalid_grant|token_revoked|revoked|session expired/i.test(refreshFailures.get(ref)?.error || ''))
      ),
      authWarning: (
        (quarantines.get(ref)?.reason === 'REVOKED' || quarantines.get(ref)?.reason === 'SESSION_REVOKED') ||
        (doctorVerdicts.get(ref)?.code === 'TOKEN_EXPIRED' || doctorVerdicts.get(ref)?.code === 'TOKEN_REVOKED') ||
        (/invalid_grant|token_revoked|revoked|session expired/i.test(refreshFailures.get(ref)?.error || ''))
      ) ? 'Session expired / revoked — re-authorization required' : '',
      validationUrl: base.validationUrl || '',
      validationMessage: base.validationMessage || '',
      accountNotice: base.accountNotice || '',
      paidTierName: base.paidTierName || '',
      lastPingMs: pings.get(ref)?.latencyMs ?? null,
      latencyGrade: pings.get(ref)?.latencyGrade ?? null,
      lastDoctorVerdict: doctorVerdicts.get(ref) || null,
      availableModels: dynamicModels.get(ref)?.models || null,
      credentialError: base.credentialError || null,
    }
  }
}
