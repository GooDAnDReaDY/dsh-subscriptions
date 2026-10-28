function statusOf(err) {
  return Number(err && (err.status || err.statusCode)) || 0
}

/** #822: do not retry ambiguous image/video failures. */
export function classifyMediaFailure(err) {
  const status = statusOf(err)
  const code = String(err && err.code || '').toUpperCase()
  if (code === 'ABORT_ERR' || code === 'CANCELED' || code === 'CANCELLED') return 'cancelled'
  if (code === 'AMBIGUOUS' || code === 'TIMEOUT_AFTER_SUBMIT') return 'ambiguous'
  if (status === 401 || status === 403 || status === 400 || status === 422) return 'fatal'
  if (status === 429 || status === 408 || status >= 500) return 'retryable'
  if (code === 'TIMEOUT' || code === 'EMPTY_RESPONSE' || code === 'NETWORK') return 'retryable'
  return 'fatal'
}

export function shouldRetryMedia(err, attempt, maxRetries = 0) {
  if (Number(attempt) >= Number(maxRetries)) return false
  return classifyMediaFailure(err) === 'retryable'
}

/** #800: conservative media-pool selection. */
export function selectMediaAccount(accounts, { nowMs = Date.now(), defaultRef = null, exclude = [] } = {}) {
  const skip = new Set(exclude)
  const usable = (Array.isArray(accounts) ? accounts : []).filter((account) => {
    if (!account || !account.hasToken || skip.has(account.ref)) return false
    if (account.poolEnabled === false) return false
    if (account.cooldownUntil && Number(account.cooldownUntil) > nowMs) return false
    if (account.quarantineUntil && Number(account.quarantineUntil) > nowMs) return false
    if (account.usagePercent != null && Number(account.usagePercent) >= 100) return false
    return true
  })
  if (!usable.length) return null
  return usable.find((account) => account.ref === defaultRef) || usable[0]
}

/** #809: per-provider tool policy. */
export function resolveToolPolicy(config, provider) {
  const defaults = { web: true, image: true, video: true, search: true, tools: true }
  const all = config && config.toolPolicies
  const row = all && typeof all === 'object' ? all[provider] : null
  if (!row || typeof row !== 'object') return defaults
  return Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, row[key] === undefined ? value : Boolean(row[key])]))
}

export function toolAllowed(config, provider, kind) {
  return resolveToolPolicy(config, provider)[kind] !== false
}
