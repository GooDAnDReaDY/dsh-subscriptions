import http from 'node:http'

// #89: временный loopback-сервер для перехвата OAuth callback.
// Слушает на зарегистрированном у провайдера redirect_uri (порт фиксирован
// вендором: codex localhost:1455, grok 127.0.0.1:56121). Принимает GET с
// code/state, отдаёт HTML-страницу и завершается после первого запроса.

const OK_HTML = '<!doctype html><meta charset="utf-8"><title>Subscriptions</title><p>Signed in. You can close this tab and return to Settings.</p>'
const ERR_HTML = '<!doctype html><meta charset="utf-8"><title>Subscriptions</title><p>Login failed. Return to Settings and paste the redirected URL.</p>'

/**
 * Поднять loopback-сервер и дождаться callback.
 * @param {object} opts
 * @param {string} opts.redirectUri  зарегистрированный redirect_uri (localhost/127.0.0.1)
 * @param {number} opts.timeoutMs    время жизни сервера
 * @param {(query: URLSearchParams) => Promise<string>} opts.onCode
 *        вызывается с query callback-запроса; возвращает HTML для браузера.
 *        Бросок исключения = ошибка авторизации (отдаётся ERR_HTML).
 * @returns {Promise<{url: string, close: () => void}>}
 */
export function startLoopback({ redirectUri, timeoutMs = 10 * 60 * 1000, onCode }) {
  const parsed = new URL(redirectUri)
  if (parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
    throw new Error(`loopback redirect requires localhost, got ${parsed.hostname}`)
  }
  const port = Number(parsed.port) || 80
  const path = parsed.pathname

  const state = { server: null, timer: null, done: false }
  const promise = new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url || '/', `http://127.0.0.1:${port}`)
      // Провайдер может редиректить на путь с suffix (например /auth/callback/extra)
      if (!url.pathname.startsWith(path)) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(ERR_HTML)
        return
      }
      if (state.done) return
      state.done = true
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      Promise.resolve(onCode(url.searchParams))
        .then((html) => res.end(html || OK_HTML))
        .catch(() => res.end(ERR_HTML))
        .finally(() => {
          clearTimeout(state.timer)
          server.close()
          resolve({ ok: true })
        })
    })
    server.on('error', (err) => {
      state.done = true
      clearTimeout(state.timer)
      reject(err)
    })
    state.server = server
    server.listen(port, parsed.hostname, () => {})
    state.timer = setTimeout(() => {
      if (state.done) return
      state.done = true
      server.close()
      reject(new Error('loopback timeout: no callback received'))
    }, timeoutMs)
  })
  return promise
}
