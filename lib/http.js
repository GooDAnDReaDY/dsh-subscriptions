export function writeJson(res, code, body) {
  try {
    res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify(body))
  } catch { /* socket closed */ }
}

export function writeHtml(res, code, html) {
  try {
    res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' })
    res.end(html)
  } catch { /* socket closed */ }
}

export function readBody(req, maxBytes = 64 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (c) => {
      size += c.length
      if (size > maxBytes) {
        reject(new Error('body too large'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

function isLoopbackIPv4(address) {
  if (!address.startsWith('127.')) return false
  const parts = address.split('.')
  if (parts.length !== 4) return false
  return parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

function peerAddress(req) {
  try {
    const socket = req && req.socket
    const address = socket && (socket.remoteAddress || (socket._peername && socket._peername.address))
    return typeof address === 'string' ? address.toLowerCase() : ''
  } catch {
    return ''
  }
}

export function isLoopback(value) {
  if (value && typeof value === 'object' && (value.socket || value.headers)) {
    const address = peerAddress(value)
    if (address) {
      if (address === '::1' || address === 'localhost') return true
      if (address.startsWith('::ffff:')) return isLoopbackIPv4(address.slice('::ffff:'.length))
      return isLoopbackIPv4(address)
    }
    if (!value.socket) {
      const host = (value.headers?.host || '').split(':')[0].toLowerCase()
      if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true
    }
    return false
  }
  const address = String(value || '').toLowerCase().replace(/^\[|\]$/g, '')
  return address === 'localhost' || address === 'localhost.' || address === '::1'
    || address.startsWith('127.')
    || address.startsWith('::ffff:127.')
}

/**
 * @param {import('node:http').IncomingMessage} request
 * @returns {boolean}
 * Reject cross-site and untrusted writes and sensitive reads.
 * Fail-closed: must be loopback, same-origin/same-site, or matching Origin/Referer.
 */
export function isTrustedSettingsRequest(request) {
  const headers = request?.headers || {}

  // 1. Explicit cross-site fetch is always rejected
  const secFetchSite = String(headers['sec-fetch-site'] || '').toLowerCase()
  if (secFetchSite === 'cross-site') return false

  // 2. If origin header is present, it must match host
  const host = headers.host || headers['x-forwarded-host']
  const origin = headers.origin
  if (origin) {
    try {
      const u = new URL(origin)
      if (!host || u.host.toLowerCase() !== host.toLowerCase()) {
        return false
      }
    } catch {
      return false
    }
  }

  // 3. If referer header is present and no origin, referer must match host
  const referer = headers.referer
  if (!origin && referer) {
    try {
      const u = new URL(referer)
      if (!host || u.host.toLowerCase() !== host.toLowerCase()) {
        return false
      }
    } catch {
      return false
    }
  }

  // 4. Same-origin or same-site browser fetch
  if (secFetchSite === 'same-origin' || secFetchSite === 'same-site') return true

  // 5. Origin or referer was present and matched host
  if (origin || referer) return true

  // 6. No origin headers: trust only if demonstrably loopback
  if (isLoopback(request)) return true

  // 7. Otherwise fail-closed
  return false
}

export function queryOf(req) {
  try {
    return new URL(req.url || '/', 'http://localhost').searchParams
  } catch {
    return new URLSearchParams()
  }
}

/**
 * Fetch with connect/overall timeout using AbortSignal.any.
 */
export async function fetchWithTimeout(fetchImpl, url, init = {}, { timeoutMs = 30000 } = {}) {
  const impl = fetchImpl || fetch
  if (!timeoutMs || timeoutMs <= 0) return impl(url, init)
  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort(new DOMException('The operation was aborted due to timeout', 'TimeoutError'))
  }, timeoutMs)

  const signal = init.signal
    ? AbortSignal.any([init.signal, controller.signal])
    : controller.signal

  try {
    return await impl(url, { ...init, signal })
  } finally {
    clearTimeout(timer)
  }
}

export function safeJsonHandler(fn) {
  return async (req, res) => {
    try {
      await fn(req, res)
    } catch (err) {
      const status = Number(err && (err.status || err.statusCode) || 500)
      const code = (err && err.code) || "INTERNAL_ERROR"
      const message = String((err && err.message) || err || "Internal server error")
      writeJson(res, status >= 400 && status < 600 ? status : 500, {
        ok: false,
        error: { code, message },
      })
    }
  }
}

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
