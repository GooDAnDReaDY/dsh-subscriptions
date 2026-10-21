function csvCell(value) {
  const text = value == null ? '' : String(value)
  return /[",\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text
}

export function toCsv(rows) {
  const list = Array.isArray(rows) ? rows : []
  if (!list.length) return ''
  const headers = Object.keys(list[0])
  const lines = [headers.map(csvCell).join(',')]
  for (const row of list) lines.push(headers.map((key) => csvCell(row[key])).join(','))
  return lines.join('\n') + '\n'
}

export function buildUsageRows(accounts, now = Date.now()) {
  const current = Number(now) || Date.now()
  return (Array.isArray(accounts) ? accounts : []).map((account) => ({
    ref: account.ref || '',
    provider: account.provider || '',
    index: account.index ?? '',
    label: account.label || '',
    plan: account.plan || account.paidTierName || '',
    configured: Boolean(account.hasToken || account.configured),
    usagePercent: account.usagePercent ?? '',
    remainingPercent: account.usagePercent != null ? Math.max(0, 100 - Number(account.usagePercent)) : '',
    quotaSource: (account.quota && account.quota.source) || 'unknown',
    usageAgeMs: account.usageAt ? Math.max(0, current - Number(account.usageAt)) : '',
    resetAt: (account.quota && account.quota.resetAt) || '',
    cooldownUntil: account.cooldownUntil || '',
    quarantineUntil: account.quarantineUntil || '',
    quarantineReason: account.quarantineReason || '',
    healthScore: account.healthScore ?? '',
    monthlyCost: account.monthlyCost ?? '',
  }))
}

export function buildCallRows(calls) {
  return (Array.isArray(calls) ? calls : []).map((call) => ({
    at: call.at || call.timestamp || '',
    provider: call.provider || '',
    ref: call.ref || '',
    model: call.model || '',
    path: call.path || '',
    ok: call.ok !== false,
    status: call.status ?? '',
    inputTokens: call.inputTokens ?? '',
    outputTokens: call.outputTokens ?? '',
    cacheReadTokens: call.cacheReadTokens ?? '',
    durationMs: call.durationMs ?? '',
    error: call.error || '',
  }))
}
