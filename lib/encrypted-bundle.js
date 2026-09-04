import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const SALT_LEN = 16
const IV_LEN = 12
const ITERATIONS = 100000

export function exportEncryptedBundle(data, password) {
  const salt = randomBytes(SALT_LEN)
  const key = pbkdf2Sync(password, salt, ITERATIONS, 32, 'sha256')
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  const plaintext = JSON.stringify(data)
  let encrypted = cipher.update(plaintext, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const authTag = cipher.getAuthTag().toString('hex')

  return {
    version: 1,
    algorithm: ALGORITHM,
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    authTag,
    payload: encrypted
  }
}

export function importEncryptedBundle(bundle, password) {
  if (!bundle || bundle.version !== 1 || !bundle.payload) {
    throw new Error('Invalid backup bundle format')
  }

  const salt = Buffer.from(bundle.salt, 'hex')
  const key = pbkdf2Sync(password, salt, ITERATIONS, 32, 'sha256')
  const iv = Buffer.from(bundle.iv, 'hex')
  const authTag = Buffer.from(bundle.authTag, 'hex')

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(bundle.payload, 'hex', 'utf8')
  decrypted += decipher.final('utf8')

  return JSON.parse(decrypted)
}
