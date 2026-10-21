// #739: durable, bounded snapshot ring. Encrypted payloads are written with
// 0600 permissions through a temp file + rename; list() only returns metadata.
import { chmodSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const FILE_NAME = 'vault-snapshots.json'
export const DEFAULT_MAX_BYTES = 2 * 1024 * 1024

function bytesOf(items) {
  return Buffer.byteLength(JSON.stringify(items))
}
let seq = 0

export function resolveSnapshotDir(customDir) {
  if (customDir) return customDir
  if (process.env.DSH_SNAPSHOT_DIR) return process.env.DSH_SNAPSHOT_DIR
  if (process.env.DSH_STORAGE_DIR) return process.env.DSH_STORAGE_DIR
  if (process.env.DSH_HOME) return join(process.env.DSH_HOME, 'storages', 'dsh-subscriptions')
  return join(homedir(), '.dsh', 'storages', 'dsh-subscriptions')
}

function meta(snapshot) {
  return {
    id: snapshot.id,
    label: snapshot.label || '',
    createdAt: snapshot.createdAt,
    version: snapshot.version || 2,
    slotCount: Number(snapshot.slotCount) || 0,
    blobCount: Number(snapshot.blobCount) || 0,
    keyMode: snapshot.keyMode || 'base',
    deviceId: snapshot.deviceId || '',
  }
}

function load(file) {
  try {
    const rows = JSON.parse(readFileSync(file, 'utf8'))
    if (!Array.isArray(rows)) return []
    return rows.filter((row) => row && typeof row === 'object' && typeof row.vault === 'string' && row.id)
  } catch {
    return []
  }
}

function persist(dir, file, items) {
  try {
    mkdirSync(dir, { recursive: true, mode: 0o700 })
    const tmp = file + '.tmp-' + process.pid + '-' + Date.now()
    writeFileSync(tmp, JSON.stringify(items), { mode: 0o600 })
    renameSync(tmp, file)
    try { chmodSync(file, 0o600) } catch { /* best-effort */ }
    return true
  } catch {
    return false
  }
}

export function createSnapshotStore({ max = 10, maxBytes = DEFAULT_MAX_BYTES, now = () => Date.now(), dir, persistToDisk = true } = {}) {
  const snapshotDir = resolveSnapshotDir(dir)
  const file = join(snapshotDir, FILE_NAME)
  let items = persistToDisk ? load(file) : []
  const save = () => { if (persistToDisk) persist(snapshotDir, file, items) }
  return {
    path: file,
    add(snapshot, label = '') {
      const at = now()
      const entry = {
        ...snapshot,
        id: 'vs_' + at.toString(36) + '_' + (++seq).toString(36),
        label: String(label || snapshot.label || ''),
        createdAt: snapshot.createdAt || new Date(at).toISOString(),
      }
      items.unshift(entry)
      if (items.length > Math.max(1, max)) items = items.slice(0, Math.max(1, max))
      while (items.length > 1 && bytesOf(items) > Math.max(1, maxBytes)) items.pop()
      save()
      return meta(entry)
    },
    list() {
      return items.map(meta)
    },
    get(id) {
      return items.find((item) => item.id === id) || null
    },
    clear() {
      items = []
      save()
    },
    stats() {
      let bytes = bytesOf(items)
      try { bytes = Math.max(bytes, statSync(file).size) } catch { /* file may not exist yet */ }
      return { count: items.length, bytes, path: file, maxBytes }
    },
  }
}

export const defaultSnapshotStore = createSnapshotStore({ max: 10 })
