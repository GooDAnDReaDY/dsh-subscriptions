import { scryptSync, pbkdf2Sync, createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

// AES-256-GCM with PBKDF2 (100,000 iterations, SHA-256) (DSHE2:) or scrypt (DSHE1:).
// Backward-compatible across both key derivation algorithms.
export function encryptWithPassphrase(plainText, passphrase, { algorithm = "scrypt" } = {}) {
  const salt = randomBytes(16)
  const isPbkdf2 = algorithm === "pbkdf2"
  const key = isPbkdf2
    ? pbkdf2Sync(String(passphrase), salt, 100000, 32, "sha256")
    : scryptSync(String(passphrase), salt, 32)
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const encrypted = Buffer.concat([cipher.update(String(plainText), "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  // format: magic + salt + iv + tag + data
  const prefix = isPbkdf2 ? "DSHE2:" : "DSHE1:"
  return prefix + Buffer.concat([salt, iv, tag, encrypted]).toString("base64")
}

export function decryptWithPassphrase(payload, passphrase) {
  const raw = String(payload || "")
  let key
  let salt
  let iv
  let tag
  let data
  if (raw.startsWith("DSHE2:")) {
    const buf = Buffer.from(raw.slice(6), "base64")
    salt = buf.subarray(0, 16)
    iv = buf.subarray(16, 28)
    tag = buf.subarray(28, 44)
    data = buf.subarray(44)
    key = pbkdf2Sync(String(passphrase), salt, 100000, 32, "sha256")
  } else if (raw.startsWith("DSHE1:")) {
    const buf = Buffer.from(raw.slice(6), "base64")
    salt = buf.subarray(0, 16)
    iv = buf.subarray(16, 28)
    tag = buf.subarray(28, 44)
    data = buf.subarray(44)
    key = scryptSync(String(passphrase), salt, 32)
  } else {
    throw new Error("unknown export format")
  }
  const decipher = createDecipheriv("aes-256-gcm", key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8")
}
