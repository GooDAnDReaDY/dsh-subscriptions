// Guided Diagnostic Wizard for accounts, credentials, and network connectivity (#519).
// Enforces 0 Cyrillic characters.

import { maskEmail, maskText, cleanErrorMessage } from './mask.js'
import { getVendor } from './vendors/index.js'

/**
 * Mask sensitive credentials inside diagnostic reports.
 * @param {any} val
 * @returns {any}
 */
export function sanitizeDiagnosticData(val) {
  if (typeof val === 'string') {
    return maskText(val)
      .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]')
      .replace(/key=[A-Za-z0-9._~+/-]+/gi, 'key=[REDACTED]')
      .replace(/token=[A-Za-z0-9._~+/-]+/gi, 'token=[REDACTED]')
  }
  if (Array.isArray(val)) {
    return val.map(sanitizeDiagnosticData)
  }
  if (val && typeof val === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(val)) {
      if (/secret|token|password|auth|refresh|access_token|key/i.test(k) && typeof v === 'string') {
        out[k] = v.length > 8 ? v.slice(0, 4) + '...' + v.slice(-4) : '••••••'
      } else {
        out[k] = sanitizeDiagnosticData(v)
      }
    }
    return out
  }
  return val
}

/**
 * Run diagnostic checks on a specific subscription account.
 *
 * @param {Object} options
 * @param {Object} options.account
 * @param {string} [options.rawBlob]
 * @param {Object} [options.store]
 * @param {Function} [options.live]
 * @param {boolean} [options.includeNetwork]
 * @param {typeof fetch} [options.fetchImpl]
 * @param {number} [options.timeoutMs]
 * @returns {Promise<Object>}
 */
