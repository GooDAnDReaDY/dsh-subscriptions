function hostOf(value) {
  try { return new URL(String(value)).hostname.toLowerCase() } catch { return '' }
}

/** #803: bypass plugin proxy for listed hosts/domains. */
export function shouldBypassProxy(bypassList, targetUrl) {
  const host = hostOf(targetUrl)
  if (!host) return false
  for (const raw of Array.isArray(bypassList) ? bypassList : []) {
    const entry = String(raw || '').trim().toLowerCase().replace(/^\*\./, '').replace(/^\./, '')
    if (!entry) continue
    if (host === entry || host.endsWith('.' + entry)) return true
  }
  return false
}

/** #803: distinguish proxy transport failure from provider failure. */
export function classifyConnectivityProbe({ proxyError, providerStatus, latencyMs } = {}) {
  if (proxyError) return { ok: false, kind: 'proxy', error: String(proxyError), latencyMs: null }
  const status = Number(providerStatus) || 0
  return {
    ok: status >= 200 && status < 500,
    kind: status >= 400 ? 'provider' : 'ok',
    status,
    latencyMs: Number.isFinite(Number(latencyMs)) ? Number(latencyMs) : null,
  }
}

/** #817: tiers are independent named pools; no cross-tier fallback. */
export function validateTiers(tiers) {
  const list = Array.isArray(tiers) ? tiers : []
  const ids = new Set()
  const out = []
  for (const tier of list) {
    if (!tier || typeof tier !== 'object') continue
    const id = String(tier.id || '').trim()
    if (!id || ids.has(id)) continue
    ids.add(id)
    out.push({
      id,
      name: String(tier.name || id),
      members: (Array.isArray(tier.members) ? tier.members : [])
        .map((member) => String(member || '').trim())
        .filter(Boolean),
    })
  }
  return out
}

export function selectTierAccount(tier, accounts, nowMs = Date.now()) {
  const members = new Set((tier && tier.members) || [])
  if (!members.size) return null
  return (Array.isArray(accounts) ? accounts : []).find((account) => account
    && members.has(account.ref)
    && account.hasToken
    && (!account.cooldownUntil || Number(account.cooldownUntil) <= nowMs)
    && (!account.quarantineUntil || Number(account.quarantineUntil) <= nowMs)
    && !(account.usagePercent != null && Number(account.usagePercent) >= 100)) || null
}

/** #832: session policy snapshots are frozen at session creation. */
export function snapshotToolPolicy(policy, sessionId, at = Date.now()) {
  return { sessionId: String(sessionId || ''), at: Number(at), policy: JSON.parse(JSON.stringify(policy || {})) }
}

export function toolPolicyForSession(snapshots, sessionId) {
  const found = (Array.isArray(snapshots) ? snapshots : []).find((row) => row && row.sessionId === String(sessionId || ''))
  return found ? found.policy : null
}

/** #834: Claude CLI-synced accounts must not fight standalone OAuth over Keychain. */
export function claudeAccountMode(slot = {}) {
  const raw = String(slot.accountMode || slot.mode || '').toLowerCase()
  if (raw === 'cli-synced' || raw === 'cli') return 'cli-synced'
  return 'standalone'
}

export function canWriteClaudeKeychain(slot, blob, expectedAccountId) {
  if (claudeAccountMode(slot) !== 'cli-synced') return false
  if (!blob) return false
  const owner = String(blob.accountId || blob.email || '').trim()
  const expected = String(expectedAccountId || slot.accountId || slot.email || '').trim()
  return Boolean(owner && expected && owner === expected)
}

/** #815: normalize Codex web-search results and bound retry behavior. */
export function normalizeWebSearchResult(payload, maxBytes = 64 * 1024) {
  const body = payload && typeof payload === 'object' ? payload : {}
  const text = String(body.output_text || body.answer || body.text || '').slice(0, maxBytes)
  const citations = (Array.isArray(body.citations) ? body.citations : [])
    .map((citation) => {
      if (!citation) return null
      if (typeof citation === 'string') return { url: citation }
      return { url: String(citation.url || citation.link || ''), title: citation.title ? String(citation.title) : undefined }
    })
    .filter((citation) => citation && citation.url)
    .slice(0, 50)
  return { text, citations }
}

export function webSearchRetryDelay(attempt, status) {
  const n = Number(attempt) || 0
  const code = Number(status) || 0
  if (code === 429) return null
  if (code >= 500 && n < 2) return Math.min(2000, 250 * 2 ** n)
  return null
}
