import { geminiFunctionDeclarations } from './gemini-schema.js'

function flattenText(content) {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter((block) => block && (block.type === 'text' || block.type === 'reasoning'))
    .map((block) => block.text || '')
    .join('')
}

function toolResults(content) {
  return Array.isArray(content) ? content.filter((b) => b && b.type === 'tool-result') : []
}

function toolCalls(content) {
  return Array.isArray(content) ? content.filter((b) => b && b.type === 'tool-call') : []
}

export function openaiMessages(options) {
  const out = []
  if (options.system) out.push({ role: 'system', content: options.system })
  for (const message of options.messages || []) {
    if (message.role === 'system') {
      out.push({ role: 'system', content: flattenText(message.content) })
      continue
    }
    if (message.role === 'assistant') {
      const calls = toolCalls(message.content).map((block) => ({
        id: block.id,
        type: 'function',
        function: { name: block.name, arguments: block.arguments || '{}' },
      }))
      out.push({
        role: 'assistant',
        content: flattenText(message.content) || (calls.length ? null : ''),
        ...(calls.length ? { tool_calls: calls } : {}),
      })
      continue
    }
    const results = toolResults(message.content)
    const text = flattenText(message.content)
    if (text || !results.length) out.push({ role: 'user', content: text })
    for (const result of results) {
      out.push({
        role: 'tool',
        tool_call_id: result.toolCallId,
        content: flattenText(result.content) || '(no output)',
      })
    }
  }
  return out
}

export function openaiTools(options) {
  const tools = options.tools
  if (!Array.isArray(tools) || !tools.length) return undefined
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description || '',
      parameters: tool.parameters || { type: 'object' },
    },
  }))
}

export function codexResponsesBody(options, fallbackInstructions, vendorCfg) {
  const systemParts = []
  if (options.system) systemParts.push(options.system)
  const input = []
  let pendingRole = null
  let pendingContent = []
  function flush() {
    if (!pendingRole) return
    const type = pendingRole === 'assistant' ? 'output_text' : 'input_text'
    input.push({
      role: pendingRole,
      content: pendingContent.length ? pendingContent : [{ type, text: '' }],
    })
    pendingRole = null
    pendingContent = []
  }
  function addText(role, text) {
    const type = role === 'assistant' ? 'output_text' : 'input_text'
    if (pendingRole && pendingRole !== role) flush()
    pendingRole = role
    if (text) pendingContent.push({ type, text })
  }
  for (const message of options.messages || []) {
    if (message.role === 'system') {
      systemParts.push(flattenText(message.content))
      continue
    }
    if (message.role === 'assistant') {
      const text = flattenText(message.content)
      if (text) addText('assistant', text)
      for (const call of toolCalls(message.content)) {
        flush()
        input.push({
          type: 'function_call',
          call_id: String(call.id || ''),
          name: call.name,
          arguments: typeof call.arguments === 'string' ? call.arguments : JSON.stringify(call.arguments || {}),
        })
      }
      continue
    }
    const text = flattenText(message.content)
    if (text) addText('user', text)
    for (const result of toolResults(message.content)) {
      flush()
      input.push({
        type: 'function_call_output',
        call_id: String(result.toolCallId || ''),
        output: flattenText(result.content) || '',
      })
    }
  }
  flush()
  if (!input.length) input.push({ role: 'user', content: [{ type: 'input_text', text: '' }] })
  const tools = openaiTools(options)
  const responsesTools = tools && tools.map((tool) => ({
    type: 'function',
    name: tool.function.name,
    description: tool.function.description,
    parameters: tool.function.parameters,
  }))
  const instructions = systemParts.filter(Boolean).join('\n\n') || fallbackInstructions
  return {
    model: options.model,
    stream: true,
    store: false,
    instructions,
    input,
    ...(responsesTools && responsesTools.length ? { tools: responsesTools } : {}),
    // #93: reasoning effort chosen in the native picker flows to the protocol.
    ...(options.reasoningEffort ? { reasoning: { effort: String(options.reasoningEffort) } } : {}),
    // #93: verbosity comes from the codexVerbosity setting (low/medium/high).
    ...(vendorCfg && /^(low|medium|high)$/.test(String(vendorCfg.verbosity || ''))
      ? { text: { verbosity: String(vendorCfg.verbosity) } } : {}),
    ...(options.maxTokens != null ? { max_output_tokens: options.maxTokens } : {}),
    ...(options.temperature != null ? { temperature: options.temperature } : {}),
  }
}

