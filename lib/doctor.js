/**
 * Vendor Auth Doctor: Diagnose authentication, authorization, quota, and network errors
 * into structured, human-understandable recommendations.
 */

export const DOCTOR_CODES = {
  GEO_BLOCKED: 'GEO_BLOCKED',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_REVOKED: 'TOKEN_REVOKED',
  MISSING_SCOPE: 'MISSING_SCOPE',
  QUOTA_EXHAUSTED: 'QUOTA_EXHAUSTED',
  RATE_LIMIT: 'RATE_LIMIT',
  PROXY_ERROR: 'PROXY_ERROR',
  UNKNOWN: 'UNKNOWN',
}

/**
 * Classifies vendor errors and generates actionable recommendations.
 * @param {any} err
 * @param {string} [provider]
 * @param {any} [_account]
 * @returns {{ code: string, title: string, details: string, recommendation: string } | null}
 */
export function diagnoseVendorError(err, provider = '', _account = null) {
  if (!err) return null

  const msg = String(err.message || err.error || err || '').toLowerCase()
  const code = String(err.code || err.status || err.statusCode || '').toUpperCase()
  const p = String(provider || '').toLowerCase()

  // 1. Geo-blocking / Cloudflare Firewall (403, 1020, region forbidden)
  if (
    msg.includes('country') ||
    msg.includes('location') ||
    msg.includes('region') ||
    msg.includes('not supported in your country') ||
    msg.includes('cloudflare') ||
    msg.includes('cf-ray') ||
    msg.includes('error 1020') ||
    msg.includes('access denied') ||
    (code === '403' && (msg.includes('forbidden') || msg.includes('blocked') || msg.includes('geoblock')))
  ) {
    return {
      code: DOCTOR_CODES.GEO_BLOCKED,
      title: 'Region or IP Blocked by Vendor Firewall',
      details: `The vendor (${p || 'provider'}) returned a geo-restriction or Cloudflare block.`,
      recommendation: 'Configure a dedicated SOCKS5 or HTTP proxy located in a supported region (US, EU, JP) in proxy settings.',
    }
  }

  // 2. Token Expired / Session Expired
  if (
    msg.includes('token_expired') ||
    msg.includes('jwt expired') ||
    msg.includes('invalid_grant') ||
    msg.includes('session expired') ||
    msg.includes('refresh token expired') ||
    msg.includes('token has expired') ||
    msg.includes('login_required')
  ) {
    return {
      code: DOCTOR_CODES.TOKEN_EXPIRED,
      title: 'OAuth Access or Refresh Token Expired',
      details: 'The stored OAuth credentials have expired and could not be refreshed automatically.',
      recommendation: 'Click "Connect" or "Device Login" to re-authorize the account and establish a fresh session.',
    }
  }

  // 3. Token Revoked / Bad Credentials
  if (
    msg.includes('token_revoked') ||
    msg.includes('revoked') ||
    msg.includes('account_deactivated') ||
    msg.includes('invalid_token') ||
    msg.includes('bad_credentials') ||
    code === 'TOKEN_REVOKED' ||
    (code === '401' && (msg.includes('unauthorized') || msg.includes('invalid api key') || msg.includes('incorrect api key')))
  ) {
    return {
      code: DOCTOR_CODES.TOKEN_REVOKED,
      title: 'Token Invalid or Revoked',
      details: 'The vendor rejected the API key or OAuth token as invalid or revoked.',
      recommendation: 'Re-issue a fresh session token, API key, or CLI credentials in the vendor dashboard and save it.',
    }
  }

  // 4. Missing Scope / Permissions
  if (
    msg.includes('insufficient_scope') ||
    msg.includes('missing_scope') ||
    msg.includes('scope required') ||
    msg.includes('permission_denied') ||
    msg.includes('model_not_found') ||
    msg.includes('not have access') ||
    msg.includes('license_required')
  ) {
    return {
      code: DOCTOR_CODES.MISSING_SCOPE,
      title: 'Missing Scope or Model Permissions',
      details: 'The account does not have sufficient entitlements or required scope permissions for this model.',
      recommendation: 'Check your organization role or subscription tier to ensure permissions and access to requested models is granted.',
    }
  }

  // 5. Quota Exhausted / Balance Zero
  if (
    msg.includes('insufficient_quota') ||
    msg.includes('exceeded your current quota') ||
    msg.includes('credit_balance_zero') ||
    msg.includes('billing_not_active') ||
    msg.includes('quota exceeded') ||
    msg.includes('run out of credits') ||
    code === 'QUOTA'
  ) {
    return {
      code: DOCTOR_CODES.QUOTA_EXHAUSTED,
      title: 'Subscription Quota or Credits Exhausted',
      details: 'The account has consumed 100% of its current billing cycle or token usage quota.',
      recommendation: 'Check your subscription billing dashboard or wait until the quota window resets.',
    }
  }

  // 6. Rate Limit / 429
  if (
    code === '429' ||
    code === 'RATE_LIMIT' ||
    msg.includes('too many requests') ||
    msg.includes('rate_limit') ||
    msg.includes('rate limit')
  ) {
    return {
      code: DOCTOR_CODES.RATE_LIMIT,
      title: 'Temporary Rate Limit Reached',
      details: 'The vendor is throttling requests (RPM/TPM limit reached) for this account.',
      recommendation: 'Account is placed in temporary cooldown. Requests will automatically route to another account.',
    }
  }

  // 7. Network / Proxy Connectivity
  if (
    msg.includes('econnrefused') ||
    msg.includes('etimedout') ||
    msg.includes('enotfound') ||
    msg.includes('fetch failed') ||
    msg.includes('socks') ||
    code === 'ENOTFOUND' ||
    code === 'ETIMEDOUT'
  ) {
    return {
      code: DOCTOR_CODES.PROXY_ERROR,
      title: 'Network or Proxy Connection Failure',
      details: 'Failed to establish TCP/TLS connection with the provider API or configured proxy server.',
      recommendation: 'Check server network access, DNS resolution, and verify the configured SOCKS/HTTP proxy is online.',
    }
  }

  return {
    code: DOCTOR_CODES.UNKNOWN,
    title: 'Unexpected Vendor Error',
    details: msg.slice(0, 200) || 'Unknown error occurred during vendor request.',
    recommendation: 'Review vendor API status or re-check account credentials.',
  }
}
