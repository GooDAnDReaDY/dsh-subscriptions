import { open, unlink } from 'node:fs/promises'

export async function withFileLock(filePath, fn, timeoutMs = 5000) {
  const lockPath = `${filePath}.lock`
  const start = Date.now()
  let handle = null

  while (Date.now() - start < timeoutMs) {
    try {
      handle = await open(lockPath, 'wx')
      break
    } catch (err) {
      if (err.code === 'EEXIST') {
        await new Promise((r) => setTimeout(r, 40))
        continue
      }
      throw err
    }
  }

  if (!handle) {
    throw new Error(`Failed to acquire lock on ${lockPath} after ${timeoutMs}ms`)
  }

  try {
    return await fn()
  } finally {
    try {
      await handle.close()
      await unlink(lockPath)
    } catch {
      // ignore unlock errors
    }
  }
}
