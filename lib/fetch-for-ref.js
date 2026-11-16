// #1077: per-account fetch factory (slot proxy -> fallback pool -> direct),
// split out of the plugin entry point.
export function createFetchForRef({
  live, normalizeSlots, parseOauthRef, resolveEffectiveProxy, proxyFetch,
  shouldBypassProxy, pickPoolProxy, recordPoolResult, sharedPoolState,
}) {
  const fetchForRef = (ref) => {
    const parsed = parseOauthRef(ref)
    if (!parsed) return null
    const slot = normalizeSlots(live().slots).find((s) => s.provider === parsed.provider && s.index === parsed.index)
    if (!slot) return null
    const effective = resolveEffectiveProxy({ pluginProxy: slot.proxyUrl })
    const bypass = Array.isArray(slot.proxyBypass) ? slot.proxyBypass : []
    const withBypass = (proxied) => {
      if (!bypass.length) return proxied
      return (url, init) => shouldBypassProxy(bypass, String(url)) ? fetch(url, init) : proxied(url, init)
    }
    if (effective) {
      const proxied = proxyFetch(effective)
      return proxied ? withBypass(proxied) : null
    }
    // #1050: no per-slot proxy - use the shared fallback pool when configured,
    // marking results so a dead proxy gets a cooldown instead of a retry storm.
    const poolEntry = pickPoolProxy(live().proxyPool, sharedPoolState(), Date.now())
    if (!poolEntry) return null
    const pooled = proxyFetch(poolEntry)
    if (!pooled) return null
    const cooldownMs = Number(live().proxyPoolCooldownMs) || undefined
    return (url, init) => {
      const call = pooled(url, init)
      if (!call || typeof call.then !== 'function') return call
      return call.then(
        (res) => { recordPoolResult(sharedPoolState(), poolEntry, true, Date.now(), cooldownMs); return res },
        (err) => { recordPoolResult(sharedPoolState(), poolEntry, false, Date.now(), cooldownMs); throw err },
      )
    }
  }

  return fetchForRef
}
