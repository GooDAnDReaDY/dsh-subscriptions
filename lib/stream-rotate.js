import { pickAccount, markCooldown, isSwitchableError, modelFamily } from './rotate.js'

export async function* streamWithRotation({
  accounts,
  nowMs,
  cooldownMs,
  switchAtRemaining,
  streamOnce,
  options,
  onCooldown,
}) {
  const pool = (accounts || []).map((account) => ({ ...account }))
  let lastError = null
  const tried = new Set()
  while (true) {
    const account = pickAccount(pool, nowMs(), { switchAtRemaining, family: modelFamily(options && options.provider, options && options.model) })
    if (!account) {
      if (lastError) throw lastError
      const err = new Error('no usable subscription account for this provider')
      err.code = 'AUTH'
      throw err
    }
    if (tried.has(account.ref)) {
      if (lastError) throw lastError
      const err = new Error('all subscription accounts failed')
      err.code = 'RATE_LIMIT'
      throw err
    }
    tried.add(account.ref)
    try {
      yield* streamOnce(account, options)
      return
    } catch (err) {
      lastError = err
      if (!isSwitchableError(err)) throw err
      const cooled = markCooldown(account, nowMs(), cooldownMs, modelFamily(options && options.provider, options && options.model))
      account.cooldownUntil = cooled.cooldownUntil
      if (cooled.cooldownFamilies) account.cooldownFamilies = cooled.cooldownFamilies
      if (onCooldown) onCooldown(account)
    }
  }
}

