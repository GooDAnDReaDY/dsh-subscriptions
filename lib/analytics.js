// Subscription and cache analytics, performance aggregates, and quota forecasting.
// Enforces 0 Cyrillic characters.

export function calculatePercentile(values, percentile) {
  if (!Array.isArray(values) || values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((percentile / 100) * sorted.length) - 1)
  )
  return sorted[index]
}

export function calculateCacheMetrics(entries = []) {
  let promptTokens = 0
  let completionTokens = 0
  let cacheReadTokens = 0
  let cacheCreationTokens = 0
  let requestsWithCacheRead = 0

  for (const r of entries) {
    if (!r) continue
    const prompt = typeof r.inputTokens === 'number'
      ? r.inputTokens
      : (r.tokens && typeof r.tokens.prompt === 'number' ? r.tokens.prompt : 0)
    const completion = typeof r.outputTokens === 'number'
      ? r.outputTokens
      : (r.tokens && typeof r.tokens.completion === 'number' ? r.tokens.completion : 0)
    const read = typeof r.cacheReadTokens === 'number'
      ? r.cacheReadTokens
      : (r.tokens && typeof r.tokens.cacheRead === 'number' ? r.tokens.cacheRead : 0)
    const creation = typeof r.cacheCreationTokens === 'number'
      ? r.cacheCreationTokens
      : (r.tokens && typeof r.tokens.cacheCreation === 'number' ? r.tokens.cacheCreation : 0)

    promptTokens += prompt
    completionTokens += completion
    cacheReadTokens += read
    cacheCreationTokens += creation
    if (read > 0) requestsWithCacheRead++
  }

  const totalTokens = promptTokens + completionTokens
  const cacheTotal = promptTokens + cacheReadTokens
  const cacheHitRate = cacheTotal > 0
    ? Math.round((cacheReadTokens / cacheTotal) * 1000) / 10
    : 0

  return {
    promptTokens,
    completionTokens,
    totalTokens,
    cacheReadTokens,
    cacheCreationTokens,
    cacheHitRate,
    requestsWithCacheRead,
    cacheHitCount: requestsWithCacheRead,
  }
}

export function calculatePerformanceMetrics(entries = []) {
  const ttftList = []
  const tpsList = []
  const latencyList = []

  let ttftSum = 0
  let tpsSum = 0
  let latencySum = 0

  for (const r of entries) {
    if (!r) continue
    if (typeof r.ttftMs === 'number' && r.ttftMs >= 0) {
      ttftList.push(r.ttftMs)
      ttftSum += r.ttftMs
    }
    if (typeof r.tps === 'number' && r.tps > 0) {
      tpsList.push(r.tps)
      tpsSum += r.tps
    }
    if (typeof r.ms === 'number' && r.ms > 0) {
      latencyList.push(r.ms)
      latencySum += r.ms
    }
  }

  const count = entries.length
  return {
    ttft: {
      count: ttftList.length,
      avgMs: ttftList.length > 0 ? Math.round(ttftSum / ttftList.length) : null,
      p95Ms: calculatePercentile(ttftList, 95),
      minMs: ttftList.length > 0 ? Math.min(...ttftList) : null,
      maxMs: ttftList.length > 0 ? Math.max(...ttftList) : null,
    },
    tps: {
      count: tpsList.length,
      avg: tpsList.length > 0 ? Math.round((tpsSum / tpsList.length) * 10) / 10 : null,
      p95: calculatePercentile(tpsList, 95),
      min: tpsList.length > 0 ? Math.min(...tpsList) : null,
      max: tpsList.length > 0 ? Math.max(...tpsList) : null,
    },
    latency: {
      count: latencyList.length,
      avgMs: latencyList.length > 0 ? Math.round(latencySum / latencyList.length) : 0,
      p95Ms: calculatePercentile(latencyList, 95),
      minMs: latencyList.length > 0 ? Math.min(...latencyList) : 0,
      maxMs: latencyList.length > 0 ? Math.max(...latencyList) : 0,
      totalRequests: count,
    },
  }
}

