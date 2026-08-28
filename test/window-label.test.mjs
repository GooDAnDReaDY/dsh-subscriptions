import { test } from "node:test"
import assert from "node:assert/strict"
import { windowLabel } from "../lib/usage.js"

test("windowLabel: known ids", () => {
  // claude/grok
  assert.equal(windowLabel("five_hour").en, "5h")
  assert.equal(windowLabel("five_hour").ru, "5ч")
  assert.equal(windowLabel("seven_day").en, "7d")
  assert.equal(windowLabel("seven_day").ru, "7д")
  // codex: primary_window/secondary_window -> 5h/7d
  assert.equal(windowLabel("primary_window").en, "5h")
  assert.equal(windowLabel("primary_window").ru, "5ч")
  assert.equal(windowLabel("secondary_window").en, "7d")
  assert.equal(windowLabel("secondary_window").ru, "7д")
})

test("windowLabel: unknown id returns {ru:id, en:id}", () => {
  const l = windowLabel("mystery_window_xyz")
  assert.equal(l.en, "mystery_window_xyz")
  assert.equal(l.ru, "mystery_window_xyz")
})