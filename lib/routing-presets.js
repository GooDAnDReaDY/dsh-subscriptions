import { randomUUID } from 'node:crypto'

// #1045: named routing presets bundled server-side. A preset ties a model, a
// reasoning effort and an account rule together so a session can switch the
// whole bundle instead of three separate settings.
export const MAX_PRESETS = 20

function clampEffort(value) {
  const effort = String(value || '').trim().toLowerCase()
  return ['off', 'low', 'medium', 'high', 'xhigh', 'max'].includes(effort) ? effort : ''
}

function clampPattern(value) {
  const pattern = String(value || '').trim()
  if (!pattern || pattern.length > 120) return ''
  return pattern
}

/** @param {any} input */
export function normalizePreset(input = {}) {
  const name = String(input.name || '').trim().slice(0, 60)
  if (!name) return null
  const account = String(input.account || '').trim()
  return {
    id: String(input.id || '').trim() || randomUUID(),
    name,
    provider: String(input.provider || '').trim(),
    model: String(input.model || '').trim(),
    effort: clampEffort(input.effort),
    account,
    accountPattern: clampPattern(input.accountPattern || input.modelPattern),
    fallbackChain: Array.isArray(input.fallbackChain)
      ? input.fallbackChain.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 8)
      : [],
  }
}

/**
 * @param {any[]} presets
 * @param {any} input
 */
export function upsertPreset(presets, input) {
  const list = Array.isArray(presets) ? presets.slice() : []
  const preset = normalizePreset(input)
  if (!preset) return { ok: false, error: 'preset name is required', presets: list }
  const index = list.findIndex((row) => row && (row.id === preset.id || row.name.toLowerCase() === preset.name.toLowerCase()))
  if (index >= 0) list[index] = { ...list[index], ...preset }
  else {
    if (list.length >= MAX_PRESETS) return { ok: false, error: `at most ${MAX_PRESETS} presets are supported`, presets: list }
    list.push(preset)
  }
  return { ok: true, preset: index >= 0 ? list[index] : preset, presets: list }
}

/** @param {any[]} presets @param {string} idOrName */
export function findPreset(presets, idOrName) {
  const key = String(idOrName || '').trim().toLowerCase()
  if (!key) return null
  const list = Array.isArray(presets) ? presets : []
  return list.find((row) => row && (String(row.id).toLowerCase() === key || String(row.name).toLowerCase() === key)) || null
}

/** @param {any[]} presets @param {string} idOrName */
export function removePreset(presets, idOrName) {
  const list = Array.isArray(presets) ? presets.slice() : []
  const preset = findPreset(list, idOrName)
  if (!preset) return { ok: false, error: 'preset not found', presets: list }
  return { ok: true, presets: list.filter((row) => row !== preset) }
}

/** Account rule contributed by a preset, in the shape routing consumes. */
export function presetAccountRule(preset) {
  if (!preset || !preset.accountPattern) return null
  return {
    provider: preset.provider || '',
    pattern: preset.accountPattern,
    account: preset.account || '',
  }
}

/** Merge a preset's rule into the request's rule list without mutating it. */
export function mergePresetRules(preset, rules) {
  const base = Array.isArray(rules) ? rules : []
  const extra = presetAccountRule(preset)
  if (!extra) return base
  const duplicate = base.some((rule) => rule
    && String(rule.provider || '') === String(extra.provider || '')
    && String(rule.pattern || '') === String(extra.pattern))
  return duplicate ? base : base.concat([extra])
}
