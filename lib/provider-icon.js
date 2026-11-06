import { ignoreError } from './catch-log.js'

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
  } catch (err) { ignoreError("provider-icon.js: fall through", err) }
  return ''
}

/**
 * @param {{ provider?: string, iconUrl?: string, hostIconUrl?: string }} [options]
 */
export function resolveProviderIcon(options = {}) {
  const opts = options || {}
  const safe = safeProviderIconUrl(opts.iconUrl) || safeProviderIconUrl(opts.hostIconUrl)
  return { url: safe, fallback: providerInitials(opts.provider), source: safe ? 'url' : 'initials' }
}
