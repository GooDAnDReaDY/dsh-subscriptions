import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

export async function discoverCodingAgentConfigs() {
  const configs = {}

  // 1. Aider (.aider.conf.yml)
  try {
    const p = join(homedir(), '.aider.conf.yml')
    const text = await readFile(p, 'utf8')
    configs.aider = {
      name: 'Aider Config',
      path: p,
      found: true,
      raw: text
    }
  } catch {
    // not present
  }

  // 2. Roo-Code / Roo-Cline settings
  try {
    const p = join(homedir(), '.roo-code', 'settings.json')
    const text = await readFile(p, 'utf8')
    configs.roocode = {
      name: 'Roo-Code Config',
      path: p,
      found: true,
      raw: text
    }
  } catch {
    // not present
  }

  return configs
}
