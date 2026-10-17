// Subscription Billing Cycle Renewal Countdown & Payment Status Notifier (#558)
// Parses renewal dates, detects payment issues, formats countdowns and generates warnings.

const ONE_DAY_MS = 24 * 60 * 60 * 1000

/**
 * Formats a renewal timestamp into a human-readable countdown string.
 * @param {number|null} renewsAt
 * @param {number} [nowMs]
 * @returns {string}
 */
export function formatRenewalCountdown(renewsAt, nowMs = Date.now()) {
  const ts = Number(renewsAt)
  if (!Number.isFinite(ts) || ts <= 0) return ''

  const diffMs = ts - nowMs
  if (diffMs <= 0) {
    return 'Renewal overdue'
  }

  const days = Math.floor(diffMs / ONE_DAY_MS)
  const d = new Date(ts)
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const dateStr = `${yyyy}-${mm}-${dd}`

  if (days === 0) {
    return `Renews today (${dateStr})`
  }
  if (days === 1) {
    return `Renews in 1 day (${dateStr})`
  }
  return `Renews in ${days} days (${dateStr})`
}

/**
 * Extracts billing cycle metadata and evaluates payment status for a slot.
 * @param {object} [blob]
 * @param {object} [slot]
 * @param {number} [nowMs]
 * @returns {object}
 */
export function extractBillingInfo(blob = {}, slot = {}, nowMs = Date.now()) {
  const rawStatus = String(
    blob?.subscriptionStatus ||
    blob?.paymentStatus ||
    blob?.planStatus ||
    ''
  ).toLowerCase().trim()

  const rawRenew = (
    blob?.billingCycleEnd ||
    blob?.periodEnd ||
    blob?.renewsAt ||
    slot?.expiresAt ||
    blob?.expiresAt ||
    null
  )

  const renewsAt = Number.isFinite(Number(rawRenew)) && Number(rawRenew) > 0 ? Number(rawRenew) : null
  const renewalCountdown = formatRenewalCountdown(renewsAt, nowMs)

  let status = 'active'
  let paymentFailed = false
  let isOverdue = false
  let badgeText = ''
  let warning = ''

  if (['past_due', 'unpaid', 'payment_failed', 'failed'].includes(rawStatus)) {
    status = 'past_due'
    paymentFailed = true
    badgeText = 'Payment Failed'
    warning = 'Payment failed or subscription past due - check provider billing'
  } else if (['cancelled', 'canceled', 'revoked'].includes(rawStatus)) {
    status = 'cancelled'
    badgeText = 'Cancelled'
    warning = 'Subscription has been cancelled with provider'
  } else if (['trial_expired', 'expired'].includes(rawStatus)) {
    status = 'trial_expired'
    badgeText = 'Trial Expired'
    warning = 'Subscription trial or plan has expired'
  } else if (renewsAt && renewsAt < nowMs) {
    status = 'past_due'
    isOverdue = true
    badgeText = 'Renewal Overdue'
    warning = 'Subscription renewal date has passed'
  }

  return {
    renewsAt,
    renewalCountdown,
    status,
    isOverdue,
    paymentFailed,
    badgeText,
    warning,
  }
}
