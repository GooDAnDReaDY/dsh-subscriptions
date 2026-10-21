// #98: privacy masking. Emails -> j***n@example.com. Non-email labels pass through.
export function maskEmail(value) {
  const s = String(value || '')
  const at = s.indexOf('@')
  if (at <= 0) return s
  const local = s.slice(0, at)
  const tail = local.length > 2 ? local[local.length - 1] : ''
  return local[0] + '***' + tail + s.slice(at)
}

export function maskLabel(value) {
  const s = String(value || '')
  return s.includes('@') ? maskEmail(s) : s
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g

// #99: scrub free-text (error messages, notes): mask embedded emails only.
export function maskText(value) {
  return String(value || '').replace(EMAIL_RE, (m) => maskEmail(m))
}

/** @type {Array<[RegExp, string]>} */
const SECRET_PATTERNS = [
  [/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [REDACTED]'],
  [/\b(?:sk|ghp|gho|ghu|ghs|ghr|github_pat|xox[baprs])[-_][A-Za-z0-9._-]{8,}/g, '[REDACTED]'],
  [/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED]'],
  [/\b(access_token|refresh_token|token|key|secret|password)=([^&\s]+)/gi, '$1=[REDACTED]'],
]

// #578: redact credentials as well as emails from free-text diagnostics.
export function maskSecrets(value) {
  let text = maskText(value)
  for (const [pattern, replacement] of SECRET_PATTERNS) {
    text = text.replace(pattern, replacement)
  }
  return text
}

export function cleanErrorMessage(raw) {
  if (!raw) return ''
  let text = typeof raw === 'string' ? raw : (raw.message || String(raw))
  text = text.trim()
  if (text.startsWith('{') && text.endsWith('}')) {
    try {
      const parsed = JSON.parse(text)
      if (parsed.error && parsed.error.message) text = parsed.error.message
      else if (parsed.message) text = parsed.message
      else if (parsed.code) text = parsed.code
    } catch { /* ignore JSON parse failure */ }
  }
  const firstLine = text.split('\n')[0].trim()
  if (firstLine.length > 160) {
    return firstLine.slice(0, 157) + '...'
  }
  return firstLine
}
