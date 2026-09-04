export function extractBearerFromCookie(cookieHeader) {
  if (!cookieHeader || typeof cookieHeader !== 'string') return null
  const match = cookieHeader.match(/(?:__Secure-next-auth\.session-token|session_token|auth_token)=([^;]+)/)
  if (match && match[1]) {
    return decodeURIComponent(match[1])
  }
  return null
}
