import test from "node:test"
import assert from "node:assert/strict"
import { exportVault, importVault } from "../lib/vault.js"


test("#396: exportVault supports pbkdf2 algorithm producing DSHE2 prefix", () => {
  const passphrase = "TestPassphrase123"
  const slots = [{ provider: "antigravity", index: 1, label: "AG Pro" }]
  const blobs = { ANTIGRAVITY_OAUTH_1: { accessToken: "tok_ag", projectId: "p-123" } }

  const res = exportVault({ slots, blobs, algorithm: "pbkdf2" }, passphrase)
  assert.equal(res.ok, true)
  assert.match(res.vault, /^DSHE2:/)
  assert.equal(res.slotCount, 1)

  const imported = importVault(res.vault, passphrase)
  assert.equal(imported.ok, true)
  assert.equal(imported.slots.length, 1)
  assert.equal(imported.blobs.ANTIGRAVITY_OAUTH_1.projectId, "p-123")
})

test("#396: exportVault defaults to scrypt producing DSHE1 prefix for backwards compatibility", () => {
  const passphrase = "TestPassphrase123"
  const slots = [{ provider: "codex", index: 1 }]
  const blobs = { CODEX_OAUTH_1: { accessToken: "tok_codex" } }

  const res = exportVault({ slots, blobs }, passphrase)
  assert.equal(res.ok, true)
  assert.match(res.vault, /^DSHE1:/)

  const imported = importVault(res.vault, passphrase)
  assert.equal(imported.ok, true)
  assert.equal(imported.blobs.CODEX_OAUTH_1.accessToken, "tok_codex")
})

test("#396: importVault rejects wrong passphrase for both DSHE1 and DSHE2", () => {
  const p1 = exportVault({ slots: [{ provider: "claude", index: 1 }], blobs: { CLAUDE_OAUTH_1: {} }, algorithm: "scrypt" }, "passA")
  const p2 = exportVault({ slots: [{ provider: "claude", index: 1 }], blobs: { CLAUDE_OAUTH_1: {} }, algorithm: "pbkdf2" }, "passA")

  assert.throws(() => importVault(p1.vault, "wrongPass"), /invalid passphrase/)
  assert.throws(() => importVault(p2.vault, "wrongPass"), /invalid passphrase/)
})
