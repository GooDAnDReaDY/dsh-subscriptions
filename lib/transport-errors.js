/**
 * Transport-failure taxonomy (#1096).
 *
 * A network path that cannot reach the vendor says nothing about the account. Before
 * this module, a `fetch` failure surfaced as `TypeError('fetch failed')`, and a proxy
 * that answered `502` became a `VENDOR` error with switchable status — both routed
 * through `markCooldown()` with the full 30-minute window, quarantining a healthy
 * account and answering the user with "no usable subscription account".
 *
 * The rule this module encodes: a failure is transport-level when the request never
 * got a verdict from the account's own upstream. Those must not spend quota cooldown;
 * they get a short bounded retry and an error that names the network cause.
 */

/**
 * Node/undici error codes that mean "the connection did not happen".
 * `UND_ERR_*` come from undici, `E*` from libuv/sockets, `CERT_*`/`ERR_TLS_*` from TLS.
 */
export const TRANSPORT_CODES = new Set([
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'UND_ERR_SOCKET',
  'UND_ERR_CLOSED',
  'UND_ERR_RES_CONTENT_LENGTH_MISMATCH',
  'ECONNREFUSED',
  'ECONNRESET',
  'ECONNABORTED',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENETDOWN',
  'EPIPE',
  'ETIMEDOUT',
  'CERT_HAS_EXPIRED',
  'CERT_NOT_YET_VALID',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'ERR_SSL_WRONG_VERSION_NUMBER',
])

/**
 * HTTP statuses produced by an intermediary, not by the account's upstream. A proxy
 * that cannot reach the vendor answers 502/503/504; the account is not at fault.
 */
export const TRANSPORT_STATUSES = new Set([502, 503, 504])

const TRANSPORT_MESSAGE = /fetch failed|connect.?timeout|socket hang up|network error|getaddrinfo|tls handshake|self.signed certificate|certificate has expired/i

/** Read a nested error code from an error, its `cause`, or an aggregate. */
function codesOf(err, depth = 0) {
  if (!err || depth > 3) return []
  const out = []
  if (typeof err === 'object') {
    if (typeof err.code === 'string') out.push(err.code)
    if (Array.isArray(err.errors)) {
      for (const inner of err.errors) out.push(...codesOf(inner, depth + 1))
    }
    if (err.cause) out.push(...codesOf(err.cause, depth + 1))
  }
  return out
}

/**
 * Classify a failure as transport-level.
 *
 * Deliberately conservative: an explicit HTTP verdict from the vendor (429, 401, 402,
 * 5xx with a body from the upstream) is never transport. Only errors that carry a
 * connection-level code, or a gateway status with no upstream verdict, qualify.
 *
 * @param {any} err
 * @returns {{transport: boolean, code: string|null, reason: string}}
 */
export function classifyTransportFailure(err) {
  if (!err || typeof err !== 'object') return { transport: false, code: null, reason: 'not an error' }

  // An explicit provider verdict always wins, even if it arrived over a flaky path.
  const status = Number(err.status || err.statusCode) || 0
  const explicit = String(err.code || '')
  if (explicit === 'RATE_LIMIT' || explicit === 'QUOTA' || explicit === 'AUTH' || explicit === 'TOKEN_REVOKED') {
    return { transport: false, code: null, reason: 'provider verdict: ' + explicit }
  }

  const codes = codesOf(err)
  for (const code of codes) {
    if (TRANSPORT_CODES.has(code)) {
      return { transport: true, code, reason: 'connection code ' + code }
    }
  }

  if (TRANSPORT_STATUSES.has(status)) {
    return { transport: true, code: 'HTTP_' + status, reason: 'gateway status ' + status + ' from an intermediary' }
  }

  // A bare `fetch failed` from undici already carries the real code in `cause`; if it
  // does not, the message is still the only signal we have.
  if (err.name === 'TypeError' && TRANSPORT_MESSAGE.test(String(err.message || ''))) {
    return { transport: true, code: 'FETCH_FAILED', reason: 'fetch could not reach the vendor' }
  }

  return { transport: false, code: null, reason: 'no transport signal' }
}

/** True when the failure is transport-level and must not spend account cooldown. */
export function isTransportFailure(err) {
  return classifyTransportFailure(err).transport
}

/**
 * An error that carries the classification, so later layers (rotation, diagnostics,
 * the UI) do not have to re-derive it from the message.
 *
 * @param {any} err
 * @param {object} [extra]
 * @returns {Error & {code: string, transport: boolean, transportCode: string|null, cause: any}}
 */
export function transportError(err, extra = {}) {
  const verdict = classifyTransportFailure(err)
  const detail = verdict.code ? ' (' + verdict.code + ')' : ''
  const out = /** @type {Error & {code: string, transport: boolean, transportCode: string|null, cause: any}} */ (new Error(
    'upstream unreachable' + detail + ': ' + String((err && err.message) || err || 'request failed')
    + '. Check the network path, proxy or DNS for this account.',
  ))
  out.code = 'NETWORK'
  out.transport = true
  out.transportCode = verdict.code
  out.cause = err
  Object.assign(out, extra)
  return out
}
