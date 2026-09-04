const warmedSlots = new Map()

export class PromptCacheWarmer {
  constructor(ttlMs = 4.5 * 60 * 1000) {
    this.ttlMs = ttlMs // default warm-up every 4.5 min before 5 min Anthropic cache expires
    this.activeTimers = new Map()
  }

  touchSession(sessionId, slotRef, warmFn) {
    if (!sessionId || !slotRef || typeof warmFn !== 'function') return
    if (this.activeTimers.has(sessionId)) {
      clearTimeout(this.activeTimers.get(sessionId))
    }

    const timer = setTimeout(async () => {
      try {
        await warmFn(slotRef, sessionId)
        warmedSlots.set(sessionId, Date.now())
      } catch {
        // quiet error on background warm-up
      }
    }, this.ttlMs)

    if (timer.unref) timer.unref()
    this.activeTimers.set(sessionId, timer)
  }

  cancelSession(sessionId) {
    if (this.activeTimers.has(sessionId)) {
      clearTimeout(this.activeTimers.get(sessionId))
      this.activeTimers.delete(sessionId)
    }
  }

  isWarmed(sessionId) {
    return warmedSlots.has(sessionId)
  }

  clear() {
    for (const t of this.activeTimers.values()) clearTimeout(t)
    this.activeTimers.clear()
    warmedSlots.clear()
  }
}
