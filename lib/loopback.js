import http from 'node:http'
import { ignoreError } from './catch-log.js'

export const OK_HTML = '<!doctype html><meta charset="utf-8"><title>Subscriptions</title><p>Signed in. You can close this tab and return to Settings.</p>'
export const ERR_HTML = '<!doctype html><meta charset="utf-8"><title>Subscriptions</title><p>Login failed. Return to Settings and paste the redirected URL.</p>'

/** @type {Map<number, { server: http.Server, close: (reason?: string) => void }>} */
const activeServers = new Map()

export function closeAllLoopbacks() {
  for (const entry of activeServers.values()) {
    try {
      entry.close('shutdown')
    } catch (err) {
      ignoreError('loopback.js: closeAllLoopbacks', err)
    }
  }
  activeServers.clear()
}

export function startLoopback({ redirectUri, timeoutMs = 10 * 60 * 1000, onCode, onListening }) {
  const parsed = new URL(redirectUri)
  if (parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
    throw new Error(`loopback redirect requires localhost, got ${parsed.hostname}`)
  }
  const port = parsed.port === '' ? 80 : Number(parsed.port)
  const path = parsed.pathname

  const state = { server: null, timer: null, handled: false, closed: false, boundPort: port }
  let rejectFn

  const closeServer = (reason) => {
    if (state.closed) return
    state.closed = true
    if (state.timer) clearTimeout(state.timer)
    if (state.server) {
      try {
        state.server.close()
      } catch (err) {
        ignoreError('loopback.js: server.close error', err)
      }
    }
    const bound = state.boundPort || port
    if (activeServers.get(bound)?.server === state.server) {
      activeServers.delete(bound)
    }
    if (reason && typeof rejectFn === 'function') {
      rejectFn(new Error(reason))
    }
  }

  const promise = new Promise((resolve, reject) => {
    rejectFn = reject

    const prevEntry = port !== 0 && activeServers.get(port)
    if (prevEntry) {
      activeServers.delete(port)
    }

    const waitClose = prevEntry
      ? new Promise((res) => {
          try {
            prevEntry.close('replaced by newer attempt')
            prevEntry.server.close(() => res())
          } catch {
            res()
          }
        })
      : Promise.resolve()

    waitClose.then(() => {
      if (state.closed) return

      const server = http.createServer((req, res) => {
        const listenPort = state.boundPort || port
        const url = new URL(req.url || '/', `http://127.0.0.1:${listenPort}`)
        const matchesPath = url.pathname === path || (path.endsWith('/') ? url.pathname.startsWith(path) : url.pathname.startsWith(path + '/'))
        if (!matchesPath) {
          res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(ERR_HTML)
          return
        }
        const site = String(req.headers['sec-fetch-site'] || '').toLowerCase()
        const mode = String(req.headers['sec-fetch-mode'] || '').toLowerCase()
        if (site === 'cross-site' && mode !== 'navigate') {
          res.writeHead(204)
          res.end()
          return
        }
        if (state.handled || state.closed) {
          res.writeHead(409, { 'Content-Type': 'text/plain' })
          res.end('already handled')
          return
        }
        state.handled = true
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        Promise.resolve(onCode(url.searchParams))
          .then((html) => res.end(html || OK_HTML))
          .catch(() => res.end(ERR_HTML))
          .finally(() => {
            closeServer()
            resolve({ ok: true, url: redirectUri, close: closeServer })
          })
      })

      server.on('error', (err) => {
        closeServer()
        reject(err)
      })

      state.server = server
      if (port !== 0) {
        activeServers.set(port, { server, close: closeServer })
      }

      server.listen(port, parsed.hostname, () => {
        const address = server.address()
        const actualPort = address && typeof address === 'object' ? address.port : port
        state.boundPort = actualPort
        activeServers.set(actualPort, { server, close: closeServer })
        if (typeof onListening === 'function') {
          onListening(actualPort)
        }
      })

      state.timer = setTimeout(() => {
        if (state.closed) return
        closeServer()
        reject(new Error('loopback timeout: no callback received'))
      }, timeoutMs)
    }).catch((err) => {
      closeServer()
      reject(err)
    })
  })

  promise.close = closeServer
  return promise
}
