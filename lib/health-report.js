// #745: health is about having a usable source, not about uptime alone.
export function assessHealth({ accounts = [], sources = null, snapshots = null, webhookUrl = '', ollama = false } = {}) {
  const list = Array.isArray(accounts) ? accounts : []
  const connectedAccounts = list.filter((a) => a && a.configured).length
  const sourceRows = sources && Array.isArray(sources.providers) ? sources.providers : []
  const selectedSources = sourceRows.filter((row) => row && row.selected).length
  const keyRotation = Boolean(sources && sources.keyRotation && sources.keyRotation.available)
  const ok = connectedAccounts > 0 || keyRotation || Boolean(ollama)
  return {
    ok,
    status: ok ? 'healthy' : 'degraded',
    checks: {
      connectedAccounts,
      keyRotation,
      ollama: Boolean(ollama),
      webhook: Boolean(webhookUrl),
      snapshots: snapshots ? Number(snapshots.count) || 0 : 0,
      selectedSources,
    },
  }
}
