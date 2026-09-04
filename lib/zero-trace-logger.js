const SENSITIVE_PATTERNS = [
  /Bearer\s+([^\s,"'}]+)/gi,
  /(access_token|refresh_token|token|api_key|secret|password|authorization)=([^&\s]+)/gi,
  /("?(?:accessToken|refreshToken|apiKey|secretKey|token)"?\s*:\s*")([^"]+)(")/gi
]

export function sanitizeLogText(text) {
  if (typeof text !== 'string') {
    try {
      text = JSON.stringify(text)
    } catch {
      return '[Unserializable]'
    }
  }

  let sanitized = text
  // 1. Bearer
  sanitized = sanitized.replace(/Bearer\s+([^\s,"'}]+)/gi, 'Bearer ***MASKED***')

  // 2. Query param style
  sanitized = sanitized.replace(/(access_token|refresh_token|token|api_key|secret|password|authorization)=([^&\s]+)/gi, '$1=***MASKED***')

  // 3. JSON key style
  sanitized = sanitized.replace(/("?(?:accessToken|refreshToken|apiKey|secretKey|token)"?\s*:\s*")([^"]+)(")/gi, '$1***MASKED***$3')

  return sanitized
}
