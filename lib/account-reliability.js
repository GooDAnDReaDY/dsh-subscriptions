function text(value) {
  return value == null ? '' : String(value).trim()
}

/**
 * #827: decide whether a stored credential is usable without exposing it.
 * Empty access/refresh tokens and non-finite expiry are treated as corrupt.
 */
export function credentialState(blob) {
  if (!blob || typeof blob !== 'object') return { usable: false, reason: 'invalid_blob' }
  const accessToken = text(blob.accessToken)
  const refreshToken = text(blob.refreshToken)
  if (!accessToken && !refreshToken && !text(blob.apiKey)) {
    return { usable: false, reason: 'empty_credentials' }
  }
  if (blob.expiresAt != null && blob.expiresAt !== '' && !Number.isFinite(Number(blob.expiresAt))) {
    return { usable: false, reason: 'invalid_expiry' }
  }
  return { usable: true, reason: null }
}

/**
 * #831: stable provider identity used for duplicate detection. Unknown
 * identities return null and must never be merged automatically.
 */
export function accountIdentityKey(provider, blob) {
  if (!blob || typeof blob !== 'object') return null
  const id = text(blob.email || blob.login || blob.accountId || blob.userId)
  if (!id) return null
  return `${text(provider).toLowerCase()}:${id.toLowerCase()}`
}

/**
 * #818: aliases are display-only. Resolve either a stable ref or a legacy
 * label within one provider back to the stable credential ref.
 */
export function resolveAccountRef(slots, provider, value) {
  const wanted = text(value)
  if (!wanted) return null
  const list = (Array.isArray(slots) ? slots : []).filter((slot) => slot && slot.provider === provider)
  const byIndex = Number(wanted)
  if (Number.isInteger(byIndex) && byIndex > 0) {
    return list.find((slot) => Number(slot.index) === byIndex)?.ref || null
  }
  return list.find((slot) => slot.ref === wanted || text(slot.label) === wanted)?.ref || null
}

/**
 * #806: a delayed refresh may only write when its credential lineage is
 * still current. A newer save/revoke bumps the version.
 */
export function refreshIsCurrent(currentVersion, expectedVersion) {
  return Number(currentVersion) === Number(expectedVersion)
}

/**
 * #833: deterministic host-env vs plugin-proxy precedence.
 * @param {{ hostProxy?: string, pluginProxy?: string, prefer?: 'host' | 'plugin' }} [options]
 */
export function proxyPrecedence(options = {}) {
  const prefer = options.prefer || 'host'
  const host = text(options.hostProxy)
  const plugin = text(options.pluginProxy)
  if (host && plugin && prefer === 'plugin') return { proxy: plugin, source: 'plugin', conflict: true }
  if (host) return { proxy: host, source: 'host', conflict: Boolean(plugin) }
  if (plugin) return { proxy: plugin, source: 'plugin', conflict: false }
  return { proxy: '', source: 'none', conflict: false }
}
