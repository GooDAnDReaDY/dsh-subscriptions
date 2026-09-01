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
