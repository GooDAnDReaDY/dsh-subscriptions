export class ResetNotificationManager {
  constructor() {
    this.scheduledAlerts = new Map()
  }

  scheduleResetNotice(accountRef, resetAt, onResetAlert) {
    if (!accountRef || !resetAt || resetAt <= Date.now()) return
    if (this.scheduledAlerts.has(accountRef)) {
      clearTimeout(this.scheduledAlerts.get(accountRef))
    }

    const delay = Math.max(0, resetAt - Date.now())
    const timer = setTimeout(() => {
      this.scheduledAlerts.delete(accountRef)
      if (typeof onResetAlert === 'function') {
        onResetAlert({
          accountRef,
          message: `Subscription quota reset! Slot ${accountRef} is ready to use.`
        })
      }
    }, delay)

    if (timer.unref) timer.unref()
    this.scheduledAlerts.set(accountRef, timer)
  }

  cancel(accountRef) {
    if (this.scheduledAlerts.has(accountRef)) {
      clearTimeout(this.scheduledAlerts.get(accountRef))
      this.scheduledAlerts.delete(accountRef)
    }
  }

  clear() {
    for (const t of this.scheduledAlerts.values()) clearTimeout(t)
    this.scheduledAlerts.clear()
  }
}
