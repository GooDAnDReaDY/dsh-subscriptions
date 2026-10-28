/** #835/#836: safe provider icon candidate with deterministic fallback. */
export function providerInitials(provider) {
  const text = String(provider || '').trim()
  if (!text) return '?'
  return text.slice(0, 2).toUpperCase()
}

export function safeProviderIconUrl(raw) {
  const value = String(raw || '').trim()
  if (!value) return ''
  try {
    const url = new URL(value)
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.href
    if (url.protocol === 'data:' && /^data:image\/(?:png|jpe?g|gif|webp|svg\+xml)[;,]/i.test(value)) return value
  } catch { /* fall through */ }
  return ''
}

export function resolveProviderIcon({ provider, iconUrl, hostIconUrl } = {}) {
  const safe = safeProviderIconUrl(iconUrl) || safeProviderIconUrl(hostIconUrl)
  return { url: safe, fallback: providerInitials(provider), source: safe ? 'url' : 'initials' }
}
