import { scryptSync, pbkdf2Sync, createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto"

// #948: decryption derives an expensive key for every read. Cache it per
// (algorithm, passphrase, salt) so repeated describe/health calls do not burn
// 600k PBKDF2 iterations each time. Bounded to avoid unbounded memory.
const KEY_CACHE_MAX = 64
const keyCache = new Map()

function cacheKey(prefix, passphrase, salt, extra = "") {
  const secret = createHash("sha256").update(String(passphrase)).digest("base64")
  return `${prefix}:${extra}:${secret}:${salt.toString("base64")}`
}

function cachedKey(id, derive) {
  const hit = keyCache.get(id)
  if (hit) {
    keyCache.delete(id)
    keyCache.set(id, hit)
    return hit
  }
  const key = derive()
  if (keyCache.size >= KEY_CACHE_MAX) keyCache.delete(keyCache.keys().next().value)
  keyCache.set(id, key)
  return key
}

// AES-256-GCM with PBKDF2 (600,000 iterations, SHA-256) (DSHE2:),
// hardened scrypt (N=131072) (DSHE3:), or legacy scrypt (DSHE1:).
// Backward-compatible across all key derivation algorithms.
export function encryptWithPassphrase(plainText, passphrase, { algorithm = "pbkdf2" } = {}) {
  const salt = randomBytes(16)
  const isPbkdf2 = algorithm === "pbkdf2"
  const isHardenedScrypt = algorithm === "scrypt-v2" || algorithm === "scrypt-hardened"
  let key
  let prefix

  if (isPbkdf2) {
    key = pbkdf2Sync(String(passphrase), salt, 600000, 32, "sha256")
    prefix = "DSHE2:"
  } else if (isHardenedScrypt) {
    key = scryptSync(String(passphrase), salt, 32, { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 })
    prefix = "DSHE3:"
  } else {
    key = scryptSync(String(passphrase), salt, 32)
    prefix = "DSHE1:"
  }

  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const encrypted = Buffer.concat([cipher.update(String(plainText), "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  // format: magic + salt + iv + tag + data
  return prefix + Buffer.concat([salt, iv, tag, encrypted]).toString("base64")
}

/**
 * @param {string} payload
 * @param {string} passphrase
 * @param {{ onWeakKdf?: (kind: string) => void }} [options]
 */
export function decryptWithPassphrase(payload, passphrase, options = {}) {
  const onWeakKdf = options.onWeakKdf
  const raw = String(payload || "")
  let key
  let salt
  let iv
  let tag
  let data
  let weakKdf = null
  if (raw.startsWith("DSHE3:")) {
    const buf = Buffer.from(raw.slice(6), "base64")
    salt = buf.subarray(0, 16)
    iv = buf.subarray(16, 28)
    tag = buf.subarray(28, 44)
    data = buf.subarray(44)
    key = cachedKey(cacheKey("DSHE3", passphrase, salt), () =>
      scryptSync(String(passphrase), salt, 32, { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }))
  } else if (raw.startsWith("DSHE2:")) {
    const buf = Buffer.from(raw.slice(6), "base64")
    salt = buf.subarray(0, 16)
    iv = buf.subarray(16, 28)
    tag = buf.subarray(28, 44)
    data = buf.subarray(44)
    // Try 600,000 iterations first (#414), fallback to legacy 100,000 iterations
    try {
      key = cachedKey(cacheKey("DSHE2", passphrase, salt, "600k"), () =>
        pbkdf2Sync(String(passphrase), salt, 600000, 32, "sha256"))
      const decipher = createDecipheriv("aes-256-gcm", key, iv)
      decipher.setAuthTag(tag)
      return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8")
    } catch {
      key = cachedKey(cacheKey("DSHE2", passphrase, salt, "100k"), () =>
        pbkdf2Sync(String(passphrase), salt, 100000, 32, "sha256"))
      weakKdf = "DSHE2-100k"
    }
  } else if (raw.startsWith("DSHE1:")) {
    const buf = Buffer.from(raw.slice(6), "base64")
    salt = buf.subarray(0, 16)
    iv = buf.subarray(16, 28)
    tag = buf.subarray(28, 44)
    data = buf.subarray(44)
    key = cachedKey(cacheKey("DSHE1", passphrase, salt), () => scryptSync(String(passphrase), salt, 32))
    weakKdf = "DSHE1"
  } else {
    throw new Error("unknown export format")
  }
  const decipher = createDecipheriv("aes-256-gcm", key, iv)
  decipher.setAuthTag(tag)
  const out = Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8")
  if (weakKdf && typeof onWeakKdf === "function") onWeakKdf(weakKdf)
  return out
}