export function anthropicPayload(options, extraSystem) {
  const systemParts = []
  if (extraSystem) systemParts.push(extraSystem)
  if (options.system) systemParts.push(options.system)
  const messages = []
  for (const message of options.messages || []) {
    if (message.role === 'system') {
      systemParts.push(flattenText(message.content))
      continue
    }
    if (message.role === 'assistant') {
      const blocks = []
      const text = flattenText(message.content)
      if (text) blocks.push({ type: 'text', text })
      for (const call of toolCalls(message.content)) {
        blocks.push({
          type: 'tool_use',
          id: call.id,
          name: call.name,
          input: safeJson(call.arguments),
        })
      }
      messages.push({ role: 'assistant', content: blocks.length ? blocks : [{ type: 'text', text: '' }] })
      continue
    }
    const blocks = []
    const text = flattenText(message.content)
    if (text) blocks.push({ type: 'text', text })
    for (const result of toolResults(message.content)) {
      blocks.push({
        type: 'tool_result',
        tool_use_id: result.toolCallId,
        content: flattenText(result.content) || '',
      })
    }
    messages.push({ role: 'user', content: blocks.length ? blocks : [{ type: 'text', text: '' }] })
  }
  const tools = Array.isArray(options.tools)
    ? options.tools.map((tool) => ({
      name: tool.name,
      description: tool.description || '',
      input_schema: tool.parameters || { type: 'object' },
    }))
    : undefined
  return {
    model: options.model,
    max_tokens: options.maxTokens || 8192,
    stream: true,
    ...(systemParts.length ? { system: systemParts.join('\n\n') } : {}),
    messages,
    ...(tools && tools.length ? { tools } : {}),
    ...(options.temperature != null ? { temperature: options.temperature } : {}),
  }
}

export function googleContents(options) {
  const contents = []
  const systemParts = []
  if (options.system) systemParts.push({ text: options.system })
  for (const message of options.messages || []) {
    if (message.role === 'system') {
      systemParts.push({ text: flattenText(message.content) })
      continue
    }
    const role = message.role === 'assistant' ? 'model' : 'user'
    const parts = []
    const text = flattenText(message.content)
    if (text) parts.push({ text })
    for (const call of toolCalls(message.content)) {
      parts.push({ functionCall: { name: call.name, args: safeJson(call.arguments) } })
    }
    for (const result of toolResults(message.content)) {
      parts.push({
        functionResponse: {
          name: result.toolName || result.name || 'tool',
          response: { output: flattenText(result.content) },
        },
      })
    }
    if (!parts.length) parts.push({ text: '' })
    contents.push({ role, parts })
  }
  const declarations = geminiFunctionDeclarations(options.tools)
  const tools = declarations ? [{ functionDeclarations: declarations }] : undefined
  return {
    contents,
    ...(systemParts.length ? { systemInstruction: { parts: systemParts } } : {}),
    ...(tools ? { tools } : {}),
    generationConfig: {
      ...(options.temperature != null ? { temperature: options.temperature } : {}),
      ...(options.maxTokens != null ? { maxOutputTokens: options.maxTokens } : {}),
    },
  }
}

function safeJson(text) {
  if (text && typeof text === 'object') return text
  try { return JSON.parse(text || '{}') } catch { return {} }
}

export function modelCatalog(provider, entries) {
  return (entries || []).map((entry) => {
    if (!entry) return null
    if (typeof entry === 'string') return { provider, id: entry, name: entry }
    const id = entry.id || entry.slug || entry.name
    if (!id) return null
    return {
      provider,
      id,
      name: entry.name || entry.display_name || id,
      ...(entry.description ? { description: entry.description } : {}),
      ...(entry.contextWindow ? { contextWindow: entry.contextWindow } : {}),
      ...(entry.inputModalities ? { inputModalities: entry.inputModalities } : {}),
      ...(entry.reasoning ? { reasoning: entry.reasoning } : {}),
    }
  }).filter(Boolean)
}