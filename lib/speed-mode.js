const modes = new Map()

export function setSpeedMode(sessionId, mode) {
  const id = String(sessionId || '').trim()
  if (!id) return
  const value = String(mode || '').toLowerCase()
  if (value === 'fast') modes.set(id, 'fast')
  else modes.delete(id)
}

export function getSpeedMode(sessionId) {
  return modes.get(String(sessionId || '').trim()) || null
}

export function clearSpeedMode(sessionId) {
  modes.delete(String(sessionId || '').trim())
}
