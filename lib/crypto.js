import { scryptSync, createCipheriv, createDecipheriv, randomBytes } from "node:crypto"

// AES-256-GCM с ключом из passphrase (scrypt, без хранения соли отдельно —
// соль в начале блока).
export function encryptWithPassphrase(plainText, passphrase) {
  const salt = randomBytes(16)
  const key = scryptSync(String(passphrase), salt, 32)
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const encrypted = Buffer.concat([cipher.update(String(plainText), "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  // формат: magic + salt + iv + tag + data
  return "DSHE1:" + Buffer.concat([salt, iv, tag, encrypted]).toString("base64")
}

export function decryptWithPassphrase(payload, passphrase) {
  const raw = String(payload || "")
  if (!raw.startsWith("DSHE1:")) throw new Error("неизвестный формат экспорта")
  const buf = Buffer.from(raw.slice(6), "base64")
  const salt = buf.subarray(0, 16)
  const iv = buf.subarray(16, 28)
  const tag = buf.subarray(28, 44)
  const data = buf.subarray(44)
  const key = scryptSync(String(passphrase), salt, 32)
  const decipher = createDecipheriv("aes-256-gcm", key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8")
}
