// #734: bounded in-memory snapshot ring. Only metadata leaves list(); the
// encrypted payload is available through get(id) for an explicit restore.
let seq = 0

function meta(snapshot) {
  return {
    id: snapshot.id,
    label: snapshot.label || '',
    createdAt: snapshot.createdAt,
    version: snapshot.version || 2,
    slotCount: Number(snapshot.slotCount) || 0,
    blobCount: Number(snapshot.blobCount) || 0,
  }
}

export function createSnapshotStore({ max = 10, now = () => Date.now() } = {}) {
  let items = []
  return {
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
    },
  }
}

export const defaultSnapshotStore = createSnapshotStore({ max: 10 })
