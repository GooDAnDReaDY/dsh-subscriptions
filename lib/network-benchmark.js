export async function benchmarkEndpoint(url, fetchImpl) {
  const impl = fetchImpl || fetch
  const start = Date.now()
  try {
    const res = await impl(url, { method: 'HEAD', signal: AbortSignal.timeout(4000) })
    const ttfb = Date.now() - start
    return {
      url,
      ok: res.ok,
      status: res.status,
      latencyMs: ttfb,
      grade: ttfb < 300 ? 'A' : (ttfb < 800 ? 'B' : 'C')
    }
  } catch (err) {
    return {
      url,
      ok: false,
      error: err.message,
      latencyMs: Date.now() - start,
      grade: 'F'
    }
  }
}
