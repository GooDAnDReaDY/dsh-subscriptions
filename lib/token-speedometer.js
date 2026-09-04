export class TokenSpeedometer {
  constructor() {
    this.startTime = null
    this.tokenCount = 0
  }

  recordChunk(chunkText) {
    if (!this.startTime) this.startTime = Date.now()
    // Approximation: 1 token ~ 4 chars
    const tokens = Math.max(1, Math.ceil((chunkText || '').length / 4))
    this.tokenCount += tokens
    return this.getCurrentSpeed()
  }

  getCurrentSpeed() {
    if (!this.startTime) return 0
    const elapsedSec = (Date.now() - this.startTime) / 1000
    if (elapsedSec <= 0) return 0
    return Math.round((this.tokenCount / elapsedSec) * 10) / 10
  }

  reset() {
    this.startTime = null
    this.tokenCount = 0
  }
}
