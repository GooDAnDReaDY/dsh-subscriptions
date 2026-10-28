function escapeRegExp(value) {
  return String(value).replace(/[.+^${}()|[\]\\]/g, '\\$&')
}

export function globToRegExp(pattern) {
  const source = String(pattern || '').trim()
  if (!source) return null
  let out = '^'
  for (const char of source) {
    if (char === '*') out += '.*'
    else if (char === '?') out += '.'
    else out += escapeRegExp(char)
  }
  out += '$'
  try { return new RegExp(out, 'i') } catch { return null }
}

/** #788: first matching provider/model glob rule wins. */
export function matchModelAccountRule(rules, provider, model, slots) {
  const list = Array.isArray(rules) ? rules : []
  const accounts = Array.isArray(slots) ? slots : []
  for (const rule of list) {
    if (!rule || rule.provider !== provider) continue
    const pattern = globToRegExp(rule.pattern)
    if (!pattern || !pattern.test(String(model || ''))) continue
    const wanted = String(rule.account || '').trim()
    if (!wanted) continue
    const slot = accounts.find((item) => item && item.provider === provider && (
      item.ref === wanted || String(item.label || '') === wanted || String(item.index) === wanted
    ))
    if (slot) return slot.ref
  }
  return null
}
