export function decodeJwtPayload(token) {
  const raw = String(token || '')
  const parts = raw.split('.')
  if (parts.length < 2) return null
  try {
    const json = Buffer.from(parts[1], 'base64url').toString('utf8')
    return JSON.parse(json)
  } catch {
    return null
  }
}

export function chatgptAccountId(token) {
  const payload = decodeJwtPayload(token)
  if (!payload || typeof payload !== 'object') return ''
  if (payload.chatgpt_account_id) return String(payload.chatgpt_account_id)
  const nested = payload['https://api.openai.com/auth']
  if (nested && nested.chatgpt_account_id) return String(nested.chatgpt_account_id)
  const orgs = payload.organizations
  if (Array.isArray(orgs) && orgs[0] && orgs[0].id) return String(orgs[0].id)
  return ''
}

export function emailFromToken(token) {
  const payload = decodeJwtPayload(token)
  if (!payload) return ''
  return String(payload.email || payload.preferred_username || '')
}
