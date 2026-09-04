export class LatencyHeatmap {
  constructor() {
    // 24-hour slots: map provider -> array of 24 hourly averages
    this.matrix = new Map()
  }

  recordHourlyPing(provider, hourIndex, latencyMs) {
    const p = provider || 'unknown'
    if (!this.matrix.has(p)) {
      this.matrix.set(p, new Array(24).fill(null))
    }
    const arr = this.matrix.get(p)
    const idx = Math.max(0, Math.min(23, hourIndex))
    arr[idx] = latencyMs
  }

  getHeatmap(provider) {
    const arr = this.matrix.get(provider) || new Array(24).fill(null)
    return arr.map((latency) => {
      if (latency == null) return { latency: null, color: 'gray' }
      if (latency < 400) return { latency, color: 'green' }
      if (latency < 1200) return { latency, color: 'yellow' }
      return { latency, color: 'red' }
    })
  }
}
