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

export function supportsFastTier(model) {
  return /(?:^|[-_.])(gpt-5|gpt-6|codex|o3|o4)(?:[-_.]|$)/i.test(String(model || ''))
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

