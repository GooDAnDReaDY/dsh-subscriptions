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

export function readBody(req, maxBytes) {
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

/** Reject cross-site writes. Do not require loopback: Web UI is used over LAN and reverse proxies. */
export function isTrustedSettingsRequest(request) {
  return request.headers['sec-fetch-site'] !== 'cross-site'
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
