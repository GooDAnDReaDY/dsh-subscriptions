/**
 * Experience modes (#1103).
 *
 * The plugin exposes 127 top-level settings. Most users never touch more than a
 * handful, but nothing in the card says which ones matter for their situation, so
 * the policy surface looks equally important everywhere.
 *
 * A mode is a *view* over the same settings, not a second store: switching modes
 * never writes, resets or hides a value. It only decides which groups the card
 * shows first, so a user can leave Power for Simple, change nothing, and come
 * back to find every number where they left it.
 */

/**
 * The three modes, in increasing order of surface.
 *
 * `advanced` lists the settings that only matter once someone deliberately tunes
 * the pool; they stay editable in every mode through the card's own disclosure,
 * they are just not presented by default in the lower modes.
 */
export const MODES = Object.freeze({
  simple: {
    id: 'simple',
    // Everything that makes the plugin work for one or two accounts.
    core: [
      'switchAtRemaining',
      'autoPacing',
      'promptCacheTtlMinutes',
      'hideDeprecatedModels',
      'privacyMask',
      'enableToasts',
      'alertThresholds',
      'composerQuota',
      'showSubsPill',
    ],
    advanced: [],
  },
  balanced: {
    id: 'balanced',
    core: [
      'switchAtRemaining',
      'autoPacing',
      'drainBeforeReset',
      'drainSafetyPercent',
      'promptCacheTtlMinutes',
      'refreshAheadMs',
      'refreshRetryMs',
      'warmupAt',
      'leaseEnabled',
      'leaseTtlMs',
      'proxyPool',
      'proxyPoolCooldownMs',
      'alertThresholds',
      'enableToasts',
      'privacyMask',
    ],
    advanced: [
      'proactiveGuard',
      'proactiveMinRemaining',
      'selfHealIntervalMin',
      'scheduleRules',
      'routingPresets',
      'nativeTools',
      'codexWebSearch',
    ],
  },
  power: {
    id: 'power',
    // Power shows everything: the advanced list is the full policy chunk.
    core: [],
    advanced: [],
    showAll: true,
  },
})

export const MODE_IDS = Object.freeze(['simple', 'balanced', 'power'])

/** A mode name that is not recognised falls back to balanced, never to power. */
export function normalizeMode(value) {
  const mode = String(value || '').trim().toLowerCase()
  return MODE_IDS.includes(mode) ? mode : 'balanced'
}

/**
 * Which settings a mode presents.
 *
 * Power returns `showAll: true` and an empty list, so callers can decide between
 * "filter by these keys" and "do not filter at all" without a second lookup.
 *
 * @param {string} mode
 * @returns {{mode: string, showAll: boolean, keys: string[], advanced: string[]}}
 */
export function modeSurface(mode) {
  const id = normalizeMode(mode)
  if (id === 'power') {
    return { mode: 'power', showAll: true, keys: [], advanced: [] }
  }
  const spec = MODES[id]
  return {
    mode: id,
    showAll: false,
    keys: Array.from(spec.core),
    advanced: Array.from(spec.advanced),
  }
}

/**
 * Classify one setting for the current mode.
 *
 * `primary` — shown as a normal control.
 * `advanced` — collapsed behind the card's disclosure.
 * `hidden` — not part of this mode's surface at all.
 *
 * A setting that no mode lists is treated as `advanced` rather than `hidden`:
 * forgetting to classify a key must not make it unreachable.
 *
 * @param {string} mode
 * @param {string} key
 * @returns {'primary'|'advanced'|'hidden'}
 */
export function modeVisibility(mode, key) {
  const surface = modeSurface(mode)
  const name = String(key || '')
  if (!name) return 'hidden'
  if (surface.showAll) return 'primary'
  if (surface.keys.includes(name)) return 'primary'
  if (surface.advanced.includes(name)) return 'advanced'
  return 'hidden'
}

/** True when the mode presents the key at all (primary or advanced). */
export function modeIncludes(mode, key) {
  return modeVisibility(mode, key) !== 'hidden'
}

/**
 * Every key any mode mentions. Used by the guard test to prove the mode tables do
 * not invent a setting that the schema does not have.
 */
export function knownModeKeys() {
  const out = new Set()
  for (const id of MODE_IDS) {
    const spec = MODES[id]
    for (const key of spec.core || []) out.add(key)
    for (const key of spec.advanced || []) out.add(key)
  }
  return Array.from(out).sort()
}

/**
 * Human-facing summary of what a mode does, for the card and the docs. Kept next
 * to the tables so the description cannot drift from the behaviour.
 */
export const MODE_LABELS = Object.freeze({
  simple: { key: 'modeSimple', hintKey: 'modeSimpleHint' },
  balanced: { key: 'modeBalanced', hintKey: 'modeBalancedHint' },
  power: { key: 'modePower', hintKey: 'modePowerHint' },
})
