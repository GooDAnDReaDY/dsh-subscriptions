// Native copilot-cli SDK mode with local tool calling (#508).
// Enforces 0 Cyrillic characters.

import { readFile } from 'node:fs/promises'
import { existsSync, accessSync, constants } from 'node:fs'
import { homedir } from 'node:os'
import { join, delimiter } from 'node:path'
import { spawn } from 'node:child_process'
import { LlmError } from '@deepseek-ai/dsh-llm'

const MAX_STDERR_CHARS = 2048
const GITHUB_TOKEN_PATTERN = /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g

const COPILOT_CLI_BASENAME = /^(?:copilot|github-copilot-cli|copilot-cli)(?:\.(?:cmd|bat|exe))?$/i

export function isAllowedCopilotBinary(binaryPath) {
  return COPILOT_CLI_BASENAME.test(String(binaryPath || '').split(/[\\/]/).pop())
}

export function redactCopilotStderr(text) {
  return String(text || '').replace(GITHUB_TOKEN_PATTERN, '[REDACTED]')
}

/**
 * Standard candidate binary names for GitHub Copilot CLI.
 */
export const COPILOT_CLI_BINARIES = [
  'copilot',
  'copilot.cmd',
  'copilot.exe',
  'github-copilot-cli',
  'github-copilot-cli.cmd',
  'copilot-cli',
  'gh-copilot',
]

/**
 * Read GitHub Copilot credentials from local environments or config files.
 * @param {string} [home] Test seam for home directory
 * @param {NodeJS.ProcessEnv} [env] Test seam for process environment
 * @returns {Promise<{ accessToken: string, githubToken: string, refreshToken?: string, expiresAt?: number, email?: string, label?: string, source: string, path?: string } | null>}
 */
