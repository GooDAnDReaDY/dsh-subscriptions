import { ignoreError } from './catch-log.js'
import { fetchWithTimeout } from './http.js'

// #1059: per-provider clock drift learned from vendor `Date` headers, plus the
// fetch wrapper that records it. Extracted from accounts.js to keep the account
// store focused on credentials, usage and health.
export function createClockDrift() {
  const drifts = new Map()
  return {
    get(provider) {
      if (!provider) return 0
      return drifts.get(String(provider).toLowerCase()) || 0
    },
    record(provider, vendorDateMsOrHeader) {
      if (!provider) return
      const key = String(provider).toLowerCase()
      if (typeof vendorDateMsOrHeader === 'number') {
        drifts.set(key, vendorDateMsOrHeader - Date.now())
      } else if (typeof vendorDateMsOrHeader === 'string') {
        const parsed = Date.parse(vendorDateMsOrHeader)
        if (!isNaN(parsed)) {
          drifts.set(key, parsed - Date.now())
        }
      }
    },
  }
}

export function createVendorFetch({ doFetch, fetchForRef, recordDrift }) {
  const rawFetchFor = (ref) => (typeof fetchForRef === 'function' && fetchForRef(ref)) || doFetch
  const fetchFor = (ref, defaultTimeoutMs = 25000, providerHint = null) => async (url, init, opts) => {
    const res = await fetchWithTimeout(rawFetchFor(ref), url, init, { timeoutMs: defaultTimeoutMs, ...(opts || {}) })
    try {
      const dateHeader = res && res.headers && typeof res.headers.get === 'function' ? res.headers.get('date') : null
      if (dateHeader) {
        const prov = providerHint || (ref ? String(ref).split('_')[0].toLowerCase() : null)
        if (prov) recordDrift(prov, dateHeader)
      }
    } catch (err) { ignoreError('account-clock.js: best-effort drift extraction', err) }
    return res
  }
  return { rawFetchFor, fetchFor }
}