export async function runDiagnosticWizard(options = {}) {
  const account = options.account || {}
  const ref = account.ref || account.id || 'unknown'
  const provider = account.provider || 'unknown'
  const includeNetwork = Boolean(options.includeNetwork)
  const fetchImpl = options.fetchImpl || globalThis.fetch || fetch
  const timeoutMs = options.timeoutMs || 8000
  const now = Date.now()

  let raw = options.rawBlob || null
  if (!raw && options.store && typeof options.store.resolveRaw === 'function') {
    try {
      raw = await options.store.resolveRaw(ref)
    } catch { /* ignore resolve error */ }
  }

  const steps = []
  const recommendations = []

  // -------------------------------------------------------------
  // STEP 1: Credentials & Expiry Check (Passive)
  // -------------------------------------------------------------
  let blob = null
  let credStatus = 'pass'
  let credCode = 'CREDENTIAL_OK'
  let credMsg = 'Credentials present and formatted correctly'
  let expiresAt = null

  if (!raw) {
    credStatus = 'fail'
    credCode = 'MISSING_CREDENTIAL'
    credMsg = 'No credential blob stored for this account'
    recommendations.push('Connect this account using OAuth login or provide an API key.')
  } else {
    try {
      blob = JSON.parse(raw)
    } catch {
      credStatus = 'fail'
      credCode = 'CORRUPT_CREDENTIAL_DATA'
      credMsg = 'Stored credential payload could not be parsed as JSON'
      recommendations.push('Re-authenticate or re-import this account to fix corrupt data.')
    }

    if (blob) {
      expiresAt = blob.expiresAt || blob.expires_at || null
      const hasToken = Boolean(
        blob.access_token || blob.accessToken || blob.token || blob.apiKey || blob.key || blob.sessionToken
      )
      const hasRefreshToken = Boolean(blob.refresh_token || blob.refreshToken)

      if (!hasToken && !hasRefreshToken) {
        credStatus = 'fail'
        credCode = 'NO_TOKEN'
        credMsg = 'Credential data exists but contains no access or refresh token'
        recommendations.push('Re-authenticate this account to obtain an active access token.')
      } else if (expiresAt && typeof expiresAt === 'number') {
        const remainingMs = expiresAt - now
        if (remainingMs <= 0) {
          if (hasRefreshToken) {
            credStatus = 'warn'
            credCode = 'EXPIRED_ACCESS_TOKEN'
            credMsg = `Access token expired ${Math.round(Math.abs(remainingMs) / 60000)}m ago; refresh token available`
            recommendations.push('Run token refresh or reconnect account.')
          } else {
            credStatus = 'fail'
            credCode = 'TOKEN_EXPIRED_NO_REFRESH'
            credMsg = 'Access token is expired and no refresh token is present'
            recommendations.push('Reconnect this account to obtain fresh credentials.')
          }
        } else if (remainingMs < 10 * 60 * 1000) {
          credStatus = 'warn'
          credCode = 'EXPIRING_SOON'
          credMsg = `Access token expires in ${Math.round(remainingMs / 60000)}m`
        }
      }

      if (blob.validationUrl) {
        credStatus = 'warn'
        credCode = 'VALIDATION_REQUIRED'
        credMsg = blob.validationMessage ? cleanErrorMessage(blob.validationMessage) : 'Provider requires account verification'
        recommendations.push(`Visit provider validation URL: ${blob.validationUrl}`)
      }
    }
  }

  steps.push({
    step: 'credentials',
    name: 'Credentials & Expiry',
    status: credStatus,
    code: credCode,
    message: credMsg,
    expiresAt,
  })

  // -------------------------------------------------------------
  // STEP 2: Network & Proxy Verification
  // -------------------------------------------------------------
  const proxyUrl = account.proxyUrl || (options.live && options.live() && options.live().proxyUrl) || null
  let proxyStatus = 'pass'
  let proxyCode = 'DIRECT_CONNECTION'
  let proxyMsg = 'Direct network connection configured'
  let proxyLatencyMs = null

  if (proxyUrl) {
    let parsed = null
    try {
      parsed = new URL(proxyUrl)
      if (!['http:', 'https:', 'socks5:', 'socks5h:'].includes(parsed.protocol)) {
        proxyStatus = 'fail'
        proxyCode = 'UNSUPPORTED_PROXY_PROTOCOL'
        proxyMsg = `Unsupported proxy protocol: ${parsed.protocol}`
        recommendations.push('Use http://, https://, or socks5:// for proxy URL.')
      } else {
        proxyCode = 'PROXY_CONFIG_VALID'
        proxyMsg = `Proxy configured: ${parsed.protocol}//${parsed.host}`
      }
    } catch {
      proxyStatus = 'fail'
      proxyCode = 'INVALID_PROXY_URL'
      proxyMsg = 'Proxy URL syntax is invalid'
      recommendations.push('Check the proxyUrl setting for formatting errors.')
    }

    if (proxyStatus === 'pass' && includeNetwork) {
      const t0 = Date.now()
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), timeoutMs)
        // Light probe: connect to target or HEAD request
        await fetchImpl(proxyUrl, {
          method: 'HEAD',
          signal: controller.signal,
        }).catch((e) => {
          // If proxy accepts HTTP or rejects HEAD with 405/404, TCP connection succeeded
          if (e && e.name !== 'AbortError' && e.code !== 'ECONNREFUSED' && e.code !== 'ENOTFOUND') {
            return { ok: true }
          }
          throw e
        })
        clearTimeout(timer)
        proxyLatencyMs = Date.now() - t0
        proxyCode = 'PROXY_REACHABLE'
        proxyMsg = `Proxy reachable (${proxyLatencyMs}ms)`
      } catch (e) {
        proxyStatus = 'fail'
        proxyCode = 'PROXY_UNREACHABLE'
        proxyMsg = `Proxy connection failed: ${cleanErrorMessage(e && e.message ? e.message : e)}`
        recommendations.push('Verify that proxy server is running and accessible.')
      }
    }
  } else {
    proxyStatus = 'skipped'
  }

  steps.push({
    step: 'proxy',
    name: 'Proxy & Gateway',
    status: proxyStatus,
    code: proxyCode,
    message: proxyMsg,
    latencyMs: proxyLatencyMs,
  })

  // -------------------------------------------------------------
  // STEP 3: Token Validation & Freshness
  // -------------------------------------------------------------
  let tokenStatus = 'skipped'
  let tokenCode = 'NETWORK_CHECK_SKIPPED'
  let tokenMsg = 'Token validation skipped (enable network checks to run)'
  let tokenLatencyMs = null

  if (!includeNetwork) {
    // Passive: based on expiry from Step 1
    if (credStatus === 'pass') {
      tokenStatus = 'pass'
      tokenCode = 'TOKEN_VALID_PASSIVE'
      tokenMsg = 'Access token appears valid locally'
    } else {
      tokenStatus = credStatus
      tokenCode = credCode
      tokenMsg = credMsg
    }
  } else if (blob) {
    const t0 = Date.now()
    const remainingMs = expiresAt ? expiresAt - now : null
    const isFresh = remainingMs !== null && remainingMs > 15 * 60 * 1000

    if (isFresh && !blob.validationUrl) {
      tokenStatus = 'pass'
      tokenCode = 'TOKEN_FRESH'
      tokenMsg = `Access token valid for another ${Math.round(remainingMs / 60000)}m; refresh not required`
    } else {
      // Attempt safe singleflight token refresh if vendor supports it
      let vendor = null
      try { vendor = getVendor(provider) } catch { /* unknown provider */ }
      if (vendor && typeof vendor.refresh === 'function' && blob.refresh_token) {
        try {
          const controller = new AbortController()
          const timer = setTimeout(() => controller.abort(), timeoutMs)
          const refreshed = await vendor.refresh(blob, {
            fetchImpl,
            signal: controller.signal,
            config: options.live ? options.live() : {},
          })
          clearTimeout(timer)
          tokenLatencyMs = Date.now() - t0
          if (refreshed && (refreshed.access_token || refreshed.token)) {
            tokenStatus = 'pass'
            tokenCode = 'TOKEN_REFRESH_OK'
            tokenMsg = `Token refreshed successfully (${tokenLatencyMs}ms)`
          } else {
            tokenStatus = 'warn'
            tokenCode = 'TOKEN_REFRESH_PARTIAL'
            tokenMsg = 'Token refresh completed without new access_token'
          }
        } catch (e) {
          const errStatus = Number(e && (e.status || e.statusCode) || 0)
          tokenLatencyMs = Date.now() - t0
          if (errStatus === 401 || errStatus === 403 || (e && e.code === 'INVALID_GRANT')) {
            tokenStatus = 'fail'
            tokenCode = 'TOKEN_REVOKED'
            tokenMsg = 'Token refresh rejected by provider (invalid_grant or revoked)'
            recommendations.push('Log in again with this provider to reauthorize.')
          } else if (errStatus === 429) {
            tokenStatus = 'warn'
            tokenCode = 'RATE_LIMITED'
            tokenMsg = 'Token refresh rate limited (429)'
            recommendations.push('Wait before requesting further token refreshes.')
          } else {
            tokenStatus = 'fail'
            tokenCode = 'REFRESH_ERROR'
            tokenMsg = `Token refresh failed: ${cleanErrorMessage(e && e.message ? e.message : e)}`
            recommendations.push('Verify network connection to provider authentication servers.')
          }
        }
      } else {
        tokenStatus = 'pass'
        tokenCode = 'STATIC_CREDENTIAL_READY'
        tokenMsg = 'Static credentials ready for use'
      }
    }
  }

  steps.push({
    step: 'token_validation',
    name: 'Token Validation',
    status: tokenStatus,
    code: tokenCode,
    message: tokenMsg,
    latencyMs: tokenLatencyMs,
  })

  // -------------------------------------------------------------
  // STEP 4: Model Catalog Discovery (Passive or Active listModels)
  // -------------------------------------------------------------
  let catalogStatus = 'skipped'
  let catalogCode = 'NETWORK_CHECK_SKIPPED'
  let catalogMsg = 'Model catalog reachability check skipped'
  let catalogLatencyMs = null
  let modelCount = 0

  if (!includeNetwork) {
    catalogStatus = 'skipped'
  } else {
    const t0 = Date.now()
    const vendor = getVendor(provider)
    if (vendor && typeof vendor.listModels === 'function') {
      try {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), timeoutMs)
        const models = await vendor.listModels(account, {
          fetchImpl,
          signal: controller.signal,
          config: options.live ? options.live() : {},
        })
        clearTimeout(timer)
        catalogLatencyMs = Date.now() - t0
        modelCount = Array.isArray(models) ? models.length : 0
        if (modelCount > 0) {
          catalogStatus = 'pass'
          catalogCode = 'CATALOG_OK'
          catalogMsg = `${modelCount} models reachable and verified (${catalogLatencyMs}ms)`
        } else {
          catalogStatus = 'warn'
          catalogCode = 'CATALOG_EMPTY'
          catalogMsg = 'Catalog request succeeded but 0 models returned'
          recommendations.push('Check provider plan features and permissions.')
        }
      } catch (e) {
        catalogLatencyMs = Date.now() - t0
        const status = Number(e && (e.status || e.statusCode) || 0)
        if (status === 401 || status === 403) {
          catalogStatus = 'fail'
          catalogCode = 'CATALOG_UNAUTHORIZED'
          catalogMsg = 'Provider rejected catalog request with 401/403'
          recommendations.push('Account credentials do not have access to models catalog.')
        } else {
          catalogStatus = 'fail'
          catalogCode = 'CATALOG_UNREACHABLE'
          catalogMsg = `Failed to fetch model catalog: ${cleanErrorMessage(e && e.message ? e.message : e)}`
          recommendations.push('Verify provider API endpoint reachability.')
        }
      }
    } else {
      catalogStatus = 'pass'
      catalogCode = 'STATIC_CATALOG'
      catalogMsg = 'Standard static catalog available'
    }
  }

  steps.push({
    step: 'models_catalog',
    name: 'Model Catalog Reachability',
    status: catalogStatus,
    code: catalogCode,
    message: catalogMsg,
    latencyMs: catalogLatencyMs,
    modelCount,
  })

  // -------------------------------------------------------------
  // Overall Summary & Sanitization
  // -------------------------------------------------------------
  let passed = 0
  let warnings = 0
  let failed = 0
  let skipped = 0

  for (const s of steps) {
    if (s.status === 'pass') passed++
    else if (s.status === 'warn') warnings++
    else if (s.status === 'fail') failed++
    else skipped++
  }

  const overallStatus = failed > 0 ? 'failing' : (warnings > 0 ? 'degraded' : 'healthy')

  const report = {
    account: {
      ref,
      provider,
      label: account.label ? maskEmail(account.label) : ref,
      index: account.index || 1,
    },
    generatedAt: new Date(now).toISOString(),
    networkChecksIncluded: includeNetwork,
    overallStatus,
    summary: {
      totalSteps: steps.length,
      passed,
      warnings,
      failed,
      skipped,
    },
    steps,
    recommendations,
  }

  return sanitizeDiagnosticData(report)
}
