import { readFileSync } from 'node:fs'
import { createHmac } from 'node:crypto'
import { validateWebhookUrl } from './webhook-url.js'

let pkgVersion = ''
try {
  pkgVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version || ''
} catch {
  // ignore package read errors
}

// #351: Proactive Quota Alerts & Webhook Dispatcher
// Manages quota threshold warnings, session expiry notifications,
// and webhook dispatch (e.g. Telegram/Discord or external monitoring).

const MAX_ALERTS = 100
let defaultWebhookSecret = ''
let defaultAllowPrivate = false
let defaultWebhookFormat = 'native'

export function setWebhookSecret(secret) {
  defaultWebhookSecret = String(secret || '')
}

export function setWebhookAllowPrivate(allow) {
  defaultAllowPrivate = Boolean(allow)
}

export function setWebhookFormat(format) {
  defaultWebhookFormat = format === 'notify' ? 'notify' : 'native'
}

export function toNotifyPayload(body) {
  const sentAt = new Date().toISOString()
  if (body && body.alert) {
    return {
      kind: body.alert.severity === 'info' ? 'task_done' : 'error',
      title: 'DSH Subscriptions',
      sessionId: 'dsh-subscriptions',
      summary: body.alert.message || body.alert.type || 'subscription alert',
      reason: body.alert.type || null,
      source: 'dsh-subscriptions',
      sentAt,
    }
  }
  const digest = (body && body.digest) || { total: 0 }
  return {
    kind: digest.total > 0 ? 'error' : 'task_done',
    title: 'DSH Subscriptions digest',
    sessionId: 'dsh-subscriptions',
    summary: String(digest.total || 0) + ' alerts in the digest',
    reason: 'digest',
    source: 'dsh-subscriptions',
    sentAt,
  }
}
const DEDUP_WINDOW_MS = 10 * 60 * 1000 // 10 minutes cooldown per (ref + type)

const alertBuffer = []
const lastAlertTime = new Map()

export function clearAlerts() {
  alertBuffer.length = 0
  lastAlertTime.clear()
}

/**
 * Records an alert into the in-memory buffer with deduplication.
 * @returns {object|null} the created alert, or null if deduped
 */
