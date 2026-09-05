import { pickAccount, markCooldown, isSwitchableError, modelFamily } from './rotate.js'
import { putInQuarantine, REASON_RATE_LIMIT, REASON_HARD_LIMIT, REASON_REVOKED } from './quarantine.js'

export async function* streamWithRotation({
  accounts,
  nowMs,
  cooldownMs,
  switchAtRemaining,
  streamOnce,
  options,
  onCooldown,
  offlineFallback, // #174: optional fallback generator if all accounts exhausted
}) {
  const pool = (accounts || []).map((account) => ({ ...account }))
  let lastError = null
  const tried = new Set()

  while (true) {
    const account = pickAccount(pool, nowMs(), {
      switchAtRemaining,
      family: modelFamily(options && options.provider, options && options.model),
      sessionId: options && options.sessionId,
      tag: options && options.tag,
      vip: options && options.vip,
    })

    if (!account || tried.has(account.ref || account.id)) {
      if (offlineFallback) {
        // #174 Local Mock Server Offline Fallback
        yield* offlineFallback(options, lastError)
        return
      }
      if (lastError) throw lastError
      const err = new Error('no usable subscription account for this provider')
      err.code = 'RATE_LIMIT'
      throw err
    }

    tried.add(account.ref || account.id)

    let firstChunkDelivered = false
    try {
      for await (const chunk of streamOnce(account, options)) {
        firstChunkDelivered = true
        yield chunk
      }
      return
    } catch (err) {
      lastError = err
      // If chunks were already yielded to the caller, never rotate mid-stream
      // as that would repeat or scramble generated tokens.
      if (firstChunkDelivered) throw err
      if (!isSwitchableError(err)) throw err

      // Move slot to cooldown and quarantine (#172)
      const cooled = markCooldown(account, nowMs(), cooldownMs, modelFamily(options && options.provider, options && options.model))
      account.cooldownUntil = cooled.cooldownUntil
      if (cooled.cooldownFamilies) account.cooldownFamilies = cooled.cooldownFamilies

      const status = Number(err && (err.status || err.statusCode) || 0)
      const code = String(err && err.code || '')
      const reason = (status === 401 || code === 'AUTH' || code === 'TOKEN_REVOKED')
        ? REASON_REVOKED
        : (status === 403 || code === 'HARD_LIMIT' || code === 'LICENSE_REQUIRED')
          ? REASON_HARD_LIMIT
          : REASON_RATE_LIMIT

      const quarantined = putInQuarantine(account, reason, nowMs())
      account.quarantineUntil = quarantined.quarantineUntil
      account.quarantineReason = quarantined.quarantineReason

      if (onCooldown) onCooldown(account)
      // Loop continues seamlessly to next slot if no chunk was delivered yet
    }
  }
}
