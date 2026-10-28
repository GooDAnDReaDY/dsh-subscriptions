import { inspectAccountCapabilities, normalizeCapabilitiesRequest } from './capabilities.js'
import { defaultConcurrencyQueue } from './concurrency-queue.js'
import { recordSessionCacheUsage } from './session-pin.js'
import { pickAccountWithTrace, markCooldown, isSwitchableError, isRegionError, isAuthError, modelFamily, earliestRecovery } from './rotate.js'
import { putInQuarantine, REASON_RATE_LIMIT, REASON_HARD_LIMIT, REASON_REVOKED, REASON_DEGRADED } from './quarantine.js'
import { notifySessionExpired, notifyQuarantineEntered } from './alerts.js'
import { withRunawayGuard } from './runaway-guard.js'
import { defaultErrorBuffer } from './error-buffer.js'
import { withSoftFailureSentinel } from './sentinel.js'
import { resolveAccurateReset, nextCooldownMs } from './reset-clock.js'

export async function* streamWithRotation({
  accounts,
  nowMs = () => Date.now(),
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
  concurrencyQueue = defaultConcurrencyQueue,
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
      model: options && options.model,
      onlyRef: options && options.onlyRef,
      defaultRef: options && options.defaultRef,
      family: modelFamily(options && options.provider, options && options.model),
      sessionId: options && options.sessionId,
      tag: options && options.tag,
      vip: options && options.vip,
      autoPacing: options && (options.autoPacing !== undefined ? options.autoPacing : (options.config && options.config.autoPacing)),
      drainBeforeReset: options && (options.drainBeforeReset !== undefined ? options.drainBeforeReset : (options.config && options.config.drainBeforeReset)),
      drainSafetyPercent: options && (options.drainSafetyPercent !== undefined ? options.drainSafetyPercent : (options.config && options.config.drainSafetyPercent)),
      rotationStrategy: options && (options.rotationStrategy !== undefined ? options.rotationStrategy : (options.config && options.config.rotationStrategy)),
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
      if (lastError) {
        const wait = nextCooldownMs(pool, nowMs())
        if (wait != null && options && options.rateLimitWait !== false) {
          const maxWait = Number(options.rateLimitMaxWaitMs) || 6 * 3600 * 1000
          lastError.retryAfterMs = Math.min(wait, maxWait)
          lastError.resetAt = nowMs() + lastError.retryAfterMs
        }
        lastError.recovery = lastError.recovery || earliestRecovery(pool, nowMs())
        throw lastError
      }
      const err = /** @type {Error & { code?: string, recovery?: any, onlyRef?: string }} */ (new Error('no usable subscription account for this provider'))
      err.code = 'RATE_LIMIT'
      err.recovery = earliestRecovery(pool, nowMs())
      if (options && options.onlyRef) err.onlyRef = options.onlyRef
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

    const queueKey = account.ref || account.id || 'default'
    const queueConfig = {
      signal: options && options.signal,
      timeoutMs: options && (options.queueTimeoutMs !== undefined ? options.queueTimeoutMs : (options.config && options.config.queueTimeoutMs)),
      maxConcurrency: account.maxConcurrency !== undefined
        ? account.maxConcurrency
        : (options && options.accountMaxConcurrency !== undefined
          ? options.accountMaxConcurrency
          : (options && options.config && options.config.accountMaxConcurrency !== undefined
            ? options.config.accountMaxConcurrency
            : 1)),
      maxQueueSize: account.maxQueueSize !== undefined
        ? account.maxQueueSize
        : (options && options.maxQueueSize !== undefined
          ? options.maxQueueSize
          : (options && options.config && options.config.maxQueueSize !== undefined
            ? options.config.maxQueueSize
            : 20)),
      enabled: options && (options.enableQueue !== undefined ? options.enableQueue : (options.config && options.config.enableQueue !== undefined ? options.config.enableQueue : true)),
    }

    let releaseSlot = null
    try {
      releaseSlot = await concurrencyQueue.acquire(queueKey, queueConfig)
    } catch (queueErr) {
      if (queueErr && (queueErr.code === 'ABORT_ERR' || queueErr.name === 'AbortError')) {
        currentAttempt.status = 'aborted'
        currentAttempt.error = queueErr.message
        syncTrace('aborted')
        throw queueErr
      }
      currentAttempt.status = queueErr && queueErr.code === 'QUEUE_OVERFLOW' ? 'queue_overflow' : 'queue_timeout'
      currentAttempt.error = queueErr ? queueErr.message : String(queueErr)
      lastError = queueErr
      continue
    }

    let firstChunkDelivered = false
    let regionRetries = 0

    try {
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
        const accountCaps = account.capabilities || inspectAccountCapabilities(account.provider || options?.provider, account, account)
        const adaptedOptions = normalizeCapabilitiesRequest(options, accountCaps)
        const guardedStream = withRunawayGuard(
          streamOnce(account, { ...adaptedOptions, _runawayState: runawayState }),
          runawayOpts
        )
        const sentineledStream = withSoftFailureSentinel(guardedStream, {
          enabled: (options?.enableSoftFailureSentinel !== false) && (options?.config?.enableSoftFailureSentinel !== false),
        })
        for await (const chunk of sentineledStream) {
          if (chunk && (chunk.type === 'text-delta' || chunk.type === 'delta' || chunk.text || chunk.content)) {
            firstChunkDelivered = true
          }
          const cachedTokens = Number(
            (chunk && chunk.usage && (chunk.usage.cacheReadTokens || chunk.usage.cachedTokens)) ||
            (chunk && chunk.tokens && (chunk.tokens.cacheRead || chunk.tokens.cached)) ||
            0
          )
          if (cachedTokens > 0 && options && options.sessionId) {
            recordSessionCacheUsage(options.sessionId, cachedTokens)
          }
          yield chunk
        }
        currentAttempt.status = 'success'
        syncTrace('success', { chosenRef: account.ref || account.id })
        return
      } catch (err) {
        lastError = err
        defaultErrorBuffer.record({
          provider: options && options.provider,
          ref: account.ref || account.id,
          model: options && options.model,
          status: err && (err.status || err.statusCode),
          code: err && (err.code || err.name),
          message: err && (err.message || String(err)),
        })
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

        if (!isSwitchableError(err) && !isAuthError(err)) {
          currentAttempt.status = 'fatal_error'
          currentAttempt.error = err ? (err.message || String(err)) : 'unknown'
          syncTrace('fatal_error')
          throw err
        }

        currentAttempt.status = 'switched'
        currentAttempt.switchError = err ? (err.code || err.status || err.message) : 'switchable'

        const accurateUntil = resolveAccurateReset(err, account, options && options.provider, nowMs())
        const isSoft = Boolean(err && (err.code === 'SOFT_FAILURE' || err.isSoftFailure))
        const isAuth = isAuthError(err)

        // Move slot to cooldown and quarantine (#172, #538)
        const effectiveCooldownMs = isSoft ? Math.min(cooldownMs, 5 * 60 * 1000) : (isAuth ? 86400000 : cooldownMs)
        const cooled = markCooldown(account, nowMs(), effectiveCooldownMs, modelFamily(options && options.provider, options && options.model), accurateUntil, options && options.model)
        account.cooldownUntil = cooled.cooldownUntil
        if (cooled.cooldownFamilies) account.cooldownFamilies = cooled.cooldownFamilies
        if (cooled.cooldownModels) account.cooldownModels = cooled.cooldownModels

        const status = Number(err && (err.status || err.statusCode) || 0)
        const code = String(err && err.code || '')
        const reason = isSoft
          ? REASON_DEGRADED
          : (isAuth || status === 401 || code === 'AUTH' || code === 'TOKEN_REVOKED')
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
          const quarantined = putInQuarantine(account, reason, nowMs(), accurateUntil || (nowMs() + (isAuth ? 86400000 : 3600000)))
          account.quarantineUntil = quarantined.quarantineUntil
          account.quarantineReason = quarantined.quarantineReason
          account.quarantineAttempts = (account.quarantineAttempts || 0) + 1
        }
        if (isAuth || reason === REASON_REVOKED) {
          account.isRevoked = true
        }

        currentAttempt.quarantineReason = account.quarantineReason || reason
        currentAttempt.quarantineUntil = account.quarantineUntil
        if (accurateUntil) {
          currentAttempt.accurateReset = true
          currentAttempt.resetAt = accurateUntil
        }

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
    } finally {
      if (typeof releaseSlot === 'function') {
        releaseSlot()
      }
    }
  }
}
