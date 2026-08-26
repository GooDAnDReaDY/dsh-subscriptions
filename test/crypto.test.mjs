
import { test } from "node:test"
import assert from "node:assert/strict"
import { encryptWithPassphrase, decryptWithPassphrase } from "../lib/crypto.js"

test("round-trip encrypt/decrypt", () => {
  const plain = JSON.stringify({ v: 1, accounts: [{ ref: "CODEX_OAUTH_1", blob: { accessToken: "at" } }] })
  const encrypted = encryptWithPassphrase(plain, "hunter2")
  assert.match(encrypted, /^DSHE1:/)
  const decrypted = decryptWithPassphrase(encrypted, "hunter2")
  assert.equal(JSON.parse(decrypted).v, 1)
})

test("wrong passphrase throws", () => {
  const encrypted = encryptWithPassphrase("secret", "right")
  assert.throws(() => decryptWithPassphrase(encrypted, "wrong"))
})

test("invalid format rejected", () => {
  assert.throws(() => decryptWithPassphrase("not-a-bundle", "pass"))
})
