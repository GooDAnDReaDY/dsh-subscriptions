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

// #1059: owns both the pending map and its periodic sweep, so the plugin entry
// point stays a thin facade.
export function startPendingSweep(ctx, ttlMs) {
  const pending = new Map()
  const sweepPending = (nowMs) => sweepExpiredPending(pending, nowMs, ttlMs)
  if (ctx && typeof ctx.effect === 'function') {
    ctx.effect(() => {
      const id = setInterval(() => sweepPending(Date.now()), 60 * 1000)
      if (id && typeof id.unref === 'function') id.unref()
      return () => clearInterval(id)
    }, 'dsh-subscriptions: pending oauth sweep')
  }
  return { pending, sweepPending }
}
