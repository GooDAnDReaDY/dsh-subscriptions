// #877: keep upstream provider secrets out of logs, alerts, webhooks and UI.
const REDACTED = '[redacted]'

/**
 * Redacts common credential shapes from an arbitrary upstream error body:
 *  - Authorization/Bearer scheme
 *  - JSON access_token/refresh_token/id_token/session_key
 *  - URL query params token/api_key/secret/access_token/refresh_token
 *  - user:pass@ userinfo
 *  - cookies or full unknown upstream response remnants
 */
export function sanitizeSecrets(text) {
  let out = String(text ?? '')
  out = out.replace(/\b(Authorization|authorization)\s*:[^,\n\r]+/g, 'Authorization: [redacted]')
  out = out.replace(/\b(Bearer|token)\s+([A-Za-z0-9._~+/=-]{6,})/g, '$1 [redacted]')
  // JSON and form-style pairs: {"access_token":"..."} and access_token=...
  out = out.replace(
    /(["']?)(access_token|refresh_token|id_token|session_key|api_key|api_token|secret|password)\1\s*[:=]\s*(["']?)([^\s"',}]{6,})\3/gi,
    (_match, keyQuote, key, valueQuote) => `${keyQuote}${key}${keyQuote}: ${valueQuote || '"'}${REDACTED}${valueQuote || '"'}`,
  )
  out = out.replace(/([?&])(token|api_key|api_token|secret|access_token|refresh_token)=([^&\s"']+)/g, '$1$2=' + REDACTED)
  out = out.replace(/([a-zA-Z0-9._%+-]+):([^\s@]{6,})@/g, '$1:[redacted]@')
  out = out.replace(/Cookie\s*:\s*[^,\n\r]+/gi, 'Cookie: [redacted]')
  return out.trim()
}

/** Returns true when the text likely contains credentials and should drop candidate. */
export function isSecretLike(text) {
  return /(?:access_token|refresh_token|id_token|session_key|api_key|api_token|secret|Bearer\s+[A-Za-z0-9._~+/=-]{6,}|[a-zA-Z0-9._%+-]+:[^\s@]{6,}@)/i.test(String(text || ''))
}
