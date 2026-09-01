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
