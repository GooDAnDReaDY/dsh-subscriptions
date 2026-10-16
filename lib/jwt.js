export function decodeJwtPayload(token) {
  const raw = String(token || "")
  const parts = raw.split(".")
  if (parts.length < 2) return null
  try {
    const json = Buffer.from(parts[1], "base64url").toString("utf8")
    return JSON.parse(json)
  } catch {
    return null
  }
}

export function chatgptAccountId(token) {
  const payload = decodeJwtPayload(token)
  if (!payload || typeof payload !== "object") return ""
  if (payload.chatgpt_account_id) return String(payload.chatgpt_account_id)
  const nested = payload["https://api.openai.com/auth"]
  if (nested && nested.chatgpt_account_id) return String(nested.chatgpt_account_id)
  if (nested && nested.user_id) return String(nested.user_id)
  const orgs = payload.organizations
  if (Array.isArray(orgs) && orgs[0] && orgs[0].id) return String(orgs[0].id)
  if (payload.sub) return String(payload.sub)
  return ""
}

export function emailFromToken(token) {
  const payload = decodeJwtPayload(token)
  if (!payload || typeof payload !== "object") return ""
  if (payload.email) return String(payload.email)
  const openaiProf = payload["https://api.openai.com/profile"]
  if (openaiProf && openaiProf.email) return String(openaiProf.email)
  if (payload.preferred_username) return String(payload.preferred_username)
  if (payload.upn) return String(payload.upn)
  return ""
}

export function planFromToken(token) {
  const payload = decodeJwtPayload(token)
  if (!payload || typeof payload !== "object") return ""
  const nested = payload["https://api.openai.com/auth"]
  if (nested && nested.chatgpt_plan_type) return String(nested.chatgpt_plan_type)
  const anthropic = payload["https://api.anthropic.com"]
  if (anthropic && anthropic.plan) return String(anthropic.plan)
  if (payload.plan_type) return String(payload.plan_type)
  if (payload.plan) return typeof payload.plan === "string" ? payload.plan : (payload.plan.name || "")
  if (payload.subscription && payload.subscription.tier) return String(payload.subscription.tier)
  if (payload.subscription_tier) return String(payload.subscription_tier)
  if (payload.paidTierName) return String(payload.paidTierName)
  return ""
}

export function avatarFromToken(token) {
  const payload = decodeJwtPayload(token)
  if (!payload || typeof payload !== "object") return ""
  if (payload.picture && typeof payload.picture === "string") return payload.picture
  if (payload.avatar_url && typeof payload.avatar_url === "string") return payload.avatar_url
  if (payload.avatar && typeof payload.avatar === "string") return payload.avatar
  const openaiProf = payload["https://api.openai.com/profile"]
  if (openaiProf && openaiProf.picture && typeof openaiProf.picture === "string") return openaiProf.picture
  return ""
}

export function scopesFromToken(token) {
  const payload = decodeJwtPayload(token)
  if (!payload || typeof payload !== "object") return []
  const raw = payload.scope || payload.scp || ""
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean)
  if (typeof raw === "string") return raw.split(/[\s,]+/).filter(Boolean)
  return []
}

export function isGoogleClientId(str) {
  if (typeof str !== "string") return false
  const trimmed = str.trim()
  return /^[0-9]+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(trimmed)
}

export function extractGoogleClientIdFromJwt(token) {
  const payload = decodeJwtPayload(token)
  if (!payload || typeof payload !== "object") return ""

  const azp = typeof payload.azp === "string" ? payload.azp.trim() : ""
  const rawAud = payload.aud

  const audiences = Array.isArray(rawAud)
    ? rawAud.filter(a => typeof a === "string").map(a => a.trim())
    : (typeof rawAud === "string" && rawAud.trim() ? [rawAud.trim()] : [])

  if (azp) {
    if (!isGoogleClientId(azp)) return ""
    if (audiences.length > 0 && !audiences.includes(azp)) {
      return ""
    }
    return azp
  }

  const validAuds = audiences.filter(isGoogleClientId)
  if (validAuds.length === 1 && (audiences.length === 1 || audiences.every(a => a === validAuds[0]))) {
    return validAuds[0]
  }

  return ""
}

export function organizationsFromToken(token) {
  const payload = decodeJwtPayload(token)
  if (!payload || typeof payload !== "object") return []
  const raw = payload.organizations ||
    (payload["https://api.openai.com/auth"] && payload["https://api.openai.com/auth"].organizations) ||
    payload.orgs ||
    (payload["https://api.anthropic.com/auth"] && payload["https://api.anthropic.com/auth"].organizations) ||
    []
  if (!Array.isArray(raw)) return []
  const out = []
  for (const item of raw) {
    if (typeof item === "string" && item.trim()) {
      out.push({ id: item.trim(), name: item.trim() })
    } else if (item && typeof item === "object") {
      const id = String(item.id || item.org_id || item.uuid || "").trim()
      const name = String(item.title || item.name || item.org_name || id).trim()
      const role = item.role ? String(item.role).trim() : undefined
      if (id) {
        out.push({ id, name: name || id, ...(role ? { role } : {}) })
      }
    }
  }
  return out
}
