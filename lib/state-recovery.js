import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'

const SNAPSHOT_FILE = join(homedir(), '.dsh', 'subscriptions-snapshot.json')

export async function persistPoolSnapshot(accounts) {
  try {
    const data = JSON.stringify({
      savedAt: Date.now(),
      accounts: (accounts || []).map((a) => ({
        ref: a.ref || a.id,
        cooldownUntil: a.cooldownUntil || 0,
        quota: a.quota || null,
        status: a.status || 'active'
      }))
    }, null, 2)
    await writeFile(SNAPSHOT_FILE, data, 'utf8')
    return true
  } catch {
    return false
  }
}

export async function recoverPoolSnapshot() {
  try {
    const text = await readFile(SNAPSHOT_FILE, 'utf8')
    const json = JSON.parse(text)
    return json && json.accounts ? json.accounts : []
  } catch {
    return []
  }
}
