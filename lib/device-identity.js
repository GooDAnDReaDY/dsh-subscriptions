// #749: stable per-device identity. The passphrase is derived per device so
// one device cannot decrypt another device's remote object with only the base
// passphrase; the legacy shared object remains readable as a fallback.
import { createHash } from 'node:crypto'
import { hostname, platform, arch } from 'node:os'

export function resolveDeviceIdentity({ id = '', label = '' } = {}) {
  const host = hostname()
  const derived = createHash('sha256').update(host + '|' + platform() + '|' + arch()).digest('hex').slice(0, 12)
  const clean = String(id || derived).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32)
  return { id: clean || derived, label: String(label || host) }
}

export function devicePassphrase(passphrase, deviceId) {
  return deviceId ? String(passphrase) + '#' + String(deviceId) : String(passphrase)
}

export function withDeviceSuffix(name, deviceId) {
  if (!deviceId) return name
  const match = String(name).match(/^(.*?)(.[^./]+)?$/)
  return (match && match[1] ? match[1] : String(name)) + '.' + deviceId + (match && match[2] ? match[2] : '')
}

export function deviceWebdavUrl(url, deviceId) {
  if (!url || !deviceId) return url
  try {
    const parsed = new URL(url)
    parsed.pathname = withDeviceSuffix(parsed.pathname, deviceId)
    return parsed.toString()
  } catch {
    return url
  }
}

export function deviceGistName(deviceId) {
  return withDeviceSuffix('dsh-subscriptions-vault.enc', deviceId)
}

export function deviceS3Key(key, deviceId) {
  return withDeviceSuffix(key || 'dsh-subscriptions-vault.enc', deviceId)
}
