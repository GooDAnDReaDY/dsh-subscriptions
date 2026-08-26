
import { test } from "node:test"
import assert from "node:assert/strict"
import { isAllowed, ALLOWLIST } from "../lib/subscriptions.js"

test("proxy route: allowed paths pass", () => {
  assert.equal(isAllowed("codex", "/responses"), true)
  assert.equal(isAllowed("codex", "/models"), true)
  assert.equal(isAllowed("grok", "/v1/billing"), true)
})

test("proxy route: disallowed paths rejected", () => {
  assert.equal(isAllowed("codex", "/evil"), false)
  assert.equal(isAllowed("unknown", "/responses"), false)
})

test("proxy route: full URL path extraction", () => {
  // simulate URL parsing like the proxy does
  const pathname = "/dsh-subscriptions/proxy/codex/responses"
  const parts = pathname.replace(/^\/dsh-subscriptions\/proxy\//, "").split("/").filter(Boolean)
  assert.equal(parts[0], "codex")
  assert.equal("/" + parts.slice(1).join("/"), "/responses")
})