export function calculateHourlyBuckets(entries = [], nowMs = Date.now()) {
  const buckets = []
  const ONE_HOUR = 3600000

  for (let i = 23; i >= 0; i--) {
    const end = nowMs - (i * ONE_HOUR)
    const start = end - ONE_HOUR
    const dateObj = new Date(start)
    const hourNum = dateObj.getHours()
    const hourStr = String(hourNum).padStart(2, '0') + ':00'

    buckets.push({
      hour: hourNum,
      label: hourStr,
      start,
      end,
      requests: 0,
      successCount: 0,
      errorCount: 0,
      promptTokens: 0,
      completionTokens: 0,
      cacheReadTokens: 0,
      totalTokens: 0,
    })
  }

  const cutoff = nowMs - (24 * ONE_HOUR)
  for (const r of entries) {
    if (!r || !r.ts || r.ts < cutoff || r.ts > nowMs) continue
    const age = nowMs - r.ts
    const bucketIndex = 23 - Math.floor(age / ONE_HOUR)
    if (bucketIndex >= 0 && bucketIndex < 24) {
      const b = buckets[bucketIndex]
      b.requests++
      const st = Number(r.status || 0)
      if (st >= 200 && st < 400) b.successCount++
      else if (st >= 400) b.errorCount++

      const prompt = Number(r.inputTokens || (r.tokens && r.tokens.prompt) || 0)
      const completion = Number(r.outputTokens || (r.tokens && r.tokens.completion) || 0)
      const cacheRead = Number(r.cacheReadTokens || (r.tokens && r.tokens.cacheRead) || 0)

      b.promptTokens += prompt
      b.completionTokens += completion
      b.cacheReadTokens += cacheRead
      b.totalTokens += (prompt + completion)
    }
  }

  return buckets
}

export function calculateAccountBreakdown(entries = [], accounts = []) {
  const map = {}
  const labels = {}
  for (const a of accounts) {
    if (a && a.ref) {
      labels[a.ref] = a.label || a.ref
    }
  }

  for (const r of entries) {
    if (!r || !r.ref) continue
    const ref = r.ref
    if (!map[ref]) {
      map[ref] = {
        ref,
        provider: r.provider || 'unknown',
        label: labels[ref] || r.accountLabel || ref,
        totalRequests: 0,
        successRequests: 0,
        errorRequests: 0,
        promptTokens: 0,
        completionTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        ttftSum: 0,
        ttftCount: 0,
        tpsSum: 0,
        tpsCount: 0,
        latencySum: 0,
      }
    }
    const acc = map[ref]
    acc.totalRequests++
    const st = Number(r.status || 0)
    if (st >= 200 && st < 400) acc.successRequests++
    else if (st >= 400) acc.errorRequests++

    const prompt = Number(r.inputTokens || (r.tokens && r.tokens.prompt) || 0)
    const completion = Number(r.outputTokens || (r.tokens && r.tokens.completion) || 0)
    const cacheRead = Number(r.cacheReadTokens || (r.tokens && r.tokens.cacheRead) || 0)
    const cacheCreation = Number(r.cacheCreationTokens || (r.tokens && r.tokens.cacheCreation) || 0)

    acc.promptTokens += prompt
    acc.completionTokens += completion
    acc.cacheReadTokens += cacheRead
    acc.cacheCreationTokens += cacheCreation

    if (typeof r.ttftMs === 'number' && r.ttftMs >= 0) {
      acc.ttftSum += r.ttftMs
      acc.ttftCount++
    }
    if (typeof r.tps === 'number' && r.tps > 0) {
      acc.tpsSum += r.tps
      acc.tpsCount++
    }
    if (typeof r.ms === 'number' && r.ms > 0) {
      acc.latencySum += r.ms
    }
  }

  const result = {}
  for (const [ref, acc] of Object.entries(map)) {
    const totalCache = acc.promptTokens + acc.cacheReadTokens
    result[ref] = {
      ref,
      provider: acc.provider,
      label: acc.label,
      totalRequests: acc.totalRequests,
      successRequests: acc.successRequests,
      errorRequests: acc.errorRequests,
      promptTokens: acc.promptTokens,
      completionTokens: acc.completionTokens,
      cacheReadTokens: acc.cacheReadTokens,
      cacheCreationTokens: acc.cacheCreationTokens,
      cacheHitRate: totalCache > 0 ? Math.round((acc.cacheReadTokens / totalCache) * 1000) / 10 : 0,
      avgTtftMs: acc.ttftCount > 0 ? Math.round(acc.ttftSum / acc.ttftCount) : null,
      avgTps: acc.tpsCount > 0 ? Math.round((acc.tpsSum / acc.tpsCount) * 10) / 10 : null,
      avgLatencyMs: acc.totalRequests > 0 ? Math.round(acc.latencySum / acc.totalRequests) : 0,
    }
  }
  return result
}

