export function sanitizeToolName(name) {
  if (typeof name !== 'string' || !name.trim()) return 'tool_fn'
  const sanitized = name.trim().replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64)
  return sanitized || 'tool_fn'
}

export function sanitizeDescription(desc) {
  if (typeof desc === 'string') return desc.trim()
  if (desc == null) return ''
  return String(desc).trim()
}

export function normalizeJsonSchema(schema, depth = 0) {
  if (depth > 12) return { type: 'string' }
  if (!schema || typeof schema !== 'object') {
    return { type: 'object' }
  }
  if (Array.isArray(schema)) {
    return normalizeJsonSchema(schema[0] || { type: 'object' }, depth + 1)
  }

  const out = {}

  let type = schema.type
  let nullable = false
  if (Array.isArray(type)) {
    nullable = type.includes('null')
    type = type.find((t) => t && t !== 'null') || 'string'
  }
  if (typeof type === 'string') {
    out.type = type.toLowerCase()
  } else if (schema.properties) {
    out.type = 'object'
  } else if (schema.items) {
    out.type = 'array'
  } else {
    out.type = depth === 0 ? 'object' : 'string'
  }

  if (nullable) {
    out.nullable = true
  }

  if (schema.description) {
    out.description = String(schema.description)
  }

  if (out.type === 'object') {
    if (schema.properties && typeof schema.properties === 'object' && !Array.isArray(schema.properties)) {
      out.properties = {}
      for (const [key, val] of Object.entries(schema.properties)) {
        if (typeof key === 'string' && key) {
          out.properties[key] = normalizeJsonSchema(val, depth + 1)
        }
      }
    }

    if (Array.isArray(schema.required)) {
      const propKeys = new Set(Object.keys(out.properties))
      const reqs = schema.required
        .filter((k) => typeof k === 'string' && k.length > 0)
        .filter((k) => propKeys.size === 0 || propKeys.has(k))
      if (reqs.length > 0) {
        out.required = [...new Set(reqs)]
      }
    }

    if (typeof schema.additionalProperties === 'boolean') {
      out.additionalProperties = schema.additionalProperties
    }
  } else if (out.type === 'array') {
    if (schema.items) {
      out.items = normalizeJsonSchema(
        Array.isArray(schema.items) ? schema.items[0] : schema.items,
        depth + 1,
      )
    } else {
      out.items = { type: 'string' }
    }
  }

  if (Array.isArray(schema.enum) && schema.enum.length > 0) {
    const cleaned = [...new Set(
      schema.enum
        .map((item) => (item != null ? String(item).trim() : ''))
        .filter((item) => item.length > 0),
    )]
    if (cleaned.length > 0) {
      out.enum = cleaned
    }
  }

  return out
}

export function normalizeTools(tools) {
  if (!Array.isArray(tools) || !tools.length) return undefined
  const validTools = []

  for (const tool of tools) {
    if (!tool || typeof tool !== 'object') continue
    const rawName = tool.name || (tool.function && tool.function.name)
    if (!rawName) continue

    const name = sanitizeToolName(rawName)
    const description = sanitizeDescription(tool.description || (tool.function && tool.function.description))
    const rawParams = tool.parameters || tool.input_schema || (tool.function && tool.function.parameters)
    const parameters = normalizeJsonSchema(rawParams)

    validTools.push({
      name,
      description,
      parameters,
    })
  }

  return validTools.length ? validTools : undefined
}
