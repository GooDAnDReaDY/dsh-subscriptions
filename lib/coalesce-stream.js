export async function* coalesceStreamChunks(sourceStream, maxWaitMs = 40, maxChunkChars = 80) {
  let buffer = ''
  let lastFlush = Date.now()

  for await (const chunk of sourceStream) {
    const text = typeof chunk === 'string' ? chunk : (chunk && chunk.text) || ''
    buffer += text

    const now = Date.now()
    if (buffer.length >= maxChunkChars || now - lastFlush >= maxWaitMs) {
      if (buffer.length > 0) {
        yield buffer
        buffer = ''
        lastFlush = now
      }
    }
  }

  if (buffer.length > 0) {
    yield buffer
  }
}
