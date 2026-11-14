import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ignoreError } from './catch-log.js'

// #1039: cross-process/cross-machine account lease. The concurrency queue is
// in-process only, so two DSH instances sharing one credential ref would burn
// the same quota window independently. A lease file per account makes the
// second instance pick another account until the lease expires.
export const DEFAULT_LEASE_TTL_MS = 60 * 1000

/** @param {string} key */
function safeKey(key) {
  return String(key || 'default').replace(/[^A-Za-z0-9._#-]+/g, '_').slice(0, 120)
}

export function defaultLeaseDir() {
  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  return path.join(home, 'subscriptions', 'leases')
}

export class AccountLeaseStore {
  constructor(options = {}) {
    this.dir = options.dir ? String(options.dir) : ''
    this.ttlMs = Number(options.ttlMs) > 0 ? Number(options.ttlMs) : DEFAULT_LEASE_TTL_MS
    this.host = String(options.host || os.hostname())
    this.pid = Number(options.pid || process.pid)
    this.now = typeof options.now === 'function' ? options.now : () => Date.now()
    this.enabled = Boolean(this.dir) && options.enabled !== false
  }

  /** @param {string} key */
  _file(key) {
    return path.join(this.dir, safeKey(key) + '.json')
  }

  /** @param {string} key */
  _read(key) {
    if (!this.enabled) return null
    try {
      const parsed = JSON.parse(fs.readFileSync(this._file(key), 'utf8'))
      if (!parsed || typeof parsed !== 'object') return null
      const expiresAt = Number(parsed.expiresAt) || 0
      if (expiresAt <= this.now()) return null
      return parsed
    } catch (err) {
      ignoreError('account-lease.js: unreadable lease', err)
      return null
    }
  }

  /** @param {any} holder */
  _isMine(holder) {
    return Boolean(holder) && holder.host === this.host && Number(holder.pid) === this.pid
  }

  /** Active lease held by another process/machine, or null. @param {string} key */
  peek(key) {
    const holder = this._read(key)
    return holder && !this._isMine(holder) ? holder : null
  }

  /** @param {string} key */
  isHeldByOther(key) {
    return Boolean(this.peek(key))
  }

  /**
   * Take the lease if it is free, expired, or already ours.
   * @param {string} key
   * @param {{ ttlMs?: number }} [options]
   */
  acquire(key, options = {}) {
    const noop = () => {}
    if (!this.enabled) return { ok: true, holder: null, released: noop }
    try {
      fs.mkdirSync(this.dir, { recursive: true })
    } catch (err) {
      // A read-only or unavailable home must not break inference.
      ignoreError('account-lease.js: cannot create lease directory', err)
      return { ok: true, holder: null, released: noop, degraded: true }
    }
    const current = this._read(key)
    if (current && !this._isMine(current)) return { ok: false, holder: current, released: noop }

    const ttl = Number(options.ttlMs) > 0 ? Number(options.ttlMs) : this.ttlMs
    const at = this.now()
    const record = { key: String(key), host: this.host, pid: this.pid, acquiredAt: at, heartbeatAt: at, expiresAt: at + ttl }
    const file = this._file(key)
    const tmp = file + '.' + this.pid + '.' + Math.random().toString(36).slice(2) + '.tmp'
    try {
      fs.writeFileSync(tmp, JSON.stringify(record), { encoding: 'utf8', mode: 0o600 })
      fs.renameSync(tmp, file)
    } catch (err) {
      ignoreError('account-lease.js: cannot write lease', err)
      try { fs.unlinkSync(tmp) } catch (cleanupErr) { ignoreError('account-lease.js: cannot drop temp lease', cleanupErr) }
      return { ok: true, holder: null, released: noop, degraded: true }
    }
    return { ok: true, holder: record, released: this._releaseOnce(key) }
  }

  /** @param {string} key */
  _releaseOnce(key) {
    let released = false
    return () => {
      if (released) return
      released = true
      this.release(key)
    }
  }

  /** Extend our own lease; a lease owned by someone else is never touched. @param {string} key */
  heartbeat(key) {
    if (!this.enabled) return null
    const current = this._read(key)
    if (!current || !this._isMine(current)) return null
    const at = this.now()
    const record = { ...current, heartbeatAt: at, expiresAt: at + this.ttlMs }
    try {
      fs.writeFileSync(this._file(key), JSON.stringify(record), { encoding: 'utf8', mode: 0o600 })
    } catch (err) {
      ignoreError('account-lease.js: cannot refresh lease', err)
      return null
    }
    return record
  }

  /** @param {string} key */
  release(key) {
    if (!this.enabled) return false
    try {
      const current = JSON.parse(fs.readFileSync(this._file(key), 'utf8'))
      if (current && !this._isMine(current)) return false
      fs.unlinkSync(this._file(key))
      return true
    } catch (err) {
      ignoreError('account-lease.js: cannot release lease', err)
      return false
    }
  }

  /** Active leases across the directory (used by /status). */
  list() {
    if (!this.enabled) return []
    let entries = []
    try {
      entries = fs.readdirSync(this.dir)
    } catch (err) {
      ignoreError('account-lease.js: cannot list leases', err)
      return []
    }
    const now = this.now()
    const out = []
    for (const entry of entries) {
      if (!entry.endsWith('.json')) continue
      try {
        const record = JSON.parse(fs.readFileSync(path.join(this.dir, entry), 'utf8'))
        const expiresAt = Number(record && record.expiresAt) || 0
        if (expiresAt <= now) continue
        out.push({
          key: record.key || entry.replace(/\.json$/, ''),
          host: record.host || '',
          pid: Number(record.pid) || 0,
          acquiredAt: Number(record.acquiredAt) || 0,
          expiresAt,
          mine: this._isMine(record),
        })
      } catch (err) {
        ignoreError('account-lease.js: unreadable lease entry', err)
      }
    }
    return out.sort((a, b) => a.key.localeCompare(b.key))
  }
}

/** @type {AccountLeaseStore | null} */
let sharedStore = null

/**
 * Shared lease store for the running host. Returns null when disabled.
 * @param {{ leaseEnabled?: boolean, leaseTtlMs?: number, leaseDir?: string, config?: any }} [config]
 */
export function getLeaseStore(config = {}) {
  const source = config && config.config ? config.config : config
  if (!source || source.leaseEnabled === false) return null
  const dir = source.leaseDir ? String(source.leaseDir) : defaultLeaseDir()
  const ttlMs = Number(source.leaseTtlMs) > 0 ? Number(source.leaseTtlMs) : DEFAULT_LEASE_TTL_MS
  if (sharedStore && sharedStore.dir === dir && sharedStore.ttlMs === ttlMs) return sharedStore
  sharedStore = new AccountLeaseStore({ dir, ttlMs })
  return sharedStore
}

/**
 * Resolve the store for one call: an explicit instance (or null) wins over config.
 * @param {any} options
 */
export function leaseStoreFor(options) {
  if (options && options._leaseStore !== undefined) return options._leaseStore || null
  return getLeaseStore(options && options.config ? options.config : options)
}

export function resetLeaseStoreForTests() {
  sharedStore = null
}
