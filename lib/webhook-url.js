// #729: webhook URLs are user-controlled and fetched by the host, so reject
// obvious SSRF targets unless the operator explicitly opts into private hosts.
import { lookup } from 'node:dns/promises'

function ipv4FromMapped(host) {
  const idx = host.indexOf('::ffff:')
  if (idx < 0) return ''
  const tail = host.slice(idx + 7)
  const hextets = tail.split(':')
  if (hextets.length !== 2) return ''
  if (!hextets.every((part) => /^[0-9a-f]{1,4}$/.test(part))) return ''
  const hi = parseInt(hextets[0], 16)
  const lo = parseInt(hextets[1], 16)
  return [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff].join('.')
}

export function isPrivateHostname(hostname) {
  let raw = String(hostname || '').trim().toLowerCase()
  if (raw.startsWith('[')) raw = raw.slice(1)
  if (raw.endsWith(']')) raw = raw.slice(0, -1)
  if (!raw) return true
  if (raw === 'localhost' || raw.endsWith('.localhost')) return true
  const mappedIpv4 = ipv4FromMapped(raw)
  if (mappedIpv4) return isPrivateHostname(mappedIpv4)
  const host = raw.replace(/^::ffff:/, '')
  if (host === '::1' || host === '0:0:0:0:0:0:0:1' || host === '0:0:0:0:0:0:0:0') return true
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

/** #875/#888: fail closed on DNS-resolved private hosts unless explicitly allowed. */
export async function resolvePublicHostname(hostname, { lookupImpl = lookup } = {}) {
  try {
    const res = await lookupImpl(String(hostname || ''), { all: true })
    if ((res || []).some((row) => isPrivateHostname(row.address))) return false
    return true
  } catch { return false }
}

/** #888: shared guard for external sync endpoints (same private-host rules as webhook). */
export function validateOutboundUrl(raw, { allowPrivate = false } = {}) {
  if (typeof raw !== 'string' || !raw.trim()) return { ok: false, reason: 'URL is empty' }
  let url
  try { url = new URL(raw.trim()) } catch { return { ok: false, reason: 'URL is invalid' } }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { ok: false, reason: 'URL must use http(s)' }
  if (url.username || url.password) return { ok: false, reason: 'URL must not contain userinfo' }
  if (!allowPrivate && isPrivateHostname(url.hostname)) return { ok: false, reason: 'URL points to a private/loopback host' }
  return { ok: true, url: url.toString(), hostname: url.hostname }
}

/** Validates a webhook receiver URL after the same policy as generic outbound sync targets. */
export function validateWebhookUrl(raw, { allowPrivate = false } = {}) {
  if (typeof raw !== 'string' || !raw.trim()) return { ok: false, reason: 'webhook URL is empty' }
  const checked = validateOutboundUrl(raw, { allowPrivate })
  if (!checked.ok) return checked
  return { ok: true, url: checked.url, hostname: checked.hostname }
}
