import { createHash } from 'node:crypto'

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
  'VSCode/1.98.0 (Windows_NT x64)',
  'Cursor/0.45.6 (Darwin x64)'
]

export function getRandomUserAgent(seed) {
  if (!seed) return USER_AGENTS[0]
  const hash = createHash('md5').update(String(seed)).digest('hex')
  const idx = parseInt(hash.slice(0, 4), 16) % USER_AGENTS.length
  return USER_AGENTS[idx]
}

export function generateIdeTelemetryHeaders(sessionId, clientType = 'vscode') {
  const sid = sessionId || 'session-' + Math.random().toString(36).slice(2, 10)
  const machineHash = createHash('sha256').update(sid).digest('hex').slice(0, 32)
  return {
    'vscode-sessionid': sid,
    'vscode-machineid': machineHash,
    'editor-version': clientType === 'cursor' ? 'cursor/0.45.6' : 'vscode/1.98.0',
    'editor-plugin-version': 'dsh-sub-client/0.5.8',
    'User-Agent': getRandomUserAgent(sid)
  }
}
