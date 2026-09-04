export const REASON_RATE_LIMIT = 'RATE_LIMIT'
export const REASON_HARD_LIMIT = 'HARD_LIMIT'
export const REASON_REVOKED = 'TOKEN_REVOKED'

export function quarantineDuration(reason) {
  switch (reason) {
    case REASON_HARD_LIMIT:
      return 24 * 60 * 60 * 1000 // 24 hours
    case REASON_REVOKED:
      return 7 * 24 * 60 * 60 * 1000 // 7 days (requires re-auth)
    case REASON_RATE_LIMIT:
    default:
      return 60 * 60 * 1000 // 1 hour
  }
}

export function putInQuarantine(account, reason, nowMs = Date.now()) {
  const duration = quarantineDuration(reason)
  return {
    ...account,
    quarantineReason: reason,
    quarantineUntil: nowMs + duration,
    status: 'quarantine'
  }
}

export function isQuarantined(account, nowMs = Date.now()) {
  if (!account || !account.quarantineUntil) return false
  return Number(account.quarantineUntil) > Number(nowMs)
}

export function releaseFromQuarantine(account) {
  const next = { ...account }
  delete next.quarantineReason
  delete next.quarantineUntil
  if (next.status === 'quarantine') next.status = 'active'
  return next
}
