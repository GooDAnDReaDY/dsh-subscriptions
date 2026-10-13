export const SOFT_FAILURE_PATTERNS = [
  /currently (?:unable to process|unavailable|overloaded)/i,
  /experiencing (?:exceptionally )?(?:high|heavy) (?:traffic|demand|load)/i,
  /capacity (?:is )?temporarily (?:unavailable|limited|exceeded)/i,
  /model is (?:currently )?(?:overloaded|busy)/i,
  /due to high traffic/i,
  /usage cap reached, switching to lower/i,
  /you have reached your (?:current )?usage limit/i,
  /server is currently under heavy load/i,
  /i apologize, but (?:i am unable to assist|i cannot fulfill this request due to (?:high demand|capacity|server load))/i,
  /our systems are experiencing heavy load/i,
]

const SUSPICIOUS_ROOTS = [
  'i am',
  'i apologize',
  'we are',
  'capacity',
  'the model',
  'due to',
  'usage cap',
  'you have reached',
  'server is',
  'our systems',
]

export function extractChunkText(chunk) {
  if (!chunk) return ''
  if (typeof chunk === 'string') return chunk
  if (typeof chunk.delta === 'string') return chunk.delta
  if (typeof chunk.content === 'string') return chunk.content
  if (typeof chunk.text === 'string') return chunk.text
  if (chunk.choices && Array.isArray(chunk.choices) && chunk.choices[0]) {
    const c0 = chunk.choices[0]
    if (c0.delta && typeof c0.delta.content === 'string') return c0.delta.content
    if (typeof c0.text === 'string') return c0.text
  }
  if (chunk.candidates && Array.isArray(chunk.candidates) && chunk.candidates[0]) {
    const cand = chunk.candidates[0]
    if (cand.content && Array.isArray(cand.content.parts)) {
      return cand.content.parts.map((p) => (p && typeof p.text === 'string' ? p.text : '')).join('')
    }
  }
  return ''
}

export function detectSoftFailure(text) {
  if (!text || typeof text !== 'string') return null
  const cleaned = text.trim()
  if (!cleaned) return null
  for (const pattern of SOFT_FAILURE_PATTERNS) {
    if (pattern.test(cleaned)) {
      return pattern.toString()
    }
  }
  return null
}

export function isCandidatePrefix(text) {
  if (!text) return true
  const low = text.toLowerCase().trim()
  if (low.length < 3) return true
  for (const root of SUSPICIOUS_ROOTS) {
    if (root.startsWith(low) || low.startsWith(root)) {
      return true
    }
  }
  return false
}

export function createSoftFailureError(pattern, text) {
  const preview = String(text || '').slice(0, 120).replace(/\s+/g, ' ')
  const err = new Error(`Soft-failure detected: ${preview}`)
  return Object.assign(err, {
    name: 'SoftFailureError',
    code: 'SOFT_FAILURE',
    status: 429,
    isSoftFailure: true,
    degraded: true,
    pattern,
  })
}

export async function* withSoftFailureSentinel(stream, options = {}) {
  const enabled = options.enabled !== false
  if (!enabled || !stream) {
    if (stream) {
      for await (const chunk of stream) {
        yield chunk
      }
    }
    return
  }

  const bufferLimitChars = Number(options.bufferLimitChars) || 250
  const maxBufferChunks = Number(options.maxBufferChunks) || 4

  const bufferedChunks = []
  let accumulatedText = ''
  let flushed = false

  for await (const chunk of stream) {
    if (flushed) {
      yield chunk
      continue
    }

    bufferedChunks.push(chunk)
    accumulatedText += extractChunkText(chunk)

    const matched = detectSoftFailure(accumulatedText)
    if (matched) {
      throw createSoftFailureError(matched, accumulatedText)
    }

    const candidate = isCandidatePrefix(accumulatedText)
    if (!candidate || accumulatedText.length >= bufferLimitChars || bufferedChunks.length >= maxBufferChunks) {
      flushed = true
      for (const b of bufferedChunks) {
        yield b
      }
      bufferedChunks.length = 0
    }
  }

  if (!flushed) {
    const matched = detectSoftFailure(accumulatedText)
    if (matched) {
      throw createSoftFailureError(matched, accumulatedText)
    }
    for (const b of bufferedChunks) {
      yield b
    }
    bufferedChunks.length = 0
  }
}
