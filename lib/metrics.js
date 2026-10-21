// #744: Prometheus text exposition. No secrets, labels escaped, deterministic order.
function label(value) {
  return String(value == null ? '' : value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
}

function add(lines, name, help, type, samples) {
  lines.push('# HELP ' + name + ' ' + help)
  lines.push('# TYPE ' + name + ' ' + type)
  for (const sample of samples) lines.push(name + (sample.labels ? '{' + sample.labels + '}' : '') + ' ' + sample.value)
}

export function formatMetrics({ accounts = [], rows = [], alerts = [], sources = null } = {}) {
  const lines = []
  const accountRows = Array.isArray(accounts) ? accounts : []
  add(lines, 'dsh_subscriptions_connected_accounts', 'Accounts with a configured credential.', 'gauge', [
    { value: accountRows.filter((a) => a && a.configured).length },
  ])
  const configured = []
  const usage = []
  const cooldown = []
  for (const account of accountRows) {
    if (!account || !account.provider) continue
    const labels = 'provider="' + label(account.provider) + '",index="' + label(account.index || 1) + '"'
    configured.push({ labels, value: account.configured ? 1 : 0 })
    if (account.usagePercent != null) usage.push({ labels, value: Number(account.usagePercent) })
    const until = Number(account.cooldownUntil) || 0
    cooldown.push({ labels, value: until > Date.now() ? Math.round((until - Date.now()) / 1000) : 0 })
  }
  add(lines, 'dsh_subscriptions_account_configured', '1 when the slot has a credential.', 'gauge', configured)
  add(lines, 'dsh_subscriptions_account_usage_percent', 'Last observed quota usage.', 'gauge', usage)
  add(lines, 'dsh_subscriptions_account_cooldown_seconds', 'Remaining cooldown.', 'gauge', cooldown)

  const selected = []
  for (const row of (sources && Array.isArray(sources.providers) ? sources.providers : [])) {
    if (!row || !row.selected) continue
    selected.push({ labels: 'provider="' + label(row.provider) + '",source="' + label(row.selected) + '"', value: 1 })
  }
  add(lines, 'dsh_subscriptions_source_selected', 'Selected source for a provider.', 'gauge', selected)

  const byRequest = new Map()
  for (const row of (Array.isArray(rows) ? rows : [])) {
    const provider = row && row.provider ? row.provider : 'unknown'
    const status = row && row.status != null ? row.status : 'unknown'
    const key = provider + '|' + status
    byRequest.set(key, (byRequest.get(key) || 0) + 1)
  }
  add(lines, 'dsh_subscriptions_requests_total', 'Recorded requests by provider and status.', 'counter',
    [...byRequest.entries()].sort().map(([key, value]) => {
      const [provider, status] = key.split('|')
      return { labels: 'provider="' + label(provider) + '",status="' + label(status) + '"', value }
    }))

  const bySeverity = new Map()
  for (const alert of (Array.isArray(alerts) ? alerts : [])) {
    const severity = alert && alert.severity ? alert.severity : 'warn'
    bySeverity.set(severity, (bySeverity.get(severity) || 0) + 1)
  }
  add(lines, 'dsh_subscriptions_alerts_total', 'Recent alerts by severity.', 'counter',
    [...bySeverity.entries()].sort().map(([severity, value]) => ({ labels: 'severity="' + label(severity) + '"', value })))

  return lines.join('\n') + '\n'
}
