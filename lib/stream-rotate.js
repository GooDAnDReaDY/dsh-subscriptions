import { pickAccountWithTrace, markCooldown, isSwitchableError, isRegionError, modelFamily } from './rotate.js'
import { putInQuarantine, REASON_RATE_LIMIT, REASON_HARD_LIMIT, REASON_REVOKED } from './quarantine.js'
import { notifySessionExpired, notifyQuarantineEntered } from './alerts.js'
import { withRunawayGuard } from './runaway-guard.js'

export async function* streamWithRotation({
  accounts,
  nowMs,
  cooldownMs,
  switchAtRemaining,
  streamOnce,
  options,
  onCooldown,
  onDecisionTrace,
  cascadeFallback, // #349: optional cross-vendor cascading fallback generator
  offlineFallback, // #174: optional fallback generator if all accounts exhausted
  webhookUrl,
  fetchImpl = fetch,
}) {
  const pool = (accounts || []).map((account) => ({ ...account }))
  let lastError = null
  const tried = new Set()

  const decisionTrace = {
    sessionId: options && options.sessionId,
    provider: options && options.provider,
    model: options && options.model,
    attempts: [],
    finalOutcome: null,
    chosenRef: null,
  }

  const syncTrace = (outcome, extra = {}) => {
    decisionTrace.finalOutcome = outcome
    Object.assign(decisionTrace, extra)
    if (options && options._decisionTrace) {
      Object.assign(options._decisionTrace, decisionTrace)
    }
    if (typeof onDecisionTrace === 'function') {
      try { onDecisionTrace(decisionTrace) } catch { /* ignore trace callback error */ }
    }
  }

  while (true) {
    const pickRes = pickAccountWithTrace(pool, nowMs(), {
      switchAtRemaining,
      family: modelFamily(options && options.provider, options && options.model),
      sessionId: options && options.sessionId,
      tag: options && options.tag,
      vip: options && options.vip,
      autoPacing: options && (options.autoPacing !== undefined ? options.autoPacing : (options.config && options.config.autoPacing)),
      drainBeforeReset: options && (options.drainBeforeReset !== undefined ? options.drainBeforeReset : (options.config && options.config.drainBeforeReset)),
      drainSafetyPercent: options && (options.drainSafetyPercent !== undefined ? options.drainSafetyPercent : (options.config && options.config.drainSafetyPercent)),
    })
    const account = pickRes.account

    if (!account || tried.has(account.ref || account.id)) {
      if (cascadeFallback) {
        // #349 Cascading Cross-Vendor Fallback (#517 trace)
        decisionTrace.attempts.push({
          attempt: decisionTrace.attempts.length + 1,
          kind: 'cascade_fallback',
          reason: 'primary_pool_exhausted',
          lastError: lastError ? (lastError.code || lastError.message) : null,
        })
        syncTrace('cascade_fallback')
        yield* cascadeFallback(options, lastError)
        return
      }
      if (offlineFallback) {
        // #174 Local Mock Server Offline Fallback (#517 trace)
        decisionTrace.attempts.push({
          attempt: decisionTrace.attempts.length + 1,
          kind: 'offline_fallback',
          reason: 'all_accounts_exhausted',
          lastError: lastError ? (lastError.code || lastError.message) : null,
        })
        syncTrace('offline_fallback')
        yield* offlineFallback(options, lastError)
        return
      }
      syncTrace('exhausted')
      if (lastError) throw lastError
      const err = /** @type {Error & { code?: string }} */ (new Error('no usable subscription account for this provider'))
      err.code = 'RATE_LIMIT'
      throw err
    }

    const currentAttempt = {
      attempt: decisionTrace.attempts.length + 1,
      ref: account.ref || account.id,
      decisionReason: pickRes.trace.decisionReason,
      tier: pickRes.trace.tier,
      selectionMetrics: pickRes.trace.selectionMetrics,
      evaluations: pickRes.trace.evaluations,
      status: 'pending',
    }
    decisionTrace.attempts.push(currentAttempt)
    decisionTrace.chosenRef = account.ref || account.id

    tried.add(account.ref || account.id)

    let firstChunkDelivered = false
    let regionRetries = 0

    while (true) {
      try {
        const runawayState = options && options._runawayState ? options._runawayState : { tripped: false, reason: null }
        const runawayOpts = {
          ...(options && options.runawayGuard),
          onRunaway: (reason) => {
            runawayState.tripped = true
            runawayState.reason = reason
          },
        }
        const guardedStream = withRunawayGuard(
          streamOnce(account, { ...options, _runawayState: runawayState }),
          runawayOpts
        )
        for await (const chunk of guardedStream) {
          firstChunkDelivered = true
          yield chunk
        }
        currentAttempt.status = 'success'
        syncTrace('success', { chosenRef: account.ref || account.id })
        return
      } catch (err) {
        lastError = err
        // If chunks were already yielded to the caller, never rotate mid-stream
        // as that would repeat or scramble generated tokens.
        if (firstChunkDelivered) throw err

        // Transient region 400 error: retry same account up to 2 times before rotating (#391 / GH #9)
        if (isRegionError(err) && regionRetries < 2 && (!options || !options.signal || !options.signal.aborted)) {
          regionRetries++
          currentAttempt.regionRetries = regionRetries
          await new Promise((r) => setTimeout(r, 400 * regionRetries))
          if (options && options.signal && options.signal.aborted) throw err
          continue
        }

        if (!isSwitchableError(err)) {
          currentAttempt.status = 'fatal_error'
          currentAttempt.error = err ? (err.message || String(err)) : 'unknown'
          syncTrace('fatal_error')
          throw err
        }

        currentAttempt.status = 'switched'
        currentAttempt.switchError = err ? (err.code || err.status || err.message) : 'switchable'

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

        if (err && err.isWarmupProbeFailure && err.warmupAccount) {
          account.quarantineUntil = err.warmupAccount.quarantineUntil
          account.quarantineReason = err.warmupAccount.quarantineReason
          account.quarantineAttempts = err.warmupAccount.quarantineAttempts
          account.status = err.warmupAccount.status
        } else {
          const quarantined = putInQuarantine(account, reason, nowMs())
          account.quarantineUntil = quarantined.quarantineUntil
          account.quarantineReason = quarantined.quarantineReason
          account.quarantineAttempts = (account.quarantineAttempts || 0) + 1
        }

        currentAttempt.quarantineReason = account.quarantineReason || reason
        currentAttempt.quarantineUntil = account.quarantineUntil

        try {
          notifyQuarantineEntered({
            ref: account.ref,
            provider: options && options.provider,
            reason: account.quarantineReason || reason,
            until: account.quarantineUntil,
            webhookUrl: webhookUrl || (options && options.webhookUrl),
            fetchImpl,
            nowMs: nowMs(),
          })
        } catch { /* fire-and-forget alert */ }

        if (reason === REASON_REVOKED) {
          try {
            notifySessionExpired({
              ref: account.ref,
              provider: options && options.provider,
              message: err && err.message,
              webhookUrl: webhookUrl || (options && options.webhookUrl),
              fetchImpl,
              nowMs: nowMs(),
            })
          } catch { /* fire-and-forget alert */ }
        }

        if (onCooldown) onCooldown(account)
        // Break inner retry loop to continue to next account in outer while (true) loop
        break
      }
    }
  }
}
