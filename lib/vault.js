// #353: Encrypted Vault Export/Import for Subscriptions
// Secure migration and backup of slots and credentials using AES-256-GCM.

import { encryptWithPassphrase, decryptWithPassphrase } from './crypto.js'

export const VAULT_FORMAT = 'dsh-subscriptions-vault-v1'

/**
 * Encrypts slots configuration and credential blobs into a portable vault string.
 */
export function exportVault({ slots = [], blobs = {}, exportedBy = 'dsh-subscriptions' }, passphrase) {
  const pass = String(passphrase || '').trim()
  if (!pass || pass.length < 4) {
    throw new Error('passphrase must be at least 4 characters')
  }

  const payload = {
    format: VAULT_FORMAT,
    version: '0.6.17',
    exportedAt: new Date().toISOString(),
    exportedBy,
    slots: Array.isArray(slots) ? slots : [],
    blobs: blobs && typeof blobs === 'object' ? blobs : {},
  }

  const encrypted = encryptWithPassphrase(JSON.stringify(payload), pass)
  return {
    ok: true,
    vault: encrypted,
    slotCount: payload.slots.length,
    blobCount: Object.keys(payload.blobs).length,
  }
}

/**
 * Decrypts and validates an encrypted vault string.
 */
export function importVault(encryptedPayload, passphrase) {
  const pass = String(passphrase || '').trim()
  if (!pass) {
    throw new Error('passphrase is required')
  }

  const raw = String(encryptedPayload || '').trim()
  if (!raw.startsWith('DSHE1:')) {
    throw new Error('invalid vault format: missing DSHE1 header')
  }

  let jsonStr
  try {
    jsonStr = decryptWithPassphrase(raw, pass)
  } catch (err) {
    throw new Error('failed to decrypt vault: invalid passphrase or corrupted payload')
  }

  let data
  try {
    data = JSON.parse(jsonStr)
  } catch (err) {
    throw new Error('malformed vault content: invalid JSON')
  }

  if (!data || data.format !== VAULT_FORMAT || !Array.isArray(data.slots) || typeof data.blobs !== 'object') {
    throw new Error('invalid vault schema: unsupported structure')
  }

  return {
    ok: true,
    slots: data.slots,
    blobs: data.blobs,
    version: data.version,
    exportedAt: data.exportedAt,
  }
}
