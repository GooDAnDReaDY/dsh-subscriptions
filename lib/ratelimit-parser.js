export function parseRateLimitHeaders(headers) {
  if (!headers || typeof headers !== 'object') return null

  const get = (key) => {
    const k = Object.keys(headers).find((h) => h.toLowerCase() === key.toLowerCase())
    return k ? headers[k] : null
  }

  const remainingTokens = get('x-ratelimit-remaining-tokens')
  const resetTokens = get('x-ratelimit-reset-tokens')
  const remainingRequests = get('x-ratelimit-remaining-requests')
  const resetRequests = get('x-ratelimit-reset-requests')

  if (!remainingTokens && !resetTokens && !remainingRequests && !resetRequests) {
    return null
  }

  return {
    remainingTokens: remainingTokens != null ? Number(remainingTokens) : null,
    resetTokensTime: resetTokens || null,
    remainingRequests: remainingRequests != null ? Number(remainingRequests) : null,
    resetRequestsTime: resetRequests || null
  }
}
