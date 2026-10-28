import { execFileSync } from 'node:child_process'
import { resolveClientVersion } from './client-version.js'

const PACKAGES = { codex: '@openai/codex', claude: '@anthropic-ai/claude-code' }
const BINARIES = { codex: 'codex', claude: 'claude' }
const TTL_MS = 6 * 60 * 60 * 1000
const state = {
  codex: { npm: '', local: '', at: 0 },
  claude: { npm: '', local: '', at: 0 },
}
let inflight = null

function npmMetaUrl(name) {
  return 'https://registry.npmjs.org/' + encodeURIComponent(name) + '/latest'
}

function localVersion(binary) {
  try {
    const out = execFileSync(binary, ['--version'], { encoding: 'utf8', timeout: 1500, stdio: ['ignore', 'pipe', 'ignore'] })
    const m = /\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?/.exec(String(out))
    return m ? m[0] : ''
  } catch { return '' }
}

async function npmVersion(name, fetchImpl, signal) {
  try {
    const res = await fetchImpl(npmMetaUrl(name), { headers: { Accept: 'application/json' }, signal })
    if (!res.ok) return ''
    const json = await res.json()
    return typeof json?.version === 'string' ? json.version : ''
  } catch { return '' }
}

export function clientVersionInfo(fallbacks = {}, configs = {}) {
  const out = {}
  for (const provider of Object.keys(PACKAGES)) {
    const npm = state[provider].npm
    const local = state[provider].local
    out[provider] = resolveClientVersion({
      configValue: configs[provider] || '',
      npmVersion: npm,
      localVersion: local,
      fallback: fallbacks[provider] || '',
    })
  }
  return out
}

/** @param {{ fetchImpl?: typeof fetch, force?: boolean, signal?: AbortSignal, localVersionFn?: (binary: string) => string }} [options] */
export async function refreshClientVersions({ fetchImpl = fetch, force = false, signal, localVersionFn = localVersion } = {}) {
  const now = Date.now()
  if (!force && Object.values(state).every((row) => row.at && now - row.at < TTL_MS)) return clientVersionInfo()
  if (inflight) return inflight
  inflight = (async () => {
    for (const [provider, name] of Object.entries(PACKAGES)) {
      const npm = await npmVersion(name, fetchImpl, signal)
      const local = localVersionFn(BINARIES[provider])
      state[provider] = { npm, local, at: now }
    }
    return clientVersionInfo()
  })().finally(() => { inflight = null })
  return inflight
}

export function resetClientVersionCache() {
  for (const key of Object.keys(state)) state[key] = { npm: '', local: '', at: 0 }
  inflight = null
}

export function versionForProvider(provider, configValue, fallback) {
  const cached = state[provider] || {}
  return resolveClientVersion({ configValue, npmVersion: cached.npm, localVersion: cached.local, fallback })
}
