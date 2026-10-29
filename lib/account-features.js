function percentile(values, p) {
  const list = (Array.isArray(values) ? values : []).filter(Number.isFinite).sort((a, b) => a - b)
  if (!list.length) return null
  return list[Math.min(list.length - 1, Math.max(0, Math.ceil((p / 100) * list.length) - 1))]
}

/** #796: independent picker entries are bound to the stable credential ref. */
export function buildIndependentEntries(accounts, modelsByProvider = {}) {
  const out = []
  for (const account of Array.isArray(accounts) ? accounts : []) {
    if (!account || account.independentEntry !== true || account.hasToken === false) continue
    const alias = String(account.independentAlias || account.label || account.ref || '').trim()
    for (const model of modelsByProvider[account.provider] || []) {
      const id = typeof model === 'string' ? model : model && (model.id || model.slug)
      if (!id) continue
      out.push({
        id: 'independent:' + account.ref + ':' + id,
        model: id,
        provider: account.provider,
        accountRef: account.ref,
        alias,
      })
    }
  }
  return out
}

export function resolveIndependentEntry(entry, accounts) {
  if (!entry || entry.accountRef == null) return null
  const account = (Array.isArray(accounts) ? accounts : []).find((row) => row && row.ref === entry.accountRef)
  if (!account || account.hasToken === false) return null
  return account
}

/** #812: per-account usage loading with in-flight dedupe, stale-drop and cleanup. */
export function createUsageLoader({ load } = {}) {
  const inflight = new Map()
  const generation = new Map()
  const state = new Map()

  return {
    load(key, { force = false } = {}) {
      if (!force && inflight.has(key)) return inflight.get(key)
      const gen = (generation.get(key) || 0) + 1
      generation.set(key, gen)
      state.set(key, { ...(state.get(key) || {}), loading: true, error: null })
      const promise = Promise.resolve()
        .then(() => load(key))
        .then((value) => {
          if (generation.get(key) !== gen) return state.get(key)
          state.set(key, { value, loading: false, error: null })
          return state.get(key)
        })
        .catch((error) => {
          if (generation.get(key) !== gen) return state.get(key)
          state.set(key, { ...(state.get(key) || {}), loading: false, error: String(error && error.message || error) })
          return state.get(key)
        })
        .finally(() => { if (inflight.get(key) === promise) inflight.delete(key) })
      inflight.set(key, promise)
      return promise
    },
    get(key) { return state.get(key) || null },
    clearMissing(validKeys) {
      const keep = new Set(validKeys || [])
      for (const key of [...state.keys()]) if (!keep.has(key)) state.delete(key)
      for (const key of [...inflight.keys()]) if (!keep.has(key)) inflight.delete(key)
    },
  }
}

/** #802: explicit child choice > subagent default > session choice > global. */
export function resolveSpeed({ childSpeed, sessionSpeed, subagentSpeed, modelSupportsFast = true } = {}) {
  const pick = [childSpeed, subagentSpeed, sessionSpeed].find((value) => value === 'standard' || value === 'fast')
  if (pick === 'fast' && !modelSupportsFast) {
    const err = new Error('this model does not support fast speed')
    err.code = 'FAST_UNSUPPORTED'
    throw err
  }
  return pick || 'standard'
}

/** #789: per-provider account dashboard rows and 24h heatmap. */
export function accountDashboard(accounts, { now = Date.now(), sort = 'risk' } = {}) {
  const rows = (Array.isArray(accounts) ? accounts : []).map((account) => {
    const quota = account.usagePercent == null ? null : Number(account.usagePercent)
    const burn = Number(account.burnRatePerHour) || 0
    const runwayMinutes = quota != null && burn > 0 ? Math.max(0, Math.round(((100 - quota) / burn) * 60)) : null
    const latencies = (account.latencies || []).filter(Number.isFinite)
    return {
      ref: account.ref,
      provider: account.provider,
      label: account.label || account.email || account.ref,
      status: account.quarantineUntil && account.quarantineUntil > now ? 'quarantined'
        : account.cooldownUntil && account.cooldownUntil > now ? 'cooling' : 'healthy',
      quota,
      runwayMinutes,
      burnRatePerHour: burn,
      requests: Number(account.requests) || 0,
      errors: Number(account.errors) || 0,
      p95LatencyMs: percentile(latencies, 95),
    }
  })
  const risk = (row) => (row.quota == null ? 1000 : row.quota) + row.errors * 5
  if (sort === 'name') rows.sort((a, b) => String(a.label).localeCompare(String(b.label)))
  else if (sort === 'quota') rows.sort((a, b) => (a.quota ?? 1000) - (b.quota ?? 1000))
  else rows.sort((a, b) => risk(b) - risk(a))
  return rows
}

/** #807: searchable model editor with counters and bounded rendering. */
export function modelEditor(models, { query = '', overrides = {}, limit = 40 } = {}) {
  const q = String(query || '').trim().toLowerCase()
  const rows = (Array.isArray(models) ? models : []).map((model) => {
    const id = typeof model === 'string' ? model : model && (model.id || model.slug)
    const name = typeof model === 'string' ? model : model && model.name
    const override = overrides[id] || {}
    return {
      id,
      name: override.name || name || id,
      hidden: override.hidden === true,
      contextWindow: override.contextWindow || (model && model.contextWindow) || null,
      reasoningEffort: override.reasoningEffort || null,
    }
  }).filter((row) => row.id && (!q || [row.id, row.name].some((value) => String(value || '').toLowerCase().includes(q))))
  return {
    rows: rows.slice(0, Math.max(0, Number(limit) || 0)),
    total: rows.length,
    discovered: Array.isArray(models) ? models.length : 0,
    overridden: Object.keys(overrides || {}).length,
    hidden: rows.filter((row) => row.hidden).length,
  }
}
