import { parseHeaders } from './ratelimit.js'

export const VENDOR_WINDOW_MS = {
  claude: 5 * 3600 * 1000,
  codex: 3 * 3600 * 1000,
  grok: 2 * 3600 * 1000,
}

export function parseResetFromText(message, nowMs = Date.now()) {
  if (!message || typeof message !== 'string') return null
  const s = message.trim()

  const secMatch = s.match(/(?:try again in|retry after|wait|resets? in)\s+(\d+)\s*(?:s|sec|seconds?)/i)
  if (secMatch) {
    const sec = Number(secMatch[1])
    if (Number.isFinite(sec) && sec > 0) return nowMs + sec * 1000
  }

  const minMatch = s.match(/(?:try again in|retry after|wait|resets? in)\s+(\d+)\s*(?:m|min|minutes?)/i)
  if (minMatch) {
    const min = Number(minMatch[1])
    if (Number.isFinite(min) && min > 0) return nowMs + min * 60 * 1000
  }

  const hrMatch = s.match(/(?:try again in|retry after|wait|resets? in)\s+(\d+)\s*(?:h|hr|hours?)/i)
  if (hrMatch) {
    const hr = Number(hrMatch[1])
    if (Number.isFinite(hr) && hr > 0) return nowMs + hr * 3600 * 1000
  }

  return null
}

export function resolveAccurateReset(err, account, provider, nowMs = Date.now(), safetyBufferMs = 10000) {
  const now = Number(nowMs) || Date.now()
  let targetReset = null

  if (err && err.resetAt) {
    const val = Number(err.resetAt)
    if (Number.isFinite(val) && val > now) {
      targetReset = val
    }
  }

  if (!targetReset && err) {
    const headers = err.headers || (err.response && err.response.headers)
    if (headers) {
      const parsed = parseHeaders(headers, now)
      if (parsed && parsed.resetAt && parsed.resetAt > now) {
        targetReset = parsed.resetAt
      }
    }
  }

  if (!targetReset && err && err.retryAfter) {
    const n = Number(err.retryAfter)
    if (Number.isFinite(n) && n > 0) {
      targetReset = n > 1e9 ? (n > 1e12 ? n : n * 1000) : now + n * 1000
    }
  }

  if (!targetReset && err && err.message) {
    const textReset = parseResetFromText(err.message, now)
    if (textReset && textReset > now) {
      targetReset = textReset
    }
  }

  if (!targetReset && account && account.quota && account.quota.resetAt) {
    const qReset = Number(account.quota.resetAt)
    if (Number.isFinite(qReset) && qReset > now) {
      targetReset = qReset
    }
  }

  if (targetReset && targetReset > now && targetReset <= now + 7 * 86400 * 1000) {
    return targetReset + (Number(safetyBufferMs) || 0)
  }

  const p = String(provider || (account && account.provider) || '').toLowerCase()
  const windowDefault = VENDOR_WINDOW_MS[p]
  if (windowDefault && err && (err.status === 429 || err.code === 'RATE_LIMIT' || err.code === 'QUOTA')) {
    return now + windowDefault + (Number(safetyBufferMs) || 0)
  }

  return null
}
