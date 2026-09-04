export class LatencyTracker {
  constructor(sampleLimit = 10) {
    this.samples = new Map()
    this.limit = sampleLimit
  }

  record(slotRef, latencyMs) {
    if (!slotRef || typeof latencyMs !== 'number' || latencyMs < 0) return
    if (!this.samples.has(slotRef)) {
      this.samples.set(slotRef, [])
    }
    const arr = this.samples.get(slotRef)
    arr.push(latencyMs)
    if (arr.length > this.limit) arr.shift()
  }

  getAverage(slotRef) {
    const arr = this.samples.get(slotRef)
    if (!arr || !arr.length) return null
    const sum = arr.reduce((acc, v) => acc + v, 0)
    return Math.round(sum / arr.length)
  }

  getHealthScore(slotRef) {
    const avg = this.getAverage(slotRef)
    if (avg == null) return 100
    if (avg < 300) return 100
    if (avg < 800) return 85
    if (avg < 2000) return 60
    return 30
  }

  clear() {
    this.samples.clear()
  }
}
