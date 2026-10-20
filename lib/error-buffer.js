import { cleanErrorMessage, maskSecrets } from './mask.js'

/**
 * Ring buffer holding the most recent runtime errors across vendors and streams.
 * Sanitizes all text to prevent credential or PII leaks in diagnostics.
 */
export class ErrorRingBuffer {
  /**
   * @param {number} [limit=20]
   */
  constructor(limit = 20) {
    this.limit = limit
    /** @type {Array<{ id: string, ts: string, provider: string, ref: string, model: string, status: number|null, code: string, message: string }>} */
    this.entries = []
    this._nextId = 1
  }

  /**
   * @param {{ provider?: string, ref?: string, model?: string, status?: number|null, code?: string, message?: string }} [param0]
   */
  record({ provider = 'unknown', ref = '', model = '', status = null, code = '', message = '' } = {}) {
    const rawMsg = cleanErrorMessage(maskSecrets(message))
    const entry = {
      id: String(this._nextId++),
      ts: new Date().toISOString(),
      provider: String(provider || ''),
      ref: String(ref || ''),
      model: String(model || ''),
      status: typeof status === 'number' ? status : null,
      code: String(code || ''),
      message: rawMsg.slice(0, 250),
    }
    this.entries.unshift(entry)
    if (this.entries.length > this.limit) {
      this.entries.length = this.limit
    }
    return entry
  }

  getEntries() {
    return this.entries.slice()
  }

  clear() {
    this.entries = []
  }
}

export const defaultErrorBuffer = new ErrorRingBuffer(20)
