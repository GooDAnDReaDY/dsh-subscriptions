import { ignoreError } from './catch-log.js'
import { sanitizeSecrets } from './secret-scan.js'

export const DEFAULT_WARN_COOLDOWN_MS = 5 * 60 * 1000 // 5 minutes
const loops = new Map()

function getOrCreateEntry(opName) {
  let entry = loops.get(opName)
  if (!entry) {
    entry = {
      consecutiveFailures: 0,
      totalFailures: 0,
      totalSuccesses: 0,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastError: null,
      lastWarnAt: 0,
    }
    loops.set(opName, entry)
  }
  return entry
}

export function recordLoopSuccess(opName) {
  const entry = getOrCreateEntry(opName)
  entry.consecutiveFailures = 0
  entry.totalSuccesses++
  entry.lastSuccessAt = Date.now()
}

export function recordLoopFailure(opName, err, { logger = null, cooldownMs = DEFAULT_WARN_COOLDOWN_MS } = {}) {
  const entry = getOrCreateEntry(opName)
  entry.consecutiveFailures++
  entry.totalFailures++
  const now = Date.now()
  entry.lastFailureAt = now
  const rawMsg = String(err && err.message || err || 'Unknown loop error')
  entry.lastError = sanitizeSecrets(rawMsg).slice(0, 300)

  ignoreError('loop:' + opName, err)

  if (logger && typeof logger.warn === 'function') {
    if (now - entry.lastWarnAt >= cooldownMs) {
      entry.lastWarnAt = now
      logger.warn('[dsh-subscriptions] background loop \'' + opName + '\' failed (x' + entry.consecutiveFailures + '): ' + entry.lastError)
    }
  }
}

export function safeLoop(opName, target, opts = {}) {
  if (typeof target === 'function') {
    try {
      const res = target()
      if (res && typeof res.then === 'function') {
        return res
          .then((val) => {
            recordLoopSuccess(opName)
            return val
          })
          .catch((err) => {
            recordLoopFailure(opName, err, opts)
            return undefined
          })
      }
      recordLoopSuccess(opName)
      return res
    } catch (err) {
      recordLoopFailure(opName, err, opts)
      return undefined
    }
  }
  if (target && typeof target.then === 'function') {
    return target
      .then((val) => {
        recordLoopSuccess(opName)
        return val
      })
      .catch((err) => {
        recordLoopFailure(opName, err, opts)
        return undefined
      })
  }
  recordLoopSuccess(opName)
  return target
}

export function getLoopHealthReport(failureThreshold = 3) {
  const result = {}
  const failing = []
  let healthy = true

  for (const [op, entry] of loops.entries()) {
    result[op] = {
      consecutiveFailures: entry.consecutiveFailures,
      totalFailures: entry.totalFailures,
      totalSuccesses: entry.totalSuccesses,
      lastSuccessAt: entry.lastSuccessAt,
      lastFailureAt: entry.lastFailureAt,
      lastError: entry.lastError,
    }
    if (entry.consecutiveFailures >= failureThreshold) {
      healthy = false
      failing.push(op)
    }
  }

  return {
    healthy,
    failingLoops: failing,
    loops: result,
  }
}

export function isLoopHealthy(opName, failureThreshold = 3) {
  const entry = loops.get(opName)
  if (!entry) return true
  return entry.consecutiveFailures < failureThreshold
}

export function resetLoopHealth() {
  loops.clear()
}
