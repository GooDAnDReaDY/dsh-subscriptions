/** #816: normalize host API shape differences in one place. */
export function toolCallId(value) {
  if (!value || typeof value !== 'object') return ''
  return String(value.toolCallId || value.tool_call_id || value.toolUseId || value.tool_use_id || value.callId || value.call_id || value.id || '')
}

export function normalizeRpcResult(value) {
  if (value == null) return { ok: false, value: null }
  if (typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'ok')) {
    return { ok: Boolean(value.ok), value: value.value ?? value.result ?? null }
  }
  return { ok: true, value }
}

export function hostCompatibilityError(detail) {
  const suffix = detail ? `: ${String(detail)}` : ''
  /** @type {Error & { code?: string }} */
  const err = new Error(`unsupported DSH host API${suffix}`)
  err.code = 'DSH_HOST_INCOMPATIBLE'
  return err
}
