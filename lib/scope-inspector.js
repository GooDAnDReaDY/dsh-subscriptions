export const REQUIRED_SCOPES = {
  antigravity: [
    { scope: "https://www.googleapis.com/auth/cloud-platform", description: "Google Cloud Platform & Code Assist" },
  ],
  codex: [
    { scope: "openid", description: "OpenID authentication" },
    { scope: "https://api.openai.com/auth", description: "ChatGPT API authorization" },
  ],
  claude: [
    { scope: "user:profile", description: "Anthropic user profile" },
  ],
  copilot: [
    { scope: "read:user", description: "GitHub user read" },
  ],
  grok: [
    { scope: "openid", description: "OpenID authentication" },
  ],
}

/**
 * Inspect scopes granted by provider against required scopes.
 * @param {string} provider
 * @param {string[]|string} rawScopes
 * @returns {{ scopes: string[], valid: boolean, missing: string[], warning: string, scopeWarning: string }}
 */
export function inspectScopes(provider, rawScopes) {
  const scopes = Array.isArray(rawScopes)
    ? rawScopes.map(String).filter(Boolean)
    : String(rawScopes || "").split(/[\s,]+/).filter(Boolean)

  const reqList = REQUIRED_SCOPES[provider] || []
  if (reqList.length === 0 || scopes.length === 0) {
    return { scopes, valid: true, missing: [], warning: "", scopeWarning: "" }
  }

  const missing = reqList.filter((r) =>
    !scopes.some((s) => s.toLowerCase() === r.scope.toLowerCase())
  )

  const warning = missing.length > 0
    ? `Missing required OAuth scope: ${missing.map((m) => m.description || m.scope).join(", ")}`
    : ""

  return {
    scopes,
    valid: missing.length === 0,
    missing: missing.map((m) => m.scope),
    warning,
    scopeWarning: warning,
  }
}
