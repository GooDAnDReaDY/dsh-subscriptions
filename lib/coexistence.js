import { readFileSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

export const CONFLICTING_PLUGINS = Object.freeze([
  'dsh-plugin-subscriptions',
  'dsh-super-subscriptions',
  'dsh-agy-link',
  'dsh-codex-connect',
  'dsh-key-rotation',
  '@goodandready/dsh-key-rotation',
])

let activeConflicts = []

export function detectConflicts({ dependencies = [], loaded = [] } = {}) {
  const names = new Set([...(dependencies || []), ...(loaded || [])].filter(Boolean).map(String))
  return CONFLICTING_PLUGINS.filter((name) => names.has(name))
}

export function setActiveConflicts(conflicts) {
  activeConflicts = Array.isArray(conflicts) ? conflicts.slice() : []
}

export function getActiveConflicts() {
  return activeConflicts.slice()
}

export function readProfilePluginNames(profileDir = process.env.DSH_PROFILE_DIR) {
  const candidates = []
  if (profileDir) candidates.push(profileDir)
  try { candidates.push(process.cwd()) } catch { /* ignore cwd errors */ }
  const home = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  const profile = process.env.DSH_PROFILE
  if (profile) candidates.push(path.join(home, 'profiles', profile))
  for (const dir of candidates) {
    try {
      const pkg = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf8'))
      const deps = Object.keys(pkg.dependencies || {})
      const bundles = (pkg.dsh && pkg.dsh.profile && pkg.dsh.profile.bundles) || []
      return [...deps, ...bundles].filter(Boolean)
    } catch { /* try next candidate */ }
  }
  return []
}