export async function readCopilotCredentials(home, env = process.env) {
  const activeHome = home || homedir()

  // 1. Environment variables
  const envToken = env.GITHUB_COPILOT_TOKEN || env.GH_TOKEN || env.GITHUB_TOKEN || env.COPILOT_API_KEY
  if (envToken && typeof envToken === 'string' && envToken.trim()) {
    const clean = envToken.trim()
    return {
      accessToken: clean,
      githubToken: clean,
      refreshToken: clean,
      expiresAt: 0,
      email: 'GitHub Copilot User',
      label: 'copilot-env',
      source: 'env',
      path: env.GITHUB_COPILOT_TOKEN ? 'GITHUB_COPILOT_TOKEN' : (env.GH_TOKEN ? 'GH_TOKEN' : 'GITHUB_TOKEN'),
    }
  }

  // 2. Known configuration files
  const fileCandidates = [
    join(activeHome, '.config', 'github-copilot', 'hosts.json'),
    join(activeHome, '.config', 'github-copilot', 'apps.json'),
    join(activeHome, '.copilot-cli', 'config.json'),
    join(activeHome, '.config', 'gh', 'hosts.yml'),
  ]

  for (const filePath of fileCandidates) {
    try {
      if (!existsSync(filePath)) continue
      const content = await readFile(filePath, 'utf8')
      if (filePath.endsWith('.json')) {
        const json = JSON.parse(content)
        if (!json) continue
        const gh = json['github.com'] || json
        const tok = gh.oauth_token || gh.token || gh.access_token || gh.accessToken
        if (tok) {
          return {
            accessToken: String(tok),
            githubToken: String(tok),
            refreshToken: String(tok),
            expiresAt: 0,
            email: gh.user || 'GitHub Copilot User',
            label: gh.user || 'copilot-cli',
            source: 'file',
            path: filePath,
          }
        }
      } else if (filePath.endsWith('.yml') || filePath.endsWith('.yaml')) {
        const lines = content.split('\n')
        let inGithub = false
        let user = ''
        let oauthToken = ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (/^github\.com:/.test(trimmed)) {
            inGithub = true
            continue
          }
          if (inGithub) {
            if (/^[a-zA-Z0-9.-]+:/.test(trimmed) && !trimmed.startsWith('oauth_token') && !trimmed.startsWith('user')) {
              break
            }
            const userMatch = /user:\s*([^\s#]+)/.exec(trimmed)
            if (userMatch) user = userMatch[1]
            const tokenMatch = /oauth_token:\s*([^\s#]+)/.exec(trimmed)
            if (tokenMatch) oauthToken = tokenMatch[1]
          }
        }
        if (oauthToken) {
          return {
            accessToken: oauthToken,
            githubToken: oauthToken,
            refreshToken: oauthToken,
            expiresAt: 0,
            email: user || 'GitHub Copilot User',
            label: user || 'gh-hosts',
            source: 'file',
            path: filePath,
          }
        }
      }
    } catch {
      // Continue to next candidate
    }
  }

  return null
}

/**
 * Locate Copilot CLI binary on system.
 * @param {string} [customPath] Explicit user-configured path
 * @param {NodeJS.ProcessEnv} [env] Process environment
 * @param {string} [platform] Process platform
 * @returns {string|null} Resolved executable path or null
 */
export function findCopilotCli(customPath, env = process.env, platform = process.platform) {
  if (customPath && typeof customPath === 'string' && customPath.trim()) {
    const p = customPath.trim()
    let exists = false
    try { exists = existsSync(p) } catch { /* best-effort */ }
    if (exists) {
      if (!isAllowedCopilotBinary(p)) {
        throw new Error('copilotCliPath must point to a copilot binary (copilot, github-copilot-cli or copilot-cli)')
      }
      return p
    }
  }

  const pathVar = env.PATH || ''
  const pathDirs = pathVar.split(delimiter).filter(Boolean)

  const home = env.HOME || env.USERPROFILE || homedir()
  if (home) {
    pathDirs.push(
      join(home, '.npm-global', 'bin'),
      join(home, '.local', 'bin'),
      join(home, 'AppData', 'Roaming', 'npm'),
    )
  }

  const candidates = platform === 'win32'
    ? COPILOT_CLI_BINARIES.filter((bin) => /\.(cmd|exe|bat)$/i.test(bin))
    : COPILOT_CLI_BINARIES.filter((bin) => !/\.(cmd|exe|bat)$/i.test(bin))
  for (const dir of pathDirs) {
    for (const bin of candidates) {
      const fullPath = join(dir, bin)
      try {
        if (existsSync(fullPath)) {
          if (platform !== 'win32') {
            try {
              accessSync(fullPath, constants.X_OK)
            } catch {
              continue
            }
          }
          return fullPath
        }
      } catch {
        // Continue searching
      }
    }
  }

  return null
}

/**
 * Verify Copilot CLI availability and return status.
 * @param {{ customPath?: string, env?: NodeJS.ProcessEnv }} [options]
 * @returns {{ available: boolean, path?: string, error?: string }}
 */
export function isCopilotCliAvailable(options = {}) {
  const binary = findCopilotCli(options.customPath, options.env)
  if (binary) {
    return { available: true, path: binary }
  }
  return { available: false, error: 'copilot_binary_not_found' }
}

/**
 * Translate DSH turn options to Copilot CLI arguments and environment.
 * @param {any} options
 * @param {any} [blob]
 * @param {string} [_binaryPath]
 * @returns {{ args: string[], env: NodeJS.ProcessEnv, inputPayload: string }}
 */
export const COPILOT_MODEL_PATTERN = /^[A-Za-z0-9._:/][A-Za-z0-9._:/-]{0,119}$/

export function prepareCopilotCliInvocation(options, blob = {}, _binaryPath = 'copilot') {
  const model = String(options.model || 'claude-3.7-sonnet')
  if (!COPILOT_MODEL_PATTERN.test(model)) {
    throw new LlmError(`Invalid Copilot model id: ${model.slice(0, 80)}`, 'INVALID_MODEL')
  }
  const token = blob.accessToken || blob.githubToken || blob.refreshToken || ''

  const args = [
    '--model', model,
    '--stream',
    '--json',
  ]

  if (options.temperature != null) {
    args.push('--temperature', String(options.temperature))
  }
  if (options.maxTokens != null) {
    args.push('--max-tokens', String(options.maxTokens))
  }

  if (Array.isArray(options.tools) && options.tools.length) {
    args.push('--tools', JSON.stringify(options.tools))
  }

  const env = {
    ...process.env,
    ...(token ? {
      GITHUB_TOKEN: token,
      GH_TOKEN: token,
      GITHUB_COPILOT_TOKEN: token,
      COPILOT_API_KEY: token,
    } : {}),
  }

  const inputPayload = JSON.stringify({
    model,
    messages: options.messages || (options.prompt ? [{ role: 'user', content: options.prompt }] : []),
    tools: options.tools || [],
  })

  return { args, env, inputPayload }
}

export function resolveSpawnCommand(binaryPath, args, platform = process.platform) {
  if (platform === 'win32' && /\.(cmd|bat)$/i.test(String(binaryPath))) {
    return {
      command: process.env.ComSpec || 'cmd.exe',
      args: ['/d', '/s', '/c', binaryPath, ...args],
    }
  }
  return { command: binaryPath, args }
}

/**
 * Stream execution from local Copilot CLI process.
 * Yields canonical DSH events: block-start, text-delta, tool-call-delta, finish, usage.
 * @param {object} params
 * @param {string} params.binaryPath
 * @param {any} params.options
 * @param {any} [params.blob]
 * @param {any} [params.config]
 * @param {AbortSignal} [params.signal]
 * @param {Function} [params.spawnImpl] Test seam for child_process.spawn
 * @returns {AsyncGenerator<any, void, unknown>}
 */
export async function* streamCopilotCli({ binaryPath, options, blob, config: _config, signal, spawnImpl }) {
  if (!isAllowedCopilotBinary(binaryPath)) {
    throw new Error('copilotCliPath must point to a copilot binary (copilot, github-copilot-cli or copilot-cli)')
  }
  if (signal && signal.aborted) {
    throw new LlmError('Request aborted by client', 'ABORTED')
  }

  const { args, env, inputPayload } = prepareCopilotCliInvocation(options, blob, binaryPath)
  const spawner = spawnImpl || spawn
  const invocation = resolveSpawnCommand(binaryPath, args)

  let child
  try {
    child = spawner(invocation.command, invocation.args, {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
  } catch (err) {
    throw new LlmError(`Failed to spawn Copilot CLI: ${err && err.message ? err.message : err}`, 'INTERNAL_ERROR')
  }

  let abortHandler = null
  let killTimer = null
  if (signal) {
    abortHandler = () => {
      try { child.kill('SIGTERM') } catch { /* best-effort */ }
      killTimer = setTimeout(() => {
        if (!processEnded && !child.killed) {
          try { child.kill('SIGKILL') } catch { /* best-effort */ }
        }
      }, 2000)
      if (killTimer && typeof killTimer.unref === 'function') killTimer.unref()
    }
    signal.addEventListener('abort', abortHandler, { once: true })
  }

  if (child.stdin) {
    // EPIPE is expected when the CLI exits before reading stdin; never let it crash the host.
    child.stdin.on('error', () => {})
    child.stdin.write(inputPayload)
    child.stdin.end()
  }

  let textStarted = false
  let toolIndex = 0
  let sawTools = false
  const toolCallMap = new Map()

  let stdoutBuffer = ''
  let stderrBuffer = ''

  if (child.stderr) {
    child.stderr.on('data', (d) => {
      if (stderrBuffer.length >= MAX_STDERR_CHARS) return
      stderrBuffer += String(d).slice(0, MAX_STDERR_CHARS - stderrBuffer.length)
    })
  }

  const chunkQueue = []
  let resolveNext = null
  let processEnded = false
  let processError = null

  child.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk.toString()
    let newlineIndex
    while ((newlineIndex = stdoutBuffer.indexOf('\n')) >= 0) {
      const line = stdoutBuffer.slice(0, newlineIndex).trim()
      stdoutBuffer = stdoutBuffer.slice(newlineIndex + 1)
      if (line) {
        chunkQueue.push(line)
        if (resolveNext) {
          const r = resolveNext
          resolveNext = null
          r()
        }
      }
    }
  })

  child.on('error', (err) => {
    processError = err
    if (resolveNext) {
      const r = resolveNext
      resolveNext = null
      r()
    }
  })

  child.on('close', (code) => {
    processEnded = true
    if (stdoutBuffer.trim()) {
      chunkQueue.push(stdoutBuffer.trim())
      stdoutBuffer = ''
    }
    if (code !== 0 && !chunkQueue.length) {
      processError = new LlmError(`Copilot CLI exited with code ${code}: ${redactCopilotStderr(stderrBuffer.trim()) || 'unknown error'}`, 'VENDOR')
    }
    if (resolveNext) {
      const r = resolveNext
      resolveNext = null
      r()
    }
  })

  try {
  while (true) {
    if (chunkQueue.length) {
      const line = chunkQueue.shift()
      const raw = line.startsWith('data:') ? line.slice(5).trim() : line
      if (raw === '[DONE]') break

      let parsed = null
      try { parsed = JSON.parse(raw) } catch { /* text fragment */ }

      if (parsed) {
        // 1. Text delta
        const text = parsed.text || parsed.delta?.content || parsed.content || (parsed.choices && parsed.choices[0]?.delta?.content)
        if (typeof text === 'string' && text) {
          if (!textStarted) {
            yield { type: 'block-start', index: 0, blockType: 'text' }
            textStarted = true
          }
          yield { type: 'text-delta', index: 0, text }
        }

        // 2. Tool calls
        const toolCalls = parsed.tool_calls || parsed.delta?.tool_calls || (parsed.choices && parsed.choices[0]?.delta?.tool_calls) || (parsed.tool_call ? [parsed.tool_call] : null)
        if (Array.isArray(toolCalls)) {
          sawTools = true
          for (const tc of toolCalls) {
            const id = tc.id || `call_${toolIndex}`
            const name = tc.name || (tc.function && tc.function.name)
            const argsDelta = tc.argumentsDelta || tc.arguments || (tc.function && tc.function.arguments) || ''
            let idx = toolCallMap.get(id)
            if (idx === undefined) {
              idx = ++toolIndex
              toolCallMap.set(id, idx)
              yield { type: 'block-start', index: idx, blockType: 'tool-call' }
            }
            yield {
              type: 'tool-call-delta',
              index: idx,
              id,
              ...(name ? { name } : {}),
              argumentsDelta: typeof argsDelta === 'string' ? argsDelta : JSON.stringify(argsDelta),
            }
          }
        }

        // 3. Usage
        if (parsed.usage) {
          yield { type: 'usage', usage: parsed.usage }
        }
      } else if (raw) {
        // Plain text stdout line
        if (!textStarted) {
          yield { type: 'block-start', index: 0, blockType: 'text' }
          textStarted = true
        }
        yield { type: 'text-delta', index: 0, text: raw }
      }
    } else if (processEnded) {
      if (processError) throw processError
      break
    } else {
      await new Promise((res) => { resolveNext = res })
      if (processError && !chunkQueue.length) throw processError
    }
  }
  } finally {
    if (signal && abortHandler) signal.removeEventListener('abort', abortHandler)
    if (killTimer) clearTimeout(killTimer)
  }

  yield {
    type: 'finish',
    reason: { kind: sawTools ? 'tool-calls' : 'stop' },
  }
}
