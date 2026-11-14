import { ignoreError } from './catch-log.js'

// #1059: master-key resolution for credentials encrypted at rest. Extracted so
// the account store keeps a single responsibility per section.
export function createMasterKeyResolver(getConfig) {
  function resolve(passedCfg = null) {
    const envKey = process.env.DSH_SUBSCRIPTIONS_MASTER_KEY
    if (typeof envKey === 'string' && envKey.trim()) return envKey.trim()
    if (passedCfg && typeof passedCfg.masterKey === 'string' && passedCfg.masterKey.trim()) {
      return passedCfg.masterKey.trim()
    }
    return ''
  }

  function current() {
    let cfg = null
    try {
      cfg = typeof getConfig === 'function' ? getConfig() : null
    } catch (err) { ignoreError('account-master-key.js: keep env-only fallback', err) }
    return resolve(cfg)
  }

  return { resolve, current }
}
