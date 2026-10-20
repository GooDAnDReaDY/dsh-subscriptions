/**
 * @param {any} body
 * @param {{ idleTimeoutMs?: number, totalTimeoutMs?: number, maxBufferBytes?: number, signal?: AbortSignal }} [options]
 * @returns {AsyncGenerator<string, void, unknown>}
 */
export async function* iterateSse(body, { idleTimeoutMs = 60000, totalTimeoutMs = 600000, maxBufferBytes = 8 * 1024 * 1024, signal } = {}) {
  const reader = body && typeof body.getReader === 'function' ? body.getReader() : null
  const decoder = new TextDecoder()
  let buffer = ''
  let terminated = false
  const deadline = totalTimeoutMs > 0 ? Date.now() + totalTimeoutMs : 0

  async function* fromText(chunk) {
    if (terminated) return
    if (chunk.length > maxBufferBytes) {
      throw new Error('SSE buffer limit exceeded (' + maxBufferBytes + ' chars)')
    }
    buffer += chunk
    if (buffer.length > maxBufferBytes) {
      throw new Error('SSE buffer limit exceeded (' + maxBufferBytes + ' chars)')
    }
    let sep
    while ((sep = buffer.search(/\r?\n\r?\n/)) >= 0) {
      const raw = buffer.slice(0, sep)
      buffer = buffer.slice(sep).replace(/^\r?\n\r?\n/, '')
      const dataLines = []
      for (const line of raw.split(/\r?\n/)) {
        if (line.startsWith(':')) continue // SSE comments / keep-alive pings
        if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart())
      }
      if (!dataLines.length) continue
      const data = dataLines.join('\n')
      if (data === '[DONE]') {
        terminated = true
        yield '[DONE]'
        return
      }
      yield data
    }
  }

  async function readWithTimeout(r, timeoutMs) {
    if (signal && signal.aborted) {
      if (typeof r.cancel === 'function') await r.cancel().catch(() => {})
      const err = new Error('stream aborted by client')
      err.name = 'AbortError'
      throw err
    }
    let timer
    const timeoutPromise = new Promise((_, reject) => {
      if (!timeoutMs || timeoutMs <= 0) return
      timer = setTimeout(() => {
        const message = timeoutMs === idleTimeoutMs
          ? `stream idle timeout: no data received for ${Math.round(timeoutMs / 1000)}s`
          : 'SSE stream deadline exceeded'
        const err = /** @type {Error & { code?: string }} */ (new Error(message))
        err.code = 'TIMEOUT'
        reject(err)
      }, timeoutMs)
    })

    let abortPromise
    let abortHandler
    if (signal) {
      abortPromise = new Promise((_, reject) => {
        abortHandler = () => {
          if (typeof r.cancel === 'function') r.cancel().catch(() => {})
          const err = new Error('stream aborted by client')
          err.name = 'AbortError'
          reject(err)
        }
        signal.addEventListener('abort', abortHandler, { once: true })
      })
    }

    try {
      const races = [r.read()]
      if (timeoutPromise) races.push(timeoutPromise)
      if (abortPromise) races.push(abortPromise)
      return await Promise.race(races)
    } finally {
      if (timer) clearTimeout(timer)
      if (signal && abortHandler) signal.removeEventListener('abort', abortHandler)
    }
  }

  if (reader) {
    try {
      while (!terminated) {
        let wait = idleTimeoutMs
        if (deadline) {
          const remaining = deadline - Date.now()
          if (remaining <= 0) throw new Error('SSE stream deadline exceeded')
          wait = idleTimeoutMs > 0 ? Math.min(idleTimeoutMs, remaining) : remaining
        }
        const { done, value } = await readWithTimeout(reader, wait)
        if (done) break
        yield* fromText(decoder.decode(value, { stream: true }))
        if (terminated) break
      }
      if (!terminated) {
        yield* fromText(decoder.decode())
      }
    } finally {
      if (typeof reader.cancel === 'function') await reader.cancel().catch(() => {})
    }
    return
  }
  if (body && typeof body[Symbol.asyncIterator] === 'function') {
    for await (const chunk of body) {
      if (deadline && Date.now() >= deadline) throw new Error('SSE stream deadline exceeded')
      if (signal && signal.aborted) {
        const err = new Error('stream aborted by client')
        err.name = 'AbortError'
        throw err
      }
      if (terminated) break
      const text = typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true })
      yield* fromText(text)
      if (terminated) break
    }
    if (!terminated) {
      yield* fromText(decoder.decode())
    }
    return
  }
  const text = typeof body === 'string' ? body : await new Response(body).text()
  if (text.length > maxBufferBytes) throw new Error('SSE buffer limit exceeded (' + maxBufferBytes + ' chars)')
  yield* fromText(text)
}

export function jsonSse(data) {
  try { return JSON.parse(data) } catch { return null }
}
