import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const SERVICE = 'Claude Code-credentials'

export async function runWithInput(file, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += chunk })
    child.stderr.on('data', (chunk) => { stderr += chunk })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve({ stdout, stderr })
      else reject(Object.assign(new Error(stderr || ('security exited with ' + code)), { code }))
    })
    child.stdin.on('error', () => {})
    child.stdin.end(input)
  })
}

function shellQuote(value) {
  return "'" + String(value).replace(/'/g, "'\\''") + "'"
}

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
export async function writeClaudeKeychain(blob, expectedAccessToken, { exec = execFileAsync, service = SERVICE, account = 'claude', run = runWithInput } = {}) {
  if (process.platform !== 'darwin') return false
  if (!validClaudeBlob(blob) || !expectedAccessToken) return false
  const current = await readClaudeKeychain({ exec, service })
  if (!canWriteClaudeKeychain(current, expectedAccessToken)) return false
  try {
    // #965: never put the token blob on the security(1) argv; feed the whole
    // command through interactive mode on stdin so `ps` cannot see secrets.
    const command = 'add-generic-password -U -s ' + shellQuote(service)
      + ' -a ' + shellQuote(account) + ' -w ' + shellQuote(JSON.stringify(blob)) + '\n'
    await run('/usr/bin/security', ['-i'], command)
    return true
  } catch { return false }
}
