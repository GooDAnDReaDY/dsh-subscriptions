import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const SERVICE = 'Claude Code-credentials'

export function validClaudeBlob(blob) {
  if (!blob || typeof blob !== 'object') return false
  if (typeof blob.accessToken !== 'string' || !blob.accessToken) return false
  if (typeof blob.refreshToken !== 'string' || !blob.refreshToken) return false
  return Number.isFinite(Number(blob.expiresAt))
}

export function mergeClaudeCredentials(current, cli) {
  if (!validClaudeBlob(current)) return validClaudeBlob(cli) ? { ...cli } : null
  if (!validClaudeBlob(cli)) return { ...current }
  const currentExpiry = Number(current.expiresAt) || 0
  const cliExpiry = Number(cli.expiresAt) || 0
  if (cli.accessToken && cli.accessToken !== current.accessToken && cliExpiry > currentExpiry) {
    return { ...current, ...cli }
  }
  return { ...current }
}

export function canWriteClaudeKeychain(currentBlob, expectedAccessToken) {
  return Boolean(currentBlob && expectedAccessToken && currentBlob.accessToken === expectedAccessToken)
}

/** macOS-only read; returns null on any failure so accounts stay usable. */
export async function readClaudeKeychain({ exec = execFileAsync, service = SERVICE } = {}) {
  if (process.platform !== 'darwin') return null
  try {
    const { stdout } = await exec('/usr/bin/security', ['find-generic-password', '-s', service, '-w'])
    const blob = JSON.parse(String(stdout || '').trim())
    return validClaudeBlob(blob) ? blob : null
  } catch { return null }
}

/** Write back only when the stored blob still owns the expected old access token. */
export async function writeClaudeKeychain(blob, expectedAccessToken, { exec = execFileAsync, service = SERVICE, account = 'claude' } = {}) {
  if (process.platform !== 'darwin') return false
  if (!validClaudeBlob(blob) || !expectedAccessToken) return false
  const current = await readClaudeKeychain({ exec, service })
  if (!canWriteClaudeKeychain(current, expectedAccessToken)) return false
  try {
    await exec('/usr/bin/security', ['add-generic-password', '-U', '-s', service, '-a', account, '-w', JSON.stringify(blob)])
    return true
  } catch { return false }
}
