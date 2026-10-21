function rowsFor(rows, provider) {
  return (Array.isArray(rows) ? rows : []).filter((row) => row && row.provider === provider)
}

const PLAN_RANK = { free: 0, plus: 1, pro: 2, max: 3, team: 3, enterprise: 4 }

export function planRank(name) {
  return PLAN_RANK[String(name || '').toLowerCase()] ?? 0
}

export function bestAccountPlan(accounts) {
  let best = null
  for (const account of accounts || []) {
    const plan = account && (account.plan || account.paidTierName)
    if (!plan) continue
    if (!best || planRank(plan) > planRank(best)) best = String(plan)
  }
  return best
}

export function applyModelSettings(provider, models, cfg = {}, accountPlan = null) {
  const list = Array.isArray(models) ? models : []
  const hidden = new Set(rowsFor(cfg.hiddenModels, provider).map((row) => String(row.id)))
  const plans = new Map(rowsFor(cfg.modelPlans, provider).map((row) => [String(row.id), String(row.minPlan || '')]))
  const accountRank = accountPlan ? planRank(accountPlan) : null
  const names = new Map(rowsFor(cfg.modelDisplayNames, provider).map((row) => [String(row.id), String(row.name)]))
  const contexts = new Map(rowsFor(cfg.modelContextWindows, provider).map((row) => [String(row.id), Number(row.contextWindow)]))
  const efforts = new Map(rowsFor(cfg.modelReasoningDefaults, provider).map((row) => [String(row.id), String(row.effort).toLowerCase()]))
  return list
    .filter((model) => {
      if (!model || hidden.has(String(model.id))) return false
      const minPlan = plans.get(String(model.id))
      if (minPlan && accountRank != null && planRank(minPlan) > accountRank) return false
      return true
    })
    .map((model) => {
      const id = String(model.id)
      const minPlan = plans.get(id)
      const contextWindow = contexts.get(id)
      const effort = efforts.get(id)
      return {
        ...model,
        name: names.get(id) || model.name || model.id,
        ...(Number.isFinite(contextWindow) && contextWindow > 0 ? { contextWindow } : {}),
        ...(effort ? { reasoning: { ...(model.reasoning || {}), defaultEffort: effort } } : {}),
        ...(minPlan ? { plan: minPlan, minPlan } : {}),
      }
    })
}
