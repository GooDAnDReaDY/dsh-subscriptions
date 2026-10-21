export function buildRouteReport(last, accounts, now = Date.now()) {
  if (!last || !last.provider) return null
  const current = Number(now) || Date.now()
  const account = (Array.isArray(accounts) ? accounts : []).find((row) => row && row.ref === last.ref)
  const source = (account && account.quota && account.quota.source) || account && account.quotaSource || 'unknown'
  return {
    at: last.at || last.timestamp || null,
    route: {
      provider: last.provider,
      model: last.model || null,
      path: last.path || null,
      account: last.ref || null,
    },
    billing: {
      provider: last.billingProvider || last.provider,
      route: last.billingRoute || last.path || null,
    },
    quota: {
      usedPercent: account && account.usagePercent != null ? account.usagePercent : null,
      source,
      ageMs: account && account.usageAt ? Math.max(0, current - Number(account.usageAt)) : null,
      resetAt: (account && account.quota && account.quota.resetAt) || null,
      confidence: source === 'unknown' ? 'unknown' : 'measured',
    },
    healthScore: account && account.healthScore != null ? account.healthScore : null,
    stale: Boolean(account && account.usageAt && current - Number(account.usageAt) > 5 * 60 * 1000),
  }
}
