import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

// #65: request and cost history. Stored in
// ~/.dsh/storages/dsh-subscriptions/history.json (JSON array, newest first).
// All IO is best-effort: a write failure must never crash the harness.

export const DEFAULT_HISTORY_DIR = join(homedir(), '.dsh', 'storages', 'dsh-subscriptions')

export class HistoryStore {
  constructor(dir = DEFAULT_HISTORY_DIR, ttlMs = 7 * 24 * 60 * 60 * 1000, debounceMs = 0, maxEntries = 1000) {
    this.dir = dir
    this.ttlMs = ttlMs
    this.debounceMs = debounceMs
    this.maxEntries = maxEntries
    this.path = join(dir, 'history.json')
    this.rows = []
    this._persistTimer = null
    this._load()

    if (typeof process !== 'undefined' && typeof process.on === 'function') {
      this._exitHandler = () => this.flush()
      process.on('beforeExit', this._exitHandler)
    }
  }

  _load() {
    try {
      mkdirSync(this.dir, { recursive: true })
    } catch { /* best-effort */ }
    try {
      const raw = JSON.parse(readFileSync(this.path, 'utf8'))
      if (Array.isArray(raw)) this.rows = raw
    } catch { /* absent/corrupt history is normal */ }
    this._prune()
  }

  _prune() {
    const cutoff = Date.now() - this.ttlMs
    const before = this.rows.length
    this.rows = this.rows.filter((r) => r && r.ts && r.ts >= cutoff)
    if (this.rows.length > this.maxEntries) {
      this.rows = this.rows.slice(0, this.maxEntries)
    }
    if (this.rows.length !== before) this._persist()
  }

  _persist() {
    if (this.debounceMs > 0) {
      if (this._persistTimer) return
      this._persistTimer = setTimeout(() => {
        this._persistTimer = null
        this.flush()
      }, this.debounceMs)
      if (typeof this._persistTimer.unref === 'function') this._persistTimer.unref()
      return
    }
    this.flush()
  }

  /** Write pending updates to disk immediately. */
  flush() {
    if (this._persistTimer) {
      clearTimeout(this._persistTimer)
      this._persistTimer = null
    }
    try {
      mkdirSync(this.dir, { recursive: true })
      writeFileSync(this.path, JSON.stringify(this.rows))
    } catch { /* best-effort */ }
  }

  /** Add one entry. Returns the history length. */
  add(entry) {
    if (!entry || typeof entry !== 'object') return this.rows.length
    this.rows.unshift({ ts: Date.now(), ...entry })
    if (this.rows.length > this.maxEntries) {
      this.rows = this.rows.slice(0, this.maxEntries)
    }
    this._prune()
    this._persist()
    return this.rows.length
  }

  /** Last N entries (newest first). */
  dispose() {
    this.flush()
    if (this._persistTimer) {
      clearTimeout(this._persistTimer)
      this._persistTimer = null
    }
    if (this._exitHandler && typeof process !== "undefined" && typeof process.removeListener === "function") {
      process.removeListener("beforeExit", this._exitHandler)
      this._exitHandler = null
    }
    this.rows = []
  }

  recent(n) {
    return this.rows.slice(0, n)
  }

  all() {
    return this.rows
  }

  size() {
    return this.rows.length
  }

  /** Summarize session and 24-hour telemetry for UI stat cards. */
  telemetrySummary() {
    const total = this.rows.length
    if (total === 0) {
      return {
        totalRequests: 0,
        requests24h: 0,
        successRequests: 0,
        errorRequests: 0,
        successRate: 100,
        avgLatencyMs: 0,
        lastLatencyMs: 0,
        lastRequestAt: null,
        lastProvider: null,
        lastModel: null,
      }
    }
    let success = 0
    let error = 0
    let totalMs = 0
    let latencyCount = 0
    const now = Date.now()
    const last24h = now - 24 * 60 * 60 * 1000
    let count24h = 0

    for (const r of this.rows) {
      if (r.ts >= last24h) count24h++
      const st = Number(r.status || 0)
      if (st >= 200 && st < 400) success++
      else if (st >= 400) error++
      if (typeof r.ms === 'number' && r.ms > 0) {
        totalMs += r.ms
        latencyCount++
      }
    }

    const first = this.rows[0] // newest first
    return {
      totalRequests: total,
      requests24h: count24h,
      successRequests: success,
      errorRequests: error,
      successRate: total > 0 ? Math.round((success / total) * 100) : 100,
      avgLatencyMs: latencyCount > 0 ? Math.round(totalMs / latencyCount) : 0,
      lastLatencyMs: (first && typeof first.ms === 'number') ? first.ms : 0,
      lastRequestAt: (first && first.ts) || null,
      lastProvider: (first && first.provider) || null,
      lastModel: (first && first.model) || null,
    }
  }
}
