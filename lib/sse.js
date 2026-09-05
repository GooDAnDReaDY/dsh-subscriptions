export async function* iterateSse(body, { idleTimeoutMs = 60000 } = {}) {
  const reader = body && typeof body.getReader === 'function' ? body.getReader() : null
  const decoder = new TextDecoder()
  let buffer = ''
  async function* fromText(chunk) {
    buffer += chunk
    let sep
    while ((sep = buffer.search(/\r?\n\r?\n/)) >= 0) {
      const raw = buffer.slice(0, sep)
      buffer = buffer.slice(sep).replace(/^\r?\n\r?\n/, '')
      const dataLines = []
      for (const line of raw.split(/\r?\n/)) {
        if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart())
      }
      if (!dataLines.length) continue
      const data = dataLines.join('\n')
      if (data === '[DONE]') return
      yield data
    }
  }

  async function readWithTimeout(r) {
    if (!idleTimeoutMs || idleTimeoutMs <= 0) return r.read()
    let timer
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => {
        const err = new Error(`stream idle timeout: no data received for ${Math.round(idleTimeoutMs / 1000)}s`)
        err.code = 'TIMEOUT'
        reject(err)
      }, idleTimeoutMs)
    })
    try {
      return await Promise.race([r.read(), timeoutPromise])
    } finally {
      clearTimeout(timer)
    }
  }

  if (reader) {
    while (true) {
      const { done, value } = await readWithTimeout(reader)
      if (done) break
      yield* fromText(decoder.decode(value, { stream: true }))
    }
    yield* fromText(decoder.decode())
    return
  }
  if (body && typeof body[Symbol.asyncIterator] === 'function') {
    for await (const chunk of body) {
      const text = typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true })
      yield* fromText(text)
    }
    yield* fromText(decoder.decode())
    return
  }
  const text = typeof body === 'string' ? body : await new Response(body).text()
  yield* fromText(text)
}

export function jsonSse(data) {
  try { return JSON.parse(data) } catch { return null }
}
