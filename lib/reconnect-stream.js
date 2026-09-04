export async function* streamWithReconnect(streamProducer, { maxReconnects = 2 } = {}) {
  let reconnects = 0
  let emittedCount = 0

  while (true) {
    try {
      for await (const chunk of streamProducer(emittedCount)) {
        emittedCount++
        yield chunk
      }
      return
    } catch (err) {
      reconnects++
      if (reconnects > maxReconnects) {
        throw err
      }
      // Brief pause before reconnect
      await new Promise((r) => setTimeout(r, 250))
    }
  }
}
