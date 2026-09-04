import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

export async function readClaudeCredentials() {
  const p = join(homedir(), '.claude', 'credentials.json')
  try {
    const text = await readFile(p, 'utf8')
    const json = JSON.parse(text)
    if (!json) return null
    const oauth = json.claudeAiOauth || json.oauth || json
    if (oauth && (oauth.accessToken || oauth.access_token)) {
      return {
        accessToken: oauth.accessToken || oauth.access_token,
        refreshToken: oauth.refreshToken || oauth.refresh_token || '',
        expiresAt: oauth.expiresAt || (oauth.expires_in ? Date.now() + oauth.expires_in * 1000 : Date.now() + 3600000),
        subscriptionType: oauth.subscriptionType || 'Claude Code'
      }
    }
    return null
  } catch {
    return null
  }
}
