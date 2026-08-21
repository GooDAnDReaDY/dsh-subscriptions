export function numberOrNull(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export function windowPercent(obj) {
  if (!obj || typeof obj !== 'object') return null
  return numberOrNull(
    obj.utilization ?? obj.used_percent ?? obj.usedPercent ?? obj.creditUsagePercent ?? obj.used_percentage,
  )
}

export function deepestUsedPercent(obj) {
  let max = null
  function walk(value, depth) {
    if (!value || typeof value !== 'object' || depth > 8) return
    const here = windowPercent(value)
    if (here != null) max = max == null ? here : Math.max(max, here)
    const remaining = numberOrNull(value.remainingFraction)
    if (remaining != null) {
      const used = (1 - remaining) * 100
      max = max == null ? used : Math.max(max, used)
    }
    const usedFrac = numberOrNull(value.usedFraction)
    if (usedFrac != null) {
      const used = usedFrac * 100
      max = max == null ? used : Math.max(max, used)
    }
    for (const child of Object.values(value)) {
      if (child && typeof child === 'object') walk(child, depth + 1)
    }
  }
  walk(obj, 0)
  return max
}

export function grokBillingPercent(json) {
  const cfg = json && json.config && typeof json.config === 'object' ? json.config : json
  const ready = numberOrNull(cfg && cfg.creditUsagePercent)
  if (ready != null) return ready
  const limit = numberOrNull(cfg && (cfg.monthlyLimit ?? cfg.limit))
  const used = numberOrNull(cfg && (cfg.used ?? cfg.usedCredits))
  if (limit && limit > 0 && used != null) return (used / limit) * 100
  return deepestUsedPercent(json)
}

export function asUsageSnapshot(percent) {
  const usedPercent = numberOrNull(percent)
  if (usedPercent == null) return null
  return { usedPercent }
}