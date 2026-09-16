import { test } from "node:test"
import assert from "node:assert/strict"
import { usageWindows } from "../lib/usage.js"
import { serializeBlob, parseBlob } from "../lib/blob.js"

test("usageWindows extracts named windows (claude five_hour/seven_day)", () => {
  const json = {
    five_hour: { utilization: 39.4 },
    seven_day_oauth_apps: { utilization: 12 },
  }
  const wins = usageWindows(json)
  assert.equal(wins.length, 2)
  const byId = Object.fromEntries(wins.map((w) => [w.id, w]))
  assert.equal(byId.five_hour.usedPercent, 39.4)
  assert.equal(byId.five_hour.en, "5h")
  assert.equal(byId.five_hour.zh, "5小时")
  assert.equal(byId.seven_day_oauth_apps.en, "7d apps")
  assert.equal(byId.seven_day_oauth_apps.zh, "7天应用")
})

test("usageWindows reads remainingFraction as used", () => {
  const wins = usageWindows({ rate_limits: { primary: { remainingFraction: 0.61 } } })
  assert.ok(Math.abs(wins[0].usedPercent - 39) < 0.01)
  assert.equal(wins[0].id, "primary")
  assert.equal(wins[0].en, "primary")
  assert.equal(wins[0].zh, "主配额")
})

test("usageWindows returns null for silent vendors", () => {
  assert.equal(usageWindows({ foo: { bar: 1 } }), null)
  assert.equal(usageWindows(null), null)
})

test("blob round-trips persisted usage windows", () => {
  const raw = serializeBlob({
    accessToken: "at",
    refreshToken: "rt",
    expiresAt: 1,
    usage: [{ id: "five_hour", en: "5h", zh: "5小时", usedPercent: 39 }],
    usageAt: 12345,
  })
  const parsed = parseBlob(raw)
  assert.equal(parsed.usage.length, 1)
  assert.equal(parsed.usage[0].usedPercent, 39)
  assert.equal(parsed.usageAt, 12345)
  // and without usage fields
  const plain = parseBlob(serializeBlob({ accessToken: "a", refreshToken: "b" }))
  assert.equal(plain.usage, undefined)
})
