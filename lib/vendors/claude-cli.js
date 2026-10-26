import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Credential file names Claude Code has used, newest first. Current releases
 * write `.credentials.json` (dotted); the undotted name is kept as a fallback so
 * machines with an older or hand-made file keep working.
 */
export const CLAUDE_CREDENTIAL_FILES = ['.credentials.json', 'credentials.json']

/** Absolute candidate paths for the Claude Code OAuth grant, newest first. */
export function claudeCredentialsPaths(home) {
  return CLAUDE_CREDENTIAL_FILES.map((file) => join(home || homedir(), '.claude', file))
}

async function readGrantFrom(file) {
  try {
    const text = await readFile(file, 'utf8')
    const json = JSON.parse(text)
    if (!json) return null
    const oauth = json.claudeAiOauth || json.oauth || json
    if (oauth && (oauth.accessToken || oauth.access_token)) {
      return {
        accessToken: oauth.accessToken || oauth.access_token,
        refreshToken: oauth.refreshToken || oauth.refresh_token || '',
        expiresAt: oauth.expiresAt || (oauth.expires_in ? Date.now() + oauth.expires_in * 1000 : Date.now() + 3600000),
        subscriptionType: oauth.subscriptionType || 'Claude Code',
        email: oauth.email || json.email || 'Claude Code CLI User',
        sourcePath: file,
      }
    }
    return null
  } catch {
    return null
  }
}

/**
 * Read Claude Code CLI credentials. `home` is a test seam: when omitted the
 * real user home is used, so production behaviour is unchanged.
 *
 * Candidates are tried newest first, because Claude Code moved from
 * `~/.claude/credentials.json` to the dotted `~/.claude/.credentials.json`.
 */
export async function readClaudeCredentials(home) {
  for (const file of claudeCredentialsPaths(home)) {
    const grant = await readGrantFrom(file)
    if (grant) return grant
  }
  return null
}