export function calculateQuotaForecast(accounts = [], entries = [], nowMs = Date.now()) {
  const ONE_HOUR = 3600000
  const ONE_DAY = 24 * ONE_HOUR
  const forecast = []

  for (const acc of accounts) {
    if (!acc || !acc.ref) continue
    const quota = acc.quota
    const ref = acc.ref

    // Calculate recent usage over the past 24 hours for this account
    let tokens24h = 0
    let requests24h = 0
    let tokens1h = 0
    let requests1h = 0

    for (const r of entries) {
      if (!r || r.ref !== ref || !r.ts) continue
      const age = nowMs - r.ts
      if (age <= ONE_DAY) {
        const total = Number(r.inputTokens || (r.tokens && r.tokens.prompt) || 0) +
                      Number(r.outputTokens || (r.tokens && r.tokens.completion) || 0)
        tokens24h += total
        requests24h++
        if (age <= ONE_HOUR) {
          tokens1h += total
          requests1h++
        }
      }
    }

    const burnRateTokensPerHour = requests1h > 0 ? tokens1h : Math.round(tokens24h / 24)

    let willExhaustBeforeReset = false
    let projectedExhaustionAt = null
    let hoursToExhaustion = null
    let remainingMs = null

    if (quota && typeof quota.percentage === 'number') {
      const remainingPercent = Math.max(0, Math.min(100, quota.percentage))
      const resetAt = typeof quota.resetAt === 'number' ? quota.resetAt : null

      if (resetAt && resetAt > nowMs) {
        remainingMs = resetAt - nowMs
      }

      // If quota is low and active burn rate exists
      if (burnRateTokensPerHour > 0 && remainingPercent > 0) {
        // Approximate burn rate percentage per hour based on 24h consumption
        // If 24h consumed tokens24h and quota dropped, estimate burn % per hour
        const estimatedPercentPerHour = tokens24h > 0 ? Math.max(0.5, (100 - remainingPercent) / 24) : 0
        if (estimatedPercentPerHour > 0) {
          hoursToExhaustion = Math.round((remainingPercent / estimatedPercentPerHour) * 10) / 10
          const msToExhaustion = hoursToExhaustion * ONE_HOUR
          if (remainingMs !== null && msToExhaustion < remainingMs) {
            willExhaustBeforeReset = true
            projectedExhaustionAt = nowMs + msToExhaustion
          }
        }
      }
    }

    forecast.push({
      ref,
      provider: acc.provider,
      label: acc.label || ref,
      quotaPercent: quota && typeof quota.percentage === 'number' ? quota.percentage : null,
      resetAt: quota && typeof quota.resetAt === 'number' ? quota.resetAt : null,
      burnRateTokensPerHour,
      requests24h,
      tokens24h,
      hoursToExhaustion,
      willExhaustBeforeReset,
      projectedExhaustionAt,
    })
  }

  return forecast
}

export function calculateAnalytics(entries = [], accounts = [], nowMs = Date.now()) {
  return {
    generatedAt: new Date(nowMs).toISOString(),
    totalRequests: entries.length,
    cache: calculateCacheMetrics(entries),
    performance: calculatePerformanceMetrics(entries),
    hourly: calculateHourlyBuckets(entries, nowMs),
    accounts: calculateAccountBreakdown(entries, accounts),
    forecast: calculateQuotaForecast(accounts, entries, nowMs),
  }
}
