const FAMILIES = [
  { re: /claude/i, budget: 1024, effort: 'high', levels: ['low', 'medium', 'high'] },
  { re: /gpt-oss/i, budget: 8192, effort: 'medium', levels: ['low', 'medium', 'high'] },
  { re: /gemini-3\./i, budgets: { low: 1024, medium: 8192, high: 24576 }, effort: 'medium', levels: ['low', 'medium', 'high'] },
]

function familyFor(model) {
  return FAMILIES.find((family) => family.re.test(String(model || ''))) || null
}

function codedError(message, code) {
  /** @type {Error & { code?: string }} */
  const err = new Error(message)
  err.code = code
  return err
}

/** #826: family-specific Antigravity reasoning budget with explicit errors. */
export function antigravityReasoning(model, effort, maxTokens) {
  const family = familyFor(model)
  if (!family) return { supported: false, thinkingBudget: null, effort: null, maxTokens }
  const requested = String(effort || family.effort).toLowerCase()
  if (!family.levels.includes(requested)) {
    throw codedError('unsupported reasoning effort for ' + model + ': ' + requested, 'UNSUPPORTED_REASONING_EFFORT')
  }
  const thinkingBudget = family.budgets ? family.budgets[requested] : family.budget
  if (maxTokens != null && Number(maxTokens) <= thinkingBudget) {
    throw codedError('maxTokens must exceed thinking budget', 'UNSUPPORTED_REASONING_EFFORT')
  }
  return { supported: true, thinkingBudget, effort: requested, maxTokens }
}

function deref(schema, root, seen) {
  if (!schema || typeof schema !== 'object') return schema
  if (typeof schema.$ref === 'string') {
    const ref = schema.$ref
    if (!ref.startsWith('#/')) {
      throw codedError('remote $ref is not supported', 'UNSUPPORTED_TOOL_SCHEMA')
    }
    if (seen.has(ref)) {
      throw codedError('cyclic $ref is not supported', 'UNSUPPORTED_TOOL_SCHEMA')
    }
    const path = ref.slice(2).split('/').map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'))
    let target = root
    for (const key of path) target = target && target[key]
    if (!target) {
      throw codedError('missing local $ref: ' + ref, 'UNSUPPORTED_TOOL_SCHEMA')
    }
    return deref(target, root, new Set([...seen, ref]))
  }
  return schema
}

function strip(schema, root, seen) {
  if (Array.isArray(schema)) return schema.map((item) => strip(item, root, seen))
  if (!schema || typeof schema !== 'object') return schema
  const resolved = deref(schema, root, seen)
  if (resolved !== schema) return strip(resolved, root, seen)
  const out = {}
  for (const [key, value] of Object.entries(schema)) {
    if (key === '$schema' || key === '$id' || key === '$defs' || key === 'definitions') continue
    out[key] = strip(value, root, seen)
  }
  if (Array.isArray(out.anyOf)) {
    const variants = out.anyOf.filter((v) => v && typeof v === 'object')
    if (variants.length === 1) return variants[0]
    if (variants.every((v) => v.type === variants[0].type)) out.type = variants[0].type
  }
  if (Array.isArray(out.oneOf)) {
    const variants = out.oneOf.filter((v) => v && typeof v === 'object')
    if (variants.length === 1) return variants[0]
    if (variants.every((v) => v.type === variants[0].type)) out.type = variants[0].type
  }
  return out
}

/** #826: expand local refs, reject cycles/remote refs, strip metadata, widen unions. */
export function normalizeAntigravityToolSchema(schema) {
  return strip(schema, schema, new Set())
}
