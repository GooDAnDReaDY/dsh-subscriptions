function asString(value) {
  return value == null ? "" : String(value)
}

export function serializeBlob(obj) {
  if (!obj || typeof obj !== "object") throw new Error("invalid oauth blob")
  const accessToken = asString(obj.accessToken)
  const refreshToken = asString(obj.refreshToken)
  if (!accessToken && !refreshToken && !obj.apiKey) {
    throw new Error("oauth blob needs accessToken or refreshToken")
  }
  return JSON.stringify({
    ...obj,
    accessToken,
    refreshToken,
    expiresAt: Number(obj.expiresAt) || 0,
    label: asString(obj.label),
    email: asString(obj.email),
    accountId: asString(obj.accountId),
    projectId: asString(obj.projectId),
    ...(Array.isArray(obj.usage) ? { usage: obj.usage } : {}),
    ...(obj.usageAt ? { usageAt: Number(obj.usageAt) } : {}),
  })
}

export function parseBlob(text) {
  const obj = typeof text === "string" ? JSON.parse(text) : text
  if (!obj || typeof obj !== "object") throw new Error("invalid oauth blob")
  return {
    ...obj,
    accessToken: asString(obj.accessToken),
    refreshToken: asString(obj.refreshToken),
    expiresAt: Number(obj.expiresAt) || 0,
    label: asString(obj.label),
    email: asString(obj.email),
    accountId: asString(obj.accountId),
    projectId: asString(obj.projectId),
    ...(Array.isArray(obj.usage) ? { usage: obj.usage } : {}),
    ...(obj.usageAt ? { usageAt: Number(obj.usageAt) } : {}),
  }
}
