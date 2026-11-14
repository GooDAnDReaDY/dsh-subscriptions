import { oauthRef } from './refs.js'

// #1040: the next free slot for a provider, so the UI can chain logins
// ("connect another") instead of making the user create slots by hand.
export const MAX_SLOT_INDEX = 99

/**
 * @param {any[]} slots
 * @param {string} provider
 * @param {{ label?: string }} [options]
 */
export function planNextSlot(slots, provider, options = {}) {
  const list = Array.isArray(slots) ? slots : []
  const used = new Set()
  for (const slot of list) {
    if (!slot || slot.provider !== provider) continue
    const index = Number(slot.index)
    if (Number.isInteger(index) && index > 0) used.add(index)
  }
  let index = 1
  while (used.has(index) && index < MAX_SLOT_INDEX) index += 1
  return {
    provider,
    index,
    ref: oauthRef(provider, index),
    label: String(options.label || '').trim(),
    exhausted: used.has(index),
  }
}