export function recordAlert({ type, ref, provider, message, severity = 'warn', details = null, nowMs = Date.now() }) {
  const dedupKey = `${type}:${ref || provider}`
  const prev = lastAlertTime.get(dedupKey) || 0
  if (nowMs - prev < DEDUP_WINDOW_MS) {
    return null // Deduplicate to avoid alert floods
  }
  lastAlertTime.set(dedupKey, nowMs)

  const alert = {
    id: `alt_${nowMs.toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    type,
    ref: ref || null,
    provider: provider || 'unknown',
    message: String(message || ''),
    severity,
    details,
    timestamp: nowMs,
  }

  alertBuffer.push(alert)
  if (alertBuffer.length > MAX_ALERTS) {
    alertBuffer.shift()
  }
  return alert
}

/**
 * Returns recent alerts from the in-memory buffer.
 */
export function getRecentAlerts(limit = 50) {
  return alertBuffer.slice(-Math.max(1, Math.min(limit, MAX_ALERTS))).reverse()
}

// #696: signed, retrying webhook delivery plus a digest endpoint payload.
export async function dispatchWebhookAlert(alert, webhookUrl, fetchImpl = fetch, options = {}) {
  if (!alert || !webhookUrl) return false
  return dispatchNotification({ event: 'subscription_alert', alert }, webhookUrl, fetchImpl, options)
}

export function buildNotificationDigest(alerts, { windowMs = 24 * 60 * 60 * 1000, nowMs = Date.now() } = {}) {
  const since = nowMs - Math.max(0, Number(windowMs) || 0)
  const recent = (Array.isArray(alerts) ? alerts : []).filter((a) => a && Number(a.timestamp) >= since)
  const bySeverity = {}
  const byType = {}
  for (const a of recent) {
    bySeverity[a.severity || 'warn'] = (bySeverity[a.severity || 'warn'] || 0) + 1
    byType[a.type || 'unknown'] = (byType[a.type || 'unknown'] || 0) + 1
  }
  return {
    total: recent.length,
    bySeverity,
    byType,
    since: new Date(since).toISOString(),
    until: new Date(nowMs).toISOString(),
  }
}

export async function dispatchNotificationDigest(alerts, webhookUrl, fetchImpl = fetch, options = {}) {
  if (!webhookUrl) return false
  const digest = buildNotificationDigest(alerts, options)
  return dispatchNotification({ event: 'subscription_digest', digest }, webhookUrl, fetchImpl, options)
}

async function dispatchNotification(body, webhookUrl, fetchImpl, options) {
  const opts = options || {}
  const { retries = 1, timeoutMs = 5000, sleep } = opts
  const secret = opts.secret == null ? defaultWebhookSecret : opts.secret
  const allowPrivate = opts.allowPrivate == null ? defaultAllowPrivate : Boolean(opts.allowPrivate)
  const format = opts.format == null ? defaultWebhookFormat : opts.format
  const checked = validateWebhookUrl(webhookUrl, { allowPrivate })
  if (!checked.ok) return false
  webhookUrl = checked.url
  const payload = format === 'notify'
    ? toNotifyPayload(body)
    : { ...body, source: 'dsh-subscriptions', sentAt: new Date().toISOString() }
  const raw = JSON.stringify(payload)
  const headers = {
    'content-type': 'application/json',
    'user-agent': pkgVersion ? `dsh-subscriptions/${pkgVersion}` : 'dsh-subscriptions',
  }
  if (secret) headers['x-dsh-signature'] = 'sha256=' + createHmac('sha256', String(secret)).update(raw).digest('hex')
  headers['x-dsh-timestamp'] = payload.sentAt
  const wait = typeof sleep === 'function' ? sleep : (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const attempts = Math.max(0, Number(retries) || 0) + 1
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const init = { method: 'POST', headers, body: raw }
      if (timeoutMs > 0 && typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
        init.signal = AbortSignal.timeout(timeoutMs)
      }
      const res = await fetchImpl(webhookUrl, init)
      if (res && res.ok) return true
      const status = Number(res && res.status) || 0
      if (status && status < 500) return false
    } catch {
      // retry network errors
    }
    if (attempt + 1 < attempts) await wait(250 * (2 ** attempt))
  }
  return false
}

/**
 * Evaluates used percent against configured thresholds and fires alerts if triggered.
 */
export function checkQuotaThresholds({
  ref,
  provider,
  usedPercent,
  thresholds = [80, 90, 95],
  webhookUrl = '',
  fetchImpl = fetch,
  nowMs = Date.now(),
}) {
  const pct = Number(usedPercent) || 0
  if (pct <= 0) return null

  // Find the highest threshold that was exceeded
  const sorted = [...thresholds].sort((a, b) => b - a)
  const matchedThreshold = sorted.find((th) => pct >= th)
  if (!matchedThreshold) return null

  const severity = pct >= 95 ? 'error' : 'warn'
  const message = `[Quota Alert] ${provider || 'Account'} (${ref || 'slot'}) has reached ${Math.round(pct)}% used (threshold: ${matchedThreshold}%)`

  const alert = recordAlert({
    type: 'quota_threshold',
    ref,
    provider,
    message,
    severity,
    details: { usedPercent: pct, threshold: matchedThreshold },
    nowMs,
  })

  if (alert && webhookUrl) {
    dispatchWebhookAlert(alert, webhookUrl, fetchImpl).catch(() => {})
  }
  return alert
}

/**
 * Fires an alert when a session token expires or is revoked.
 */
export function notifySessionExpired({
  ref,
  provider,
  message,
  webhookUrl = '',
  fetchImpl = fetch,
  nowMs = Date.now(),
}) {
  const alert = recordAlert({
    type: 'token_expired',
    ref,
    provider,
    message: message || `Session for ${provider || 'account'} (${ref || 'slot'}) has expired and requires re-authentication.`,
    severity: 'error',
    nowMs,
  })

  if (alert && webhookUrl) {
    dispatchWebhookAlert(alert, webhookUrl, fetchImpl).catch(() => {})
  }
  return alert
}

/**
 * #509 & #510: Fires an alert when an account enters quarantine.
 */
export function notifyQuarantineEntered({
  ref,
  provider,
  reason,
  until,
  webhookUrl = "",
  fetchImpl = fetch,
  nowMs = Date.now(),
}) {
  const untilIso = until ? new Date(until).toISOString() : ""
  const alert = recordAlert({
    type: "quarantine_entered",
    ref,
    provider,
    message: "Account " + (provider || "slot") + " (" + (ref || "") + ") entered quarantine (" + (reason || "RATE_LIMIT") + ")" + (untilIso ? " until " + untilIso : ""),
    severity: "warn",
    details: { reason, until },
    nowMs,
  })

  if (alert && webhookUrl) {
    dispatchWebhookAlert(alert, webhookUrl, fetchImpl).catch(() => {})
  }
  return alert
}

/**
 * #509 & #510: Fires an alert when an account is released from quarantine.
 */
export function notifyQuarantineReleased({
  ref,
  provider,
  message,
  webhookUrl = "",
  fetchImpl = fetch,
  nowMs = Date.now(),
}) {
  const alert = recordAlert({
    type: "quarantine_released",
    ref,
    provider,
    message: message || ("Account " + (provider || "slot") + " (" + (ref || "") + ") released from quarantine and is active"),
    severity: "info",
    nowMs,
  })

  if (alert && webhookUrl) {
    dispatchWebhookAlert(alert, webhookUrl, fetchImpl).catch(() => {})
  }
  return alert
}

/**
 * #558: Fires an alert when a subscription experiences a billing failure or overdue renewal.
 */
export function notifyBillingAlert({
  ref,
  provider,
  status,
  renewsAt,
  message,
  webhookUrl = '',
  fetchImpl = fetch,
  nowMs = Date.now(),
}) {
  const isFailed = status === 'past_due' || status === 'unpaid' || status === 'payment_failed'
  const severity = isFailed ? 'error' : 'warn'
  const defaultMsg = isFailed
    ? `Billing alert: ${provider || 'Account'} (${ref || 'slot'}) has payment issue (${status}).`
    : `Subscription renewal alert: ${provider || 'Account'} (${ref || 'slot'}) renewal is overdue.`

  const alert = recordAlert({
    type: 'billing_status',
    ref,
    provider,
    message: message || defaultMsg,
    severity,
    details: { status, renewsAt },
    nowMs,
  })

  if (alert && webhookUrl) {
    dispatchWebhookAlert(alert, webhookUrl, fetchImpl).catch(() => {})
  }
  return alert
}
