import * as kiro from './kiro.js'
import * as cursor from './cursor.js'
import * as copilot from './copilot.js'
import * as qwen from './qwen.js'
import * as ernie from './ernie.js'
import * as spark from './spark.js'
import * as jetbrains from './jetbrains.js'
import * as perplexity from './perplexity.js'
import * as replit from './replit.js'
import * as cody from './cody.js'
import * as codex from './codex.js'
import * as claude from './claude.js'
import * as grok from './grok.js'
import * as antigravity from './antigravity.js'
import * as kimi from './kimi.js'
import * as glm from './glm.js'
import { BUILTIN_PROVIDERS, isProvider as isRegisteredProvider, registerCustomProviderIds } from '../providers.js'

const BUILTIN_MODULES = {
  codex,
  claude,
  grok,
  antigravity,
  kimi,
  glm,
  cursor,
  kiro,
  copilot,
  qwen,
  ernie,
  spark,
  jetbrains,
  perplexity,
  replit,
  cody,
}

const builtins = Object.fromEntries(BUILTIN_PROVIDERS.map((id) => [id, BUILTIN_MODULES[id]]))

const customVendors = new Map()

export function registerCustomVendor(vendor) {
  if (!vendor || !vendor.id) throw new Error('custom vendor needs id')
  customVendors.set(vendor.id, vendor)
  registerCustomProviderIds([vendor.id])
}

export function clearCustomVendors() {
  customVendors.clear()
}

const vendors = new Proxy({}, {
  get(_t, prop) {
    if (typeof prop === 'symbol') return undefined
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
  return isRegisteredProvider(value) && Boolean(vendors[value])
}

export function getVendor(provider) {
  const vendor = vendors[provider]
  if (!vendor) throw new Error(`unknown provider: ${provider}`)
  return vendor
}
