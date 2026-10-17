import { defaultConcurrencyQueue } from './concurrency-queue.js'
import { normalizeSlots } from './accounts.js'
import {
  inspectGoogleAccount,
  antigravityMetadata,
  antigravityIdentityHeaders,
} from './code-assist.js'
import {
  computeEffectiveResetAt,
  formatRollingCountdown,
  VENDOR_WINDOW_MS,
} from './reset-clock.js'

async function enrichAntigravityAccount(slot, info, store, fetch) {
  if (!info.configured || slot.provider !== 'antigravity') return info
  let blob
  try { blob = await store.loadBlob(slot.ref) } catch { return info }
  if (blob.validationUrl) {
    return {
      ...info,
      validationUrl: blob.validationUrl,
      validationMessage: blob.validationMessage || info.validationMessage || '',
      paidTierName: blob.paidTierName || info.paidTierName || '',
      plan: blob.plan || info.plan || blob.paidTierName || info.paidTierName || '',
    }
  }
  try {
    const fresh = await store.ensureFresh(slot.provider, blob, slot.ref)
    const probe = await inspectGoogleAccount(fetch, fresh.accessToken, {
      metadata: antigravityMetadata(fresh.projectId || ''),
      extraHeaders: antigravityIdentityHeaders(fresh.projectId || ''),
      projectId: fresh.projectId,
    })
    const next = { ...fresh }
    if (probe.projectId && probe.projectId !== fresh.projectId) next.projectId = probe.projectId
    if (probe.paidTierId) next.paidTierId = probe.paidTierId
    if (probe.paidTierName) next.paidTierName = probe.paidTierName
    if (probe.validation?.validationUrl) {
      next.validationUrl = probe.validation.validationUrl
      next.validationMessage = probe.validation.message || ''
      await store.saveBlob(slot.ref, next)
      return {
        ...info,
        validationUrl: next.validationUrl,
        validationMessage: next.validationMessage,
        paidTierName: next.paidTierName || '',
        plan: info.plan || next.paidTierName || '',
      }
    }
    if (probe.notice?.message) {
      next.accountNotice = probe.notice.message
      await store.saveBlob(slot.ref, next)
      return {
        ...info,
        accountNotice: next.accountNotice,
        paidTierName: next.paidTierName || '',
        plan: info.plan || next.paidTierName || '',
      }
    }
    if (probe.projectId || probe.paidTierId) await store.saveBlob(slot.ref, next)
    return {
      ...info,
      paidTierName: next.paidTierName || info.paidTierName || '',
      plan: info.plan || next.paidTierName || '',
    }
  } catch { /* keep settings responsive */ }
  return info
}

export async function createAccountsView({ live, store, fetch, pmL, pmE, concurrencyQueue = defaultConcurrencyQueue }) {
  const out = []
  const qStats = (concurrencyQueue && typeof concurrencyQueue.stats === 'function') ? concurrencyQueue.stats() : null
  for (const slot of normalizeSlots(live().slots)) {
    const info = await enrichAntigravityAccount(slot, await store.describeRef(slot.ref), store, fetch)
    const effectiveResetAt = computeEffectiveResetAt(info, slot.provider)
    const resetCountdown = effectiveResetAt ? formatRollingCountdown(effectiveResetAt, 'en') : ''
    const slotQ = (qStats && qStats.byKey && qStats.byKey[slot.ref]) || { active: 0, queued: 0 }

    out.push({
      provider: slot.provider,
      index: slot.index,
      ref: slot.ref,
      activeStreams: slotQ.active || 0,
      queuedStreams: slotQ.queued || 0,
      maxConcurrency: slot.maxConcurrency !== undefined ? slot.maxConcurrency : ((live() && live().accountMaxConcurrency) || 1),
      label: pmL ? pmL(slot.label || info.label) : (slot.label || info.label),
      email: typeof pmE === 'function' ? pmE(info.email || '') : String(info.email || ''),
      plan: info.plan || info.paidTierName || '',
      avatarUrl: info.avatarUrl || '',
      scopes: Array.isArray(info.scopes) ? info.scopes : [],
      scopeWarning: info.scopeWarning || '',
      selectedOrgId: info.selectedOrgId || '',
      selectedOrgName: info.selectedOrgName || '',
      organizations: Array.isArray(info.organizations) ? info.organizations : [],
      isEncryptedAtRest: Boolean(info.isEncryptedAtRest),
      isRevoked: Boolean(info.isRevoked),
      authWarning: info.authWarning || '',
      configured: info.configured,
      writable: info.writable,
      cooldownUntil: info.cooldownUntil,
      // Issue 303: expose the cooldown scope and quarantine so the card can
      // explain why only some models are blocked.
      cooldownFamilies: info.cooldownFamilies || null,
      quarantineUntil: info.quarantineUntil || 0,
      quarantineReason: info.quarantineReason || null,
      healthScore: info.healthScore,
      healthBadge: info.healthBadge,
      usagePercent: info.usagePercent,
      quota: info.quota || null,
      usage: info.usage || null,
      resetAt: effectiveResetAt || (info.quota && info.quota.resetAt) || null,
      resetCountdown: resetCountdown || '',
      resetWindowMs: VENDOR_WINDOW_MS[slot.provider] || 0,
      requests: store.getRequestCount(slot.ref) || null,
      refreshError: info.refreshError || '',
      validationUrl: info.validationUrl || '',
      validationMessage: info.validationMessage || '',
      accountNotice: info.accountNotice || '',
      paidTierName: info.paidTierName || '',
      lastPingMs: info.lastPingMs ?? null,
      latencyGrade: info.latencyGrade ?? null,
      lastDoctorVerdict: info.lastDoctorVerdict || null,
      availableModels: info.availableModels || null,
    })
  }
  return out
}
