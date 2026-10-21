// #729: webhook URLs are user-controlled and fetched by the host, so reject
// obvious SSRF targets unless the operator explicitly opts into private hosts.
export function isPrivateHostname(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '')
  if (!host) return true
  if (host === 'localhost' || host.endsWith('.localhost')) return true
  if (host === '::1' || host === '0:0:0:0:0:0:0:1') return true
  if (/^(fc|fd|fe8|fe9|fea|feb)/.test(host)) return true
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return false
  const parts = m.slice(1).map(Number)
  if (parts.some((n) => n > 255)) return true
  const [a, b] = parts
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
    || (a === 100 && b >= 64 && b <= 127)
}

export function validateWebhookUrl(raw, { allowPrivate = false } = {}) {
  if (typeof raw !== 'string' || !raw.trim()) return { ok: false, reason: 'webhook URL is empty' }
  let url
  try { url = new URL(raw.trim()) } catch { return { ok: false, reason: 'webhook URL is invalid' } }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { ok: false, reason: 'webhook URL must use http(s)' }
  if (url.username || url.password) return { ok: false, reason: 'webhook URL must not contain userinfo' }
  if (!allowPrivate && isPrivateHostname(url.hostname)) return { ok: false, reason: 'webhook URL points to a private/loopback host' }
  return { ok: true, url: url.toString() }
}
