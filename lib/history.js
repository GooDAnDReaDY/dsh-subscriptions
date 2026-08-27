import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

// #65: история запросов и стоимости. Хранится в
// ~/.dsh/storages/dsh-subscriptions/history.json (JSON-массив, новые сверху).
// Все IO best-effort и синхронные: сбой записи не должен ронять харнесс.

export const DEFAULT_HISTORY_DIR = join(homedir(), '.dsh', 'storages', 'dsh-subscriptions')

export class HistoryStore {
  constructor(dir = DEFAULT_HISTORY_DIR, ttlMs = 7 * 24 * 60 * 60 * 1000) {
    this.dir = dir
    this.ttlMs = ttlMs
    this.path = join(dir, 'history.json')
    this.rows = []
    this._load()
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
    if (this.rows.length !== before) this._persist()
  }

  _persist() {
    try {
      mkdirSync(this.dir, { recursive: true })
      writeFileSync(this.path, JSON.stringify(this.rows))
    } catch { /* best-effort */ }
  }

  /** Добавить одну запись. Возвращает длину истории. */
  add(entry) {
    if (!entry || typeof entry !== 'object') return this.rows.length
    this.rows.unshift({ ts: Date.now(), ...entry })
    this._prune()
    this._persist()
    return this.rows.length
  }

  /** Последние N записей (новые сверху). */
  recent(n) {
    return this.rows.slice(0, n)
  }

  all() {
    return this.rows
  }

  size() {
    return this.rows.length
  }
}
