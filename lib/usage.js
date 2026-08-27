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
// Named limit windows reported by vendors (five_hour, seven_day, primary...).
// Label map is a data table: extend it when a vendor adds a window name.
const WINDOW_LABELS = {
  five_hour: { ru: "5ч", en: "5h" },
  seven_day: { ru: "7д", en: "7d" },
  seven_day_oauth_apps: { ru: "7д прил.", en: "7d apps" },
  weekly_limit_7_days: { ru: "7д", en: "7d" },
  primary: { ru: "осн.", en: "primary" },
  secondary: { ru: "втор.", en: "secondary" },
  primary_window: { ru: "осн.", en: "primary" },
  secondary_window: { ru: "втор.", en: "secondary" },
  monthly: { ru: "месяц", en: "month" },
  credits: { ru: "кредиты", en: "credits" },
}

function windowLabel(id) {
  const known = WINDOW_LABELS[id]
  return known || { ru: id, en: id }
}

// Walk vendor usage JSON; every node carrying a utilization-style number
// becomes a named window keyed by its JSON key.
export function usageWindows(obj) {
  const out = []
  const seen = new Set()
  function walk(value, key, depth) {
    if (!value || typeof value !== "object" || depth > 6) return
    const pct = numberOrNull(
      value.utilization ?? value.used_percent ?? value.usedPercent ?? value.creditUsagePercent ?? value.used_percentage,
    )
    if (pct != null && key && !seen.has(key)) {
      seen.add(key)
      const label = windowLabel(key)
      out.push({ id: key, ru: label.ru, en: label.en, usedPercent: pct })
    }
    const frac = numberOrNull(value.remainingFraction)
    if (frac != null && key && !seen.has(key)) {
      seen.add(key)
      const label = windowLabel(key)
      out.push({ id: key, ru: label.ru, en: label.en, usedPercent: (1 - frac) * 100 })
    }
    const ufrac = numberOrNull(value.usedFraction)
    if (ufrac != null && key && !seen.has(key)) {
      seen.add(key)
      const label = windowLabel(key)
      out.push({ id: key, ru: label.ru, en: label.en, usedPercent: ufrac * 100 })
    }
    for (const [k, child] of Object.entries(value)) {
      if (child && typeof child === "object") walk(child, k, depth + 1)
    }
  }
  walk(obj, "", 0)
  return out.length ? out : null
}
