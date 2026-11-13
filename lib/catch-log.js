const MAX = 100
const ignored = []
let sink = null

export function setCatchLogger(logger) {
  sink = logger && typeof logger.debug === 'function' ? logger : null
}

export function ignoreError(label, err) {
  const entry = {
    at: Date.now(),
    label: String(label || 'optional'),
    message: String(err && err.message || err || '').slice(0, 300),
  }
  ignored.push(entry)
  if (ignored.length > MAX) ignored.shift()
  if (sink) {
    try {
      sink.debug(`[dsh-subscriptions] ignored ${entry.label}: ${entry.message}`)
    } catch (diagErr) {
      ignored.push({ at: Date.now(), label: 'catch-log: debug sink failed', message: String(diagErr && diagErr.message || diagErr || '').slice(0, 300) })
    }
  }
}

export function ignoreErr(label) {
  return function onIgnoredError(err) {
    ignoreError(label, err)
  }
}

export function bestEffort(label, target) {
  if (typeof target === 'function') {
    try {
      const res = target()
      if (res && typeof res.then === 'function') {
        return res.catch((err) => {
          ignoreError(label, err)
        })
      }
      return res
    } catch (err) {
      ignoreError(label, err)
      return undefined
    }
  }
  if (target && typeof target.then === 'function') {
    return target.catch((err) => {
      ignoreError(label, err)
    })
  }
  return target
}

export function getIgnoredErrors(limit = 50) {
  return ignored.slice(-Math.max(1, Number(limit) || 50)).reverse()
}

export function clearIgnoredErrors() {
  ignored.length = 0
}
