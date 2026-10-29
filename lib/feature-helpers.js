function hostOf(value) {
  try { return new URL(String(value)).hostname.toLowerCase() } catch { return '' }
}

/** #803: bypass plugin proxy for listed hosts/domains. */
export function shouldBypassProxy(bypassList, targetUrl) {
  const host = hostOf(targetUrl)
  if (!host) return false
  for (const raw of Array.isArray(bypassList) ? bypassList : []) {
    const entry = String(raw || '').trim().toLowerCase().replace(/^\*\./, '').replace(/^\./, '')
    if (!entry) continue
    if (host === entry || host.endsWith('.' + entry)) return true
  }
  return false
}

/** #815: bound Codex web-search retry behavior. */
export function webSearchRetryDelay(attempt, status) {
  const n = Number(attempt) || 0
  const code = Number(status) || 0
  if (code === 429) return null
  if (code >= 500 && n < 2) return Math.min(2000, 250 * 2 ** n)
  return null
}
