/**
 * Format a future timestamp as a relative remaining duration down to the minute.
 * Supports en and ru.
 */

export const RELATIVE_UNITS = {
  en: {
    soon: 'just now',
    prefix: 'in ',
    suffix: '',
    minute: '{n}m',
    hour: '{n}h',
    day: '{n}d',
  },
  ru: {
    soon: 'только что',
    prefix: 'через ',
    suffix: '',
    minute: '{n} мин',
    hour: '{n} ч',
    day: '{n} дн',
  },
}

function fill(template, n) {
  return String(template).replace('{n}', String(n))
}

export function formatRelativeReset(resetAt, lang = 'ru', now = Date.now()) {
  if (typeof resetAt !== 'number' || !Number.isFinite(resetAt) || resetAt <= 0) return ''
  const delta = resetAt - now
  const units = RELATIVE_UNITS[lang] || RELATIVE_UNITS.ru
  if (delta <= 0) return units.soon

  const totalMinutes = Math.max(1, Math.round(delta / 60_000))
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60

  const bits = []
  if (days) bits.push(fill(units.day, days))
  if (hours) bits.push(fill(units.hour, hours))
  if (minutes || bits.length === 0) bits.push(fill(units.minute, minutes))

  const durationStr = bits.join(' ')
  return `${units.prefix}${durationStr}${units.suffix}`.trim()
}
