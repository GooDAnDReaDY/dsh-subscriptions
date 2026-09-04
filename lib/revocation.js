const REVOKED_ERRORS = new Set([
  'invalid_grant',
  'token_revoked',
  'account_deactivated',
  'session_expired'
])

export function isTokenRevokedError(err) {
  if (!err) return false
  const msg = String(err.message || err.error || err.code || '').toLowerCase()
  for (const pattern of REVOKED_ERRORS) {
    if (msg.includes(pattern)) return true
  }
  return false
}

export function handleAccountRevocation(account) {
  return {
    ...account,
    hasToken: false,
    status: 'revoked',
    needsReauth: true,
    revokedAt: Date.now()
  }
}
