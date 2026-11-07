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
// #877: include camelCase and additional sensitive fields.
const SECRET_KEY_NAMES = 'access_token|accessToken|refresh_token|refreshToken|id_token|idToken|session_key|sessionKey|session_token|sessionToken|api_key|apiKey|api_token|apiToken|apikey|secret|client_secret|clientSecret|private_key|privateKey|secret_key|secretKey|password|passwd|proxy_password|proxyPassword|master_key|masterKey|passphrase|cookie|cookies|token|authorization|Authorization|proxy_authorization|proxyAuthorization|proxy-authorization|auth_token|authToken'
const SECRET_PREFIX = /\b(?:sk-[A-Za-z0-9_-]{8,}|sk-ant-[A-Za-z0-9_-]{8,}|sk-proj-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{8,}|gho_[A-Za-z0-9]{8,}|ghu_[A-Za-z0-9]{8,}|ghs_[A-Za-z0-9]{8,}|ghr_[A-Za-z0-9]{8,}|github_pat_[A-Za-z0-9_]{8,}|glpat-[A-Za-z0-9_-]{8,}|xox[abprs]-[A-Za-z0-9-]{8,}|AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{20,}|ya29\.[A-Za-z0-9._-]{8,}|1\/\/0[A-Za-z0-9._-]{8,}|IQoJ[A-Za-z0-9+/=]{20,})\b/g
const JWT = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
const SECRET_PREFIX_TEST = new RegExp(SECRET_PREFIX.source)
const JWT_TEST = new RegExp(JWT.source)

export function sanitizeSecrets(text) {
  let out = String(text ?? '')
  out = out.replace(/\b(Authorization|Proxy-Authorization|authorization|proxy-authorization)\s*:[^,\n\r]+/g, '$1: [redacted]')
  out = out.replace(/\b(Bearer|Basic|Digest|token)\s+([A-Za-z0-9._~+/=-]{6,})/g, '$1 [redacted]')
  out = out.replace(/\b(x-api-key|x-goog-api-key|api-key|set-cookie)\s*:\s*[^,\n\r]+/gi, '$1: [redacted]')
  out = out.replace(SECRET_PREFIX, REDACTED)
  out = out.replace(JWT, REDACTED)
  // JSON and form-style pairs: {"access_token":"..."} and access_token=...
  out = out.replace(
    new RegExp(`(["']?)(${SECRET_KEY_NAMES})\\1\\s*[:=]\\s*(["']?)([^\\s"',}]{6,})\\3`, 'gi'),
    (_match, keyQuote, key, valueQuote) => `${keyQuote}${key}${keyQuote}: ${valueQuote || '"'}${REDACTED}${valueQuote || '"'}`,
  )
  out = out.replace(new RegExp(`([?&])(${SECRET_KEY_NAMES}|key|sig|signature)=([^&\\s"']+)`, 'gi'), `$1$2=${REDACTED}`)
  out = out.replace(/([a-zA-Z0-9._%+-]+):([^\s@]{6,})@/g, '$1:[redacted]@')
  out = out.replace(/Cookie\s*:\s*[^,\n\r]+/gi, 'Cookie: [redacted]')
  out = out.replace(EMAIL, '[redacted-email]')
  return out.trim()
}

/** Returns true when the text likely contains credentials and should drop candidate. */
export function isSecretLike(text) {
  const value = String(text || '')
  return SECRET_PREFIX_TEST.test(value) || JWT_TEST.test(value)
    || /(?:access_token|accessToken|refresh_token|refreshToken|id_token|idToken|session_key|sessionKey|session_token|sessionToken|api_key|apiKey|api_token|apiToken|client_secret|clientSecret|private_key|privateKey|secret_key|secretKey|password|passwd|proxy_password|proxyPassword|master_key|masterKey|passphrase|authorization|proxy_authorization|proxyAuthorization|auth_token|authToken|Bearer\s+[A-Za-z0-9._~+/=-]{6,}|[a-zA-Z0-9._%+-]+:[^\s@]{6,}@)/i.test(value)
}
