// #353 & #360: Encrypted Vault Export/Import for Subscriptions
// Secure migration and backup of slots and credentials using AES-256-GCM.

import { readFileSync } from 'node:fs'
import { encryptWithPassphrase, decryptWithPassphrase } from './crypto.js'
import { isProvider, oauthRef } from './refs.js'

export const VAULT_FORMAT = 'dsh-subscriptions-vault-v1'

let cachedVersion = ''
function pluginVersion() {
  if (!cachedVersion) {
    try {
      cachedVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version || '0.0.0'
    } catch {
      cachedVersion = '0.0.0'
    }
  }
  return cachedVersion
}

export function assertSupportedVaultVersion(version) {
  const text = String(version == null ? '' : version).trim()
  if (!text) return
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(text)
  if (!match) throw new Error('invalid vault version')
  if (Number(match[1]) > 0) throw new Error('vault version ' + text + ' is newer than this plugin supports')
}

/**
 * Encrypts slots configuration and credential blobs into a portable vault string.
 */
export function exportVault({ slots = [], blobs = {}, exportedBy = 'dsh-subscriptions', algorithm = 'pbkdf2' }, passphrase) {
  const pass = String(passphrase || '').trim()
  if (!pass || pass.length < 12) {
    throw new Error('passphrase must be at least 12 characters')
  }

  const payload = {
    format: VAULT_FORMAT,
    version: pluginVersion(),
    exportedAt: new Date().toISOString(),
    exportedBy,
    slots: Array.isArray(slots) ? slots : [],
    blobs: blobs && typeof blobs === 'object' ? blobs : {},
  }

  const encrypted = encryptWithPassphrase(JSON.stringify(payload), pass, { algorithm })
  return {
    ok: true,
    vault: encrypted,
    slotCount: payload.slots.length,
    blobCount: Object.keys(payload.blobs).length,
  }
}

/**
 * Decrypts and validates an encrypted vault string with strict schema and injection protection.
 */
export function importVault(encryptedPayload, passphrase) {
  const pass = String(passphrase || '').trim()
  if (!pass) {
    throw new Error('passphrase is required')
  }

  const raw = String(encryptedPayload || '').trim()
  if (!raw.startsWith('DSHE1:') && !raw.startsWith('DSHE2:') && !raw.startsWith('DSHE3:')) {
    throw new Error('invalid vault format: missing DSHE1 header')
  }

  let jsonStr
  try {
    jsonStr = decryptWithPassphrase(raw, pass)
  } catch {
    throw new Error('failed to decrypt vault: invalid passphrase or corrupted payload')
  }

  let data
  try {
    data = JSON.parse(jsonStr)
  } catch {
    throw new Error('malformed vault content: invalid JSON')
  }

  if (!data || data.format !== VAULT_FORMAT || !Array.isArray(data.slots)
    || !data.blobs || typeof data.blobs !== 'object' || Array.isArray(data.blobs)) {
    throw new Error('invalid vault schema: unsupported structure')
  }

  assertSupportedVaultVersion(data.version)

  const refs = new Set()
  for (const slot of data.slots) {
    if (!slot || !isProvider(slot.provider) || !Number.isSafeInteger(slot.index) || slot.index < 1) {
      throw new Error('invalid vault slot')
    }
    const ref = oauthRef(slot.provider, slot.index)
    if (refs.has(ref)) throw new Error('duplicate vault slot')
    refs.add(ref)
  }

  for (const [ref, blob] of Object.entries(data.blobs)) {
    if (!refs.has(ref) || !blob || typeof blob !== 'object' || Array.isArray(blob)) {
      throw new Error('invalid vault credential: expected a declared slot and an object')
    }
  }

  return {
    ok: true,
    slots: data.slots,
    blobs: data.blobs,
    version: data.version,
    exportedAt: data.exportedAt,
  }
}
