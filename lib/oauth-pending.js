// #580: shared expiry sweep for in-memory OAuth pending rows.
export function sweepExpiredPending(pending, nowMs, ttlMs) {
  let removed = 0
  for (const [stateKey, row] of pending) {
    const createdAt = Number(row && row.createdAt)
    if (!Number.isFinite(createdAt) || Number(nowMs) - createdAt > Number(ttlMs)) {
      pending.delete(stateKey)
      removed += 1
    }
  }
  return removed
}
