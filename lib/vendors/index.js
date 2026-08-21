import * as codex from './codex.js'
import * as claude from './claude.js'
import * as grok from './grok.js'
import * as antigravity from './antigravity.js'

export const vendors = {
  codex,
  claude,
  grok,
  antigravity,
}

export function getVendor(provider) {
  const vendor = vendors[provider]
  if (!vendor) throw new Error(`unknown provider: ${provider}`)
  return vendor
}
