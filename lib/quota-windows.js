import { calculateBurnRatePerHour } from './forecast.js'

// #1041: window-aligned quota forecast. The ledger/pacing helpers answered
// "what is the burn rate", but not "will this window survive until its reset",
// which is the question a user actually asks before starting a long task.
export const DEFAULT_SAFETY_FLOOR = 5
export const MIN_OBSERVATION_MS = 30 * 60 * 1000

/**
 * @param {{
 *   window?: any,
 *   samples?: Array<{ at: number, pct: number }>,
 *   resetAt?: number,
 *   now?: number,
 *   safetyFloor?: number,
 * }} input
 */
export function forecastWindow(input = {}) {
  const window = input.window || {}
  const now = Number(input.now) || Date.now()
  const safetyFloor = Number.isFinite(Number(input.safetyFloor)) ? Number(input.safetyFloor) : DEFAULT_SAFETY_FLOOR
  const samples = (Array.isArray(input.samples) ? input.samples : [])
    .filter((sample) => sample && Number.isFinite(Number(sample.at)) && Number.isFinite(Number(sample.pct)))
    .slice()
    .sort((a, b) => Number(a.at) - Number(b.at))

  const usedRaw = window.usedPercent != null ? Number(window.usedPercent) : null
  const usedPercent = Number.isFinite(usedRaw) ? Math.max(0, Math.min(100, usedRaw)) : null
  const remainingPercent = usedPercent == null ? null : Math.max(0, 100 - usedPercent)

  const resetRaw = Number(input.resetAt != null ? input.resetAt : window.resetAt)
  const resetAt = Number.isFinite(resetRaw) && resetRaw > 0 ? resetRaw : null
  const hoursToReset = resetAt && resetAt > now ? (resetAt - now) / 3600000 : null

  const observedMs = samples.length >= 2 ? now - Number(samples[0].at) : 0
  const confidence = observedMs >= MIN_OBSERVATION_MS ? 'ready' : 'calibrating'
  const burnPerHour = samples.length >= 2 ? Math.max(0, Number(calculateBurnRatePerHour(samples, now)) || 0) : 0

  let etaHours = null
  let survives = null
  let predictedPercentAtReset = null

  if (remainingPercent != null) {
    if (burnPerHour > 0) {
      etaHours = Math.max(0, (remainingPercent - safetyFloor) / burnPerHour)
      if (hoursToReset != null) {
        survives = etaHours >= hoursToReset
        predictedPercentAtReset = Math.max(0, remainingPercent - burnPerHour * hoursToReset)
      } else {
        survives = etaHours > 0
      }
    } else {
      // No observed consumption: the window survives unless it is already empty.
      survives = remainingPercent > 0
      if (hoursToReset != null) predictedPercentAtReset = remainingPercent
    }
  }

  return {
    id: String(window.id || window.en || window.ru || 'window'),
    label: String(window.label || window.en || window.id || ''),
    usedPercent,
    remainingPercent,
    resetAt,
    hoursToReset,
    burnPerHour,
    etaHours,
    survives,
    predictedPercentAtReset,
    confidence,
    samples: samples.length,
    safetyFloor,
  }
}

/**
 * @param {{
 *   windows?: any[],
 *   quota?: any,
 *   now?: number,
 *   safetyFloor?: number,
 * }} input
 */
export function forecastWindows(input = {}) {
  const quota = input.quota || {}
  const samples = Array.isArray(quota.samples) ? quota.samples : []
  const declared = Array.isArray(input.windows && input.windows.length ? input.windows : quota.windows)
    ? (input.windows && input.windows.length ? input.windows : quota.windows)
    : []
  const windows = declared.length
    ? declared
    : (quota.usedPercent != null
      ? [{ id: 'quota', label: 'quota', usedPercent: quota.usedPercent, resetAt: quota.resetAt }]
      : [])
  return windows.map((window) => forecastWindow({
    window,
    samples,
    resetAt: window && window.resetAt != null ? window.resetAt : quota.resetAt,
    now: input.now,
    safetyFloor: input.safetyFloor,
  }))
}
