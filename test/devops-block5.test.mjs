import test from 'node:test'
import assert from 'node:assert/strict'
import { TokenSpeedometer } from '../lib/token-speedometer.js'
import { ResetNotificationManager } from '../lib/reset-toast.js'
import { LatencyHeatmap } from '../lib/latency-heatmap.js'
import { calculateCacheSavings } from '../lib/savings-calculator.js'
import { persistPoolSnapshot, recoverPoolSnapshot } from '../lib/state-recovery.js'
import { benchmarkEndpoint } from '../lib/network-benchmark.js'

test('token speedometer calculates tokens/sec rate (#197)', async () => {
  const speed = new TokenSpeedometer()
  speed.recordChunk('Initial text chunk')
  await new Promise((r) => setTimeout(r, 50))
  speed.recordChunk('Another chunk of generated text')

  const tps = speed.getCurrentSpeed()
  assert.ok(tps > 0)
  speed.reset()
  assert.equal(speed.getCurrentSpeed(), 0)
})

test('reset notification manager fires toast when quota resets (#198)', async () => {
  const mgr = new ResetNotificationManager()
  let notified = false

  mgr.scheduleResetNotice('slot-1', Date.now() + 40, (alert) => {
    notified = true
    assert.equal(alert.accountRef, 'slot-1')
  })

  await new Promise((r) => setTimeout(r, 70))
  assert.ok(notified)
  mgr.clear()
})

test('latency heatmap aggregates 24-hour scores (#199)', () => {
  const hm = new LatencyHeatmap()
  hm.recordHourlyPing('anthropic', 0, 150)
  hm.recordHourlyPing('anthropic', 1, 950)
  hm.recordHourlyPing('anthropic', 2, 2200)

  const map = hm.getHeatmap('anthropic')
  assert.equal(map[0].color, 'green')
  assert.equal(map[1].color, 'yellow')
  assert.equal(map[2].color, 'red')
  assert.equal(map[3].color, 'gray')
})

test('savings calculator computes prompt cache financial savings (#201)', () => {
  const res = calculateCacheSavings({
    cachedTokens: 1_000_000,
    totalInputTokens: 1_200_000,
    ratePerMillion: 3.0
  })

  assert.equal(res.hitRatePercent, 83)
  assert.equal(res.estimatedSavedDollars, 2.70)
})

test('state recovery persists and restores pool snapshot (#204)', async () => {
  const accounts = [
    { id: 'acc-test', cooldownUntil: 999999, status: 'cooldown' }
  ]

  const saved = await persistPoolSnapshot(accounts)
  assert.ok(saved)

  const restored = await recoverPoolSnapshot()
  assert.ok(restored.length >= 1)
  assert.equal(restored[0].ref, 'acc-test')
})

test('network benchmark assesses latency and assigns grade (#205)', async () => {
  const mockFetch = async () => new Response(null, { status: 200 })
  const res = await benchmarkEndpoint('https://api.anthropic.com', mockFetch)
  assert.equal(res.ok, true)
  assert.equal(res.status, 200)
  assert.ok(['A', 'B', 'C'].includes(res.grade))
})
