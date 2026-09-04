import * as kiro from './kiro.js'
import * as cursor from './cursor.js'
import * as codex from './codex.js'
import * as claude from './claude.js'
import * as grok from './grok.js'
import * as antigravity from './antigravity.js'
import * as kimi from './kimi.js'
import * as glm from './glm.js'
import { createVendorFromProfile } from '../vendor-factory.js'

const builtins = { codex, claude, grok, antigravity, kimi, glm, cursor, kiro }

const customVendors = new Map()

export function registerCustomVendor(vendor) {
  if (!vendor || !vendor.id) throw new Error('custom vendor needs id')
  customVendors.set(vendor.id, vendor)
}

export function clearCustomVendors() {
  customVendors.clear()
}

const vendors = new Proxy({}, {
  get(_t, prop) {
    if (prop in builtins) return builtins[prop]
    return customVendors.get(prop)
  },
  has(_t, prop) {
    return prop in builtins || customVendors.has(prop)
  },
  ownKeys() {
    return [...Reflect.ownKeys(builtins), ...customVendors.keys()]
  },
  getOwnPropertyDescriptor() {
    return { enumerable: true, configurable: true }
  },
})

export function isProvider(value) {
  return Boolean(vendors[value])
}

export function getVendor(provider) {
  const vendor = vendors[provider]
  if (!vendor) throw new Error(`unknown provider: ${provider}`)
  return vendor
}
