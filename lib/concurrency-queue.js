// Concurrency limiting, bounded queue, and cooperative cancellation per account/provider.
// Standardized error codes: QUEUE_OVERFLOW, QUEUE_TIMEOUT, ABORT_ERR, QUEUE_DISPOSED.

/**
 * @param {string} message
 * @param {string} code
 * @param {number} [status]
 * @returns {Error & { code: string, status?: number }}
 */
function createQueueError(message, code, status) {
  const err = /** @type {Error & { code: string, status?: number }} */ (new Error(message))
  err.code = code
  if (status !== undefined) err.status = status
  return err
}

export class ConcurrencyQueue {
  constructor(options = {}) {
    this.maxConcurrency = options.maxConcurrency !== undefined ? Number(options.maxConcurrency) : 2
    this.maxQueueSize = options.maxQueueSize !== undefined ? Number(options.maxQueueSize) : 20
    this.timeoutMs = options.timeoutMs !== undefined ? Number(options.timeoutMs) : 30000
    this.enabled = options.enabled !== undefined ? Boolean(options.enabled) : true

    /** @type {Map<string, number>} */
    this._active = new Map()
    /** @type {Map<string, Array<{ id: string, resolve: Function, reject: Function, timer: any, signal: any, abortHandler: Function | null, enqueuedAt: number }>>} */
    this._waiting = new Map()

    this._stats = {
      totalAcquired: 0,
      totalReleased: 0,
      totalQueued: 0,
      totalTimedOut: 0,
      totalOverflowed: 0,
      totalAborted: 0,
    }
  }

  configure(options = {}) {
    if (options.maxConcurrency !== undefined) this.maxConcurrency = Number(options.maxConcurrency)
    if (options.maxQueueSize !== undefined) this.maxQueueSize = Number(options.maxQueueSize)
    if (options.timeoutMs !== undefined) this.timeoutMs = Number(options.timeoutMs)
    if (options.enabled !== undefined) this.enabled = Boolean(options.enabled)
  }

  async acquire(key = 'default', options = {}) {
    if (!this.enabled) {
      return () => {}
    }

    const signal = options.signal
    if (signal && signal.aborted) {
      const err = createQueueError('Request aborted before acquiring queue slot', 'ABORT_ERR')
      err.name = 'AbortError'
      this._stats.totalAborted++
      throw err
    }

    const k = String(key || 'default')
    const active = this._active.get(k) || 0
    const limit = options.maxConcurrency !== undefined ? Number(options.maxConcurrency) : this.maxConcurrency

    if (active < limit) {
      this._active.set(k, active + 1)
      this._stats.totalAcquired++
      return this._createRelease(k)
    }

    // Queue is required
    const queueList = this._waiting.get(k) || []
    const maxQ = options.maxQueueSize !== undefined ? Number(options.maxQueueSize) : this.maxQueueSize

    if (queueList.length >= maxQ) {
      this._stats.totalOverflowed++
      const err = createQueueError(`Concurrency queue overflow for ${k} (max queue size: ${maxQ})`, 'QUEUE_OVERFLOW', 429)
      throw err
    }

    const timeoutDuration = options.timeoutMs !== undefined ? Number(options.timeoutMs) : this.timeoutMs
    this._stats.totalQueued++

    return new Promise((resolve, reject) => {
      let timer = null
      let abortHandler = null
      const id = Math.random().toString(36).slice(2)

      const cleanup = () => {
        if (timer) clearTimeout(timer)
        if (signal && abortHandler && typeof signal.removeEventListener === 'function') {
          signal.removeEventListener('abort', abortHandler)
        }
      }

      if (timeoutDuration > 0) {
        timer = setTimeout(() => {
          cleanup()
          this._removeFromWaiting(k, id)
          this._stats.totalTimedOut++
          const err = createQueueError(`Concurrency queue wait timeout for ${k} after ${timeoutDuration}ms`, 'QUEUE_TIMEOUT', 504)
          reject(err)
        }, timeoutDuration)
      }

      if (signal) {
        abortHandler = () => {
          cleanup()
          this._removeFromWaiting(k, id)
          this._stats.totalAborted++
          const err = createQueueError('Request aborted while waiting in concurrency queue', 'ABORT_ERR')
          err.name = 'AbortError'
          reject(err)
        }
        signal.addEventListener('abort', abortHandler, { once: true })
      }

      const item = {
        id,
        resolve: () => {
          cleanup()
          this._stats.totalAcquired++
          resolve(this._createRelease(k))
        },
        reject: (err) => {
          cleanup()
          reject(err)
        },
        timer,
        signal,
        abortHandler,
        enqueuedAt: Date.now(),
      }

      if (!this._waiting.has(k)) {
        this._waiting.set(k, [])
      }
      this._waiting.get(k).push(item)
    })
  }

  _createRelease(k) {
    let released = false
    return () => {
      if (released) return
      released = true
      this._release(k)
    }
  }

  _release(k) {
    this._stats.totalReleased++
    const waiting = this._waiting.get(k)
    if (waiting && waiting.length > 0) {
      const next = waiting.shift()
      if (waiting.length === 0) this._waiting.delete(k)
      // Hand over slot directly to next queued consumer
      next.resolve()
    } else {
      const active = this._active.get(k) || 0
      if (active <= 1) {
        this._active.delete(k)
      } else {
        this._active.set(k, active - 1)
      }
    }
  }

  _removeFromWaiting(k, id) {
    const list = this._waiting.get(k)
    if (!list) return
    const idx = list.findIndex((item) => item.id === id)
    if (idx !== -1) {
      list.splice(idx, 1)
      if (list.length === 0) this._waiting.delete(k)
    }
  }

  stats() {
    let totalActive = 0
    let totalQueued = 0
    const byKey = {}

    for (const [k, count] of this._active) {
      totalActive += count
      if (!byKey[k]) byKey[k] = { active: 0, queued: 0 }
      byKey[k].active = count
    }

    for (const [k, list] of this._waiting) {
      totalQueued += list.length
      if (!byKey[k]) byKey[k] = { active: 0, queued: 0 }
      byKey[k].queued = list.length
    }

    return {
      enabled: this.enabled,
      maxConcurrency: this.maxConcurrency,
      maxQueueSize: this.maxQueueSize,
      timeoutMs: this.timeoutMs,
      totalActive,
      totalQueued,
      byKey,
      metrics: { ...this._stats },
    }
  }

  dispose() {
    for (const [, list] of this._waiting) {
      for (const item of list) {
        if (item.timer) clearTimeout(item.timer)
        if (item.signal && item.abortHandler && typeof item.signal.removeEventListener === 'function') {
          item.signal.removeEventListener('abort', item.abortHandler)
        }
        const err = createQueueError('Concurrency queue was disposed', 'QUEUE_DISPOSED')
        item.reject(err)
      }
    }
    this._waiting.clear()
    this._active.clear()
  }
}

export const defaultConcurrencyQueue = new ConcurrencyQueue()
