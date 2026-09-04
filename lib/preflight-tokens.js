export function estimateTokens(text) {
  if (!text || typeof text !== 'string') return 0
  // Average English: ~4 chars per token; CJK/Code: ~1.5 - 2 chars per token
  const hasCjk = /[\u4e00-\u9fa5]/.test(text)
  const ratio = hasCjk ? 2 : 3.8
  return Math.max(1, Math.ceil(text.length / ratio))
}

export function validateContextLimit(messages, contextWindowLimit = 128000) {
  let totalChars = 0
  for (const m of messages || []) {
    const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content || '')
    totalChars += content.length
  }
  const estimated = estimateTokens(totalChars > 0 ? 'x'.repeat(totalChars) : '')
  const safe = estimated <= contextWindowLimit * 0.95
  return {
    estimatedTokens: estimated,
    limit: contextWindowLimit,
    isSafe: safe,
    marginTokens: Math.max(0, Math.floor(contextWindowLimit * 0.95 - estimated))
  }
}
