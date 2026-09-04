import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

function homeFile(...parts) {
  return join(homedir(), ...parts)
}

async function readJson(path) {
  try {
    const text = await readFile(path, 'utf8')
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

export async function discoverLocalCliSessions() {
  const detected = {}

  // 1. Codex CLI
  const codex = await readJson(homeFile('.codex', 'auth.json'))
  if (codex && (codex.access_token || codex.accessToken || (codex.tokens && codex.tokens.access_token))) {
    const tok = codex.tokens || codex
    detected.codex = {
      provider: 'codex',
      path: homeFile('.codex', 'auth.json'),
      email: codex.email || codex.account || '',
      hasRefreshToken: !!(tok.refresh_token || tok.refreshToken),
    }
  }

  // 2. Grok CLI / Hermes
  const grokPaths = [
    homeFile('.grok', 'auth.json'),
    homeFile('.hermes', 'auth.json'),
  ]
  for (const p of grokPaths) {
    const grok = await readJson(p)
    if (grok && (grok.access_token || grok.token || (grok.tokens && grok.tokens.access_token))) {
      detected.grok = {
        provider: 'grok',
        path: p,
        email: grok.email || grok.account || '',
        hasRefreshToken: !!(grok.refresh_token || (grok.tokens && grok.tokens.refresh_token)),
      }
      break
    }
  }

  // 3. Antigravity / Gemini CLI
  const agyPaths = [
    homeFile('.gemini', 'antigravity-cli', 'antigravity-oauth-token'),
    homeFile('.cli-proxy-api', 'antigravity.json'),
  ]
  for (const p of agyPaths) {
    const agy = await readJson(p)
    const tok = agy && agy.token ? agy.token : agy
    if (tok && (tok.access_token || tok.accessToken)) {
      detected.antigravity = {
        provider: 'antigravity',
        path: p,
        email: agy.email || tok.account || '',
        hasRefreshToken: !!(tok.refresh_token || tok.refreshToken),
      }
      break
    }
  }

  // 4. Kimi Code Plan
  const kimi = await readJson(homeFile('.kimi-code', 'credentials', 'kimi-code.json'))
  if (kimi && (kimi.access_token || kimi.token)) {
    detected.kimi = {
      provider: 'kimi',
      path: homeFile('.kimi-code', 'credentials', 'kimi-code.json'),
      email: kimi.email || kimi.account || '',
      hasRefreshToken: !!(kimi.refresh_token || kimi.refreshToken),
    }
  }

  // 5. GLM ZCode
  const glmPaths = [
    homeFile('.zcode', 'v2', 'config.json'),
    homeFile('.zcode', 'cli', 'config.json'),
    homeFile('.zcode', 'config.json'),
  ]
  for (const p of glmPaths) {
    const glm = await readJson(p)
    if (glm && (glm.apiKey || glm.api_key || (glm.provider && glm.provider.apiKey))) {
      detected.glm = {
        provider: 'glm',
        path: p,
        email: 'ZCode CLI Account',
        hasRefreshToken: false,
      }
      break
    }
  }

  
  // 6. Cursor Token (env or CLI)
  if (process.env.CURSOR_ACCESS_TOKEN) {
    detected.cursor = {
      provider: 'cursor',
      path: 'CURSOR_ACCESS_TOKEN env',
      email: 'Cursor IDE User',
      hasRefreshToken: false,
    }
  }

  
  // 7. AWS Kiro
  const kiroPaths = [
    homeFile('.kiro', 'credentials.json'),
    homeFile('.aws', 'sso', 'cache', 'kiro-auth-token.json'),
  ]
  for (const p of kiroPaths) {
    const k = await readJson(p)
    if (k && (k.accessToken || k.access_token || k.token)) {
      detected.kiro = {
        provider: 'kiro',
        path: p,
        email: k.email || k.account || 'AWS Kiro User',
        hasRefreshToken: !!(k.refreshToken || k.refresh_token),
      }
      break
    }
  }
  if (!detected.kiro && process.env.KIRO_API_KEY) {
    detected.kiro = {
      provider: 'kiro',
      path: 'KIRO_API_KEY env',
      email: 'AWS Kiro API Key',
      hasRefreshToken: false,
    }
  }

  return detected
}

export async function loadLocalCliBlob(provider) {
  const discovered = await discoverLocalCliSessions()
  const info = discovered[provider]
  if (!info) throw new Error(`no local CLI session found for ${provider}`)

  const raw = await readJson(info.path)
  if (!raw) throw new Error(`failed to read local CLI file: ${info.path}`)

  if (provider === 'codex') {
    const tok = raw.tokens || raw
    return {
      accessToken: tok.access_token || tok.accessToken || '',
      refreshToken: tok.refresh_token || tok.refreshToken || '',
      expiresAt: tok.expires_at || tok.expiresAt || (Date.now() + 3600 * 1000),
      email: raw.email || raw.account || '',
      accountId: raw.account_id || raw.accountId || '',
    }
  }

  if (provider === 'grok') {
    const tok = raw.tokens || raw
    return {
      accessToken: tok.access_token || tok.token || '',
      refreshToken: tok.refresh_token || '',
      expiresAt: tok.expires_at || tok.expiresAt || (Date.now() + 3600 * 1000),
      email: raw.email || raw.account || '',
    }
  }

  if (provider === 'antigravity') {
    const tok = raw.token || raw
    return {
      accessToken: tok.access_token || tok.accessToken || '',
      refreshToken: tok.refresh_token || tok.refreshToken || '',
      expiresAt: tok.expiry || tok.expires_at || tok.expiresAt || (Date.now() + 3600 * 1000),
      email: raw.email || tok.account || '',
      projectId: raw.project_id || raw.projectId || tok.project_id || '',
    }
  }

  if (provider === 'kimi') {
    return {
      accessToken: raw.access_token || raw.token || '',
      refreshToken: raw.refresh_token || '',
      expiresAt: raw.expires_at || (Date.now() + 86400 * 1000),
      email: raw.email || raw.account || '',
    }
  }

  if (provider === 'glm') {
    const apiKey = raw.apiKey || raw.api_key || (raw.provider && raw.provider.apiKey) || ''
    return {
      accessToken: apiKey,
      refreshToken: '',
      expiresAt: Date.now() + 30 * 86400 * 1000,
      email: 'ZCode CLI',
    }
  }

  
  if (provider === 'cursor') {
    const token = process.env.CURSOR_ACCESS_TOKEN || (raw && (raw.accessToken || raw.access_token)) || ''
    return {
      accessToken: token,
      refreshToken: '',
      expiresAt: Date.now() + 30 * 86400 * 1000,
      email: 'Cursor User',
    }
  }

  
  if (provider === 'kiro') {
    const token = process.env.KIRO_API_KEY || (raw && (raw.accessToken || raw.access_token || raw.token)) || ''
    return {
      accessToken: token,
      refreshToken: (raw && (raw.refreshToken || raw.refresh_token)) || '',
      expiresAt: (raw && raw.expiresAt) || (Date.now() + 30 * 86400 * 1000),
      email: (raw && raw.email) || 'AWS Kiro User',
    }
  }

  throw new Error(`unsupported local CLI import for provider ${provider}`)
}
