// #729: webhook URLs are user-controlled and fetched by the host, so reject
// obvious SSRF targets unless the operator explicitly opts into private hosts.
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { Agent } from 'undici'

/** @returns {number[]|null} dotted-quad octets, or null when not an IPv4 literal. */
function ipv4Parts(host) {
  const m = String(host).match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return null
  const parts = m.slice(1).map(Number)
  return parts.some((n) => n > 255) ? null : parts
}

/** @param {number[]} parts */
function isPrivateIPv4(parts) {
  const [a, b, c] = parts
  if (a === 0 || a === 10 || a === 127) return true
  if (a === 169 && b === 254) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 100 && b >= 64 && b <= 127) return true
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true
  if (a === 198 && b === 51 && c === 100) return true
  if (a === 203 && b === 0 && c === 113) return true
  if (a === 198 && (b === 18 || b === 19)) return true
  if (a >= 224) return true
  return false
}

/**
 * Expand an IPv6 literal into eight 16-bit groups. Handles `::` compression,
 * zones (`%eth0`), bracket form and a trailing embedded IPv4 address.
 * @returns {number[]|null}
 */
function parseIPv6(host) {
  let raw = String(host || '').trim().toLowerCase()
  if (raw.startsWith('[') && raw.endsWith(']')) raw = raw.slice(1, -1)
  const zone = raw.indexOf('%')
  if (zone >= 0) raw = raw.slice(0, zone)
  if (!raw.includes(':')) return null
  const double = raw.indexOf('::')
  if (double !== -1 && raw.indexOf('::', double + 1) !== -1) return null
  const expand = (groups) => {
    const out = []
    for (const group of groups) {
      if (group === '') return null
      if (group.includes('.')) {
        const v4 = ipv4Parts(group)
        if (!v4) return null
        out.push((v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3])
        continue
      }
      if (!/^[0-9a-f]{1,4}$/.test(group)) return null
      out.push(parseInt(group, 16))
    }
    return out
  }
  let groups
  if (double !== -1) {
    const [headPart, tailPart] = raw.split('::')
    const head = expand(headPart ? headPart.split(':') : [])
    const tail = expand(tailPart ? tailPart.split(':') : [])
    if (!head || !tail) return null
    const missing = 8 - head.length - tail.length
    if (missing < 0) return null
    groups = [...head, ...new Array(missing).fill(0), ...tail]
  } else {
    groups = expand(raw.split(':'))
  }
  return groups && groups.length === 8 ? groups : null
}

function isPrivateIPv6(groups) {
  if (!groups) return true
  if (groups.every((g) => g === 0)) return true
  if (groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1) return true
  const first = groups[0]
  if ((first & 0xfe00) === 0xfc00) return true
  if ((first & 0xffc0) === 0xfe80) return true
  if ((first & 0xffc0) === 0xfec0) return true
  if ((first & 0xff00) === 0xff00) return true
  // RFC 6666 Discard-Only: 100::/64
  if (groups[0] === 0x0100 && groups.slice(1, 4).every((g) => g === 0)) return true
  // RFC 4380: Teredo prefix 2001:0000::/32
  if (groups[0] === 0x2001 && groups[1] === 0x0000) return true
  // RFC 3849 Documentation: 2001:db8::/32
  if (groups[0] === 0x2001 && groups[1] === 0x0db8) return true
  // RFC 3056: 6to4 prefix 2002::/16. Embedded IPv4 is in groups[1] and groups[2].
  if (groups[0] === 0x2002) {
    const embeddedIpv4 = [groups[1] >> 8, groups[1] & 0xff, groups[2] >> 8, groups[2] & 0xff]
    return isPrivateIPv4(embeddedIpv4)
  }
  // RFC 6052: Well-Known translation prefix 64:ff9b::/96
  if (groups[0] === 0x0064 && groups[1] === 0xff9b && groups.slice(2, 6).every((g) => g === 0)) {
    return isPrivateIPv4([groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff])
  }
  // RFC 8215: Local-Use translation prefix 64:ff9b:1::/48
  if (groups[0] === 0x0064 && groups[1] === 0xff9b && groups[2] === 1) return true
  if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
    return isPrivateIPv4([groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff])
  }
  if (groups.slice(0, 6).every((g) => g === 0)) {
    const ip = [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff]
    return isPrivateIPv4(ip)
  }
  return false
}

export function isPrivateHostname(hostname) {
  let raw = String(hostname || '').trim().toLowerCase()
  if (raw.endsWith('.')) raw = raw.slice(0, -1)
  if (raw.startsWith('[') && raw.endsWith(']')) raw = raw.slice(1, -1)
  if (!raw) return true
  if (raw === 'localhost' || raw.endsWith('.localhost')) return true
  const family = isIP(raw)
  if (family === 4) {
    const parts = ipv4Parts(raw)
    return !parts || isPrivateIPv4(parts)
  }
  if (family === 6) return isPrivateIPv6(parseIPv6(raw))
  // Anything with a colon that is not a valid IPv6 literal is not a hostname.
  if (raw.includes(':')) return true
  return false
}

/** #875: resolve once and return the exact address that must be dialed. */
export async function resolvePublicAddress(hostname, { lookupImpl = lookup } = {}) {
  let host = String(hostname || '').trim().toLowerCase()
  if (host.startsWith('[')) host = host.slice(1)
  if (host.endsWith(']')) host = host.slice(0, -1)
  if (!host) return { ok: false, reason: 'empty hostname' }
  if (isPrivateHostname(host)) return { ok: false, reason: 'private host' }
  const literalFamily = isIP(host)
  if (literalFamily) return { ok: true, address: host, family: literalFamily }
  if (host.includes(':')) return { ok: false, reason: 'private host' }
  try {
    const rows = await lookupImpl(host, { all: true })
    const list = (Array.isArray(rows) ? rows : [rows]).filter((row) => row && row.address)
    if (!list.length) return { ok: false, reason: 'DNS returned no addresses' }
    if (list.some((row) => isIP(row.address) === 0 || isPrivateHostname(row.address))) {
      return { ok: false, reason: 'DNS resolves to a private host' }
    }
    const chosen = list[0]
    return { ok: true, address: chosen.address, family: chosen.family === 6 ? 6 : 4 }
  } catch {
    return { ok: false, reason: 'DNS resolution failed' }
  }
}

/** #875/#888: address-pinned dispatcher prevents a second DNS answer from rebinding. */
export function createPinnedDispatcher(address, family) {
  return new Agent({
    connect: {
      lookup(hostname, options, callback) {
        if (options && options.all) callback(null, [{ address, family }])
        else callback(null, address, family)
      },
    },
  })
}

/** #875/#888: fail closed on DNS-resolved private hosts unless explicitly allowed. */
export async function resolvePublicHostname(hostname, options = {}) {
  return (await resolvePublicAddress(hostname, options)).ok
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
