// Shared pill/composer state and status fetch extracted verbatim from client.js (#266).
export const hotState = { activeIdx: 0, labelEl: null }
export const ORDER = ['codex', 'claude', 'grok', 'antigravity']

    async function refreshLoggedIn() {
      try {
        const res = await fetch('/dsh-subscriptions/status', { cache: 'no-store' })
        const data = await res.json().catch(() => ({}))
        const loggedIn = (data && data.loggedIn) || {}
        const usage = (data && data.usagePercent) || {}
        const logged = ORDER.filter((p) => loggedIn[p])
        const maxUsage = logged.reduce((m, p) => Math.max(m, usage[p] || 0), 0)
        return {
          logged,
          usage: maxUsage,
          expiresAt: (data && data.expiresAt) || {},
          labels: (data && data.labels) || {},
          expiryNotifyDays: (data && data.expiryNotifyDays) || 7,
          composerQuota: (data && data.composerQuota) || 'off',
          active: (data && data.active) || null,
        }
      } catch { return { logged: [], usage: 0, expiresAt: {}, labels: {}, expiryNotifyDays: 7, fastMode: false, composerQuota: 'off', active: null } }
    }
