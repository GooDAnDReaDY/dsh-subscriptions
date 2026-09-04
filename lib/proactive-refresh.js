export class ProactiveTokenRefreshDaemon {
  constructor({ refreshLeadMs = 15 * 60 * 1000, checkIntervalMs = 60 * 1000 } = {}) {
    this.refreshLeadMs = refreshLeadMs // refresh 15 min before token expires
    this.checkIntervalMs = checkIntervalMs
    this.timer = null
  }

  start(getAccountsFn, refreshFn) {
    if (this.timer) return
    this.timer = setInterval(async () => {
      try {
        const accounts = (typeof getAccountsFn === 'function' && await getAccountsFn()) || []
        const now = Date.now()
        for (const acc of accounts) {
          if (!acc || !acc.expiresAt || !acc.refreshToken) continue
          const expiresAt = Number(acc.expiresAt)
          if (expiresAt - now <= this.refreshLeadMs && expiresAt > now) {
            if (typeof refreshFn === 'function') {
              await refreshFn(acc)
            }
          }
        }
      } catch {
        // silent catch on daemon tick
      }
    }, this.checkIntervalMs)

    if (this.timer.unref) this.timer.unref()
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }
}
