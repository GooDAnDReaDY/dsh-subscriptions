import { ignoreError } from './catch-log.js'
import { copilotCliInfo } from './vendors/copilot.js'
import { getSessionReasoningStats } from './reasoning-effort.js'
import { defaultConcurrencyQueue } from './concurrency-queue.js'
import { calculateCacheMetrics } from './analytics.js'
import { getSessionPinStats } from './session-pin.js'
import { maskSecrets } from './mask.js'
import { normalizeSlots } from './accounts.js'
import { PROVIDERS } from './refs.js'
import { defaultErrorBuffer } from './error-buffer.js'
import { grokCatalogCacheSize } from './vendors/grok.js'
import { getIgnoredErrors } from './catch-log.js'

function queueStats(concurrencyQueue) {
  const queue = concurrencyQueue || defaultConcurrencyQueue
  return typeof queue.stats === 'function' ? queue.stats() : null
}

function scrubReport(v) {
  if (typeof v === 'string') return maskSecrets(v)
  if (Array.isArray(v)) return v.map(scrubReport)
  if (v && typeof v === 'object') {
    const o = {}
    for (const k of Object.keys(v)) o[k] = scrubReport(v[k])
    return o
  }
  return v
}

export async function createDiagnosticsReport({ live, store, history, NS, pkgVersion, heartbeatStats, concurrencyQueue }) {
  const cfg = live()
  const slots = normalizeSlots(cfg.slots)
  const mk = () => ({ loggedIn: false, slots: 0, configured: 0, cooldown: 0, proxy: 0, maxUsagePercent: null, maxUsageAgeMs: null, staleQuota: false })
  const providers = {}
  for (const p of PROVIDERS) providers[p] = mk()
  const logged = await store.loggedInProviders()
  const nowMs = Date.now()
  const STALE_QUOTA_MS = 5 * 60 * 1000
  for (const slot of slots) {
    const pv = providers[slot.provider] || (providers[slot.provider] = mk())
    pv.slots++
    if (slot.proxyUrl) pv.proxy++
    try {
      const info = await store.describeRef(slot.ref)
      if (info.configured) pv.configured++
      if (info.cooldownUntil && info.cooldownUntil > nowMs) pv.cooldown++
      if (info.usagePercent != null) {
        const pct = Math.round(info.usagePercent)
        if (pv.maxUsagePercent == null || pct > pv.maxUsagePercent) {
          // #934: keep the age of the measurement that produced the maximum,
          // so a stale quota is not reported as a fresh reading.
          pv.maxUsagePercent = pct
          pv.maxUsageAgeMs = info.usageAt ? Math.max(0, nowMs - Number(info.usageAt)) : null
        }
        pv.staleQuota = pv.maxUsageAgeMs == null || pv.maxUsageAgeMs > STALE_QUOTA_MS
      }
    } catch (err) { ignoreError("diagnostics.js: best-effort", err) }
  }
  for (const p of Object.keys(providers)) providers[p].loggedIn = logged.includes(p)
  const rows = history.all()
  const byStatus = {}
  for (const r of rows) {
    const k = (r.provider || '?') + ':' + (r.status || '?')
    byStatus[k] = (byStatus[k] || 0) + 1
  }
  const lastErrors = rows.filter((r) => r.status && r.status >= 400).slice(0, 10)
    .map((r) => ({ ts: r.ts, provider: r.provider, status: r.status, kind: r.kind || 'request', ms: r.ms || null }))
  return scrubReport({
    generatedAt: new Date().toISOString(),
    plugin: NS + (pkgVersion ? ' v' + pkgVersion : ''),
    runtime: { node: process.version, platform: process.platform, arch: process.arch, uptimeSec: Math.round(process.uptime()) },
    providers,
    requests: { total: rows.length, byStatus, lastErrors },
    recentErrors: defaultErrorBuffer.getEntries(),
    ignoredErrors: getIgnoredErrors(),
    heartbeat: heartbeatStats || { lastRunAt: null, proactiveRefreshCount: 0 },
    cache: calculateCacheMetrics(rows),
    grokCatalogCacheEntries: grokCatalogCacheSize(),
    queue: queueStats(concurrencyQueue),
    pins: getSessionPinStats(),
    reasoning: getSessionReasoningStats(),
    copilotCli: copilotCliInfo(cfg),
    decisions: {
      recent: rows.filter((r) => r && r.decisionTrace).slice(0, 10).map((r) => ({
        ts: r.ts,
        provider: r.provider,
        ref: r.ref,
        outcome: r.decisionTrace.finalOutcome || 'success',
        attempts: (r.decisionTrace.attempts || []).map((a) => ({
          ref: a.ref,
          status: a.status,
          decision: a.decisionReason || a.kind,
        })),
      })),
    },
    settings: {
      cooldownMs: cfg.cooldownMs,
      switchAtRemaining: cfg.switchAtRemaining,
      probeIntervalMin: cfg.probeIntervalMin,
      useWebCallback: !!cfg.useWebCallback,
      autoLoopback: !!cfg.autoLoopback,
      privacyMask: !!cfg.privacyMask,
      customVendors: Array.isArray(cfg.customVendors) ? cfg.customVendors.length : 0,
      proxySlots: slots.filter((s) => s.proxyUrl).length,
      cascadingFallback: !!cfg.cascadingFallback,
      cascadingFallbackOrder: cfg.cascadingFallbackOrder || PROVIDERS,
      rotationStrategy: cfg.rotationStrategy || 'round-robin',
      enableSoftFailureSentinel: cfg.enableSoftFailureSentinel !== false,
    },
  })
}
