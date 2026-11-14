// #1059: image generation capability exposed as ctx.subscriptionImages.
export function createImageService({
  store, live, fetchForRef, parseBlob, pickAccount, defaultAccountRef,
  poolBlockReason, generateOnce, imageSizes,
}) {
  return {
    async available() {
      const logged = await store.loggedInProviders()
      const loggedList = Array.isArray(logged) ? logged : Object.keys(logged || {}).filter((name) => logged[name])
      return ['codex', 'grok'].filter((name) => loggedList.includes(name))
    },
    sizes: imageSizes,
    async generate(request) {
      const provider = request && request.provider
      if (provider !== 'codex' && provider !== 'grok') {
        throw new Error(`unknown subscription provider: ${provider}`)
      }
      const accounts = await store.listAccounts(provider)
      const mediaPool = live().mediaPoolEnabled !== false
      const onlyRef = mediaPool ? null : defaultAccountRef(live().slots, provider)
      const eligible = pickAccount(accounts || [], Date.now(), {
        family: provider === 'codex' ? 'gpt' : 'grok',
        drainBeforeReset: live().drainBeforeReset,
        drainSafetyPercent: live().drainSafetyPercent,
        ...(onlyRef ? { onlyRef } : {}),
      })
      const slot = eligible || (accounts || []).find((row) => row && row.ref && row.hasToken && !poolBlockReason(row, {}) && (!onlyRef || row.ref === onlyRef))
      if (!slot) throw new Error(`not logged in to ${provider}: sign in in the Subscriptions section`)
      const raw = await store.resolveRaw(slot.ref)
      if (!raw) throw new Error(`not logged in to ${provider}: sign in in the Subscriptions section`)
      const session = await store.ensureFresh(provider, parseBlob(raw), slot.ref)
      // Resolved per call: hosts and tests replace globalThis.fetch at runtime.
      const fetchFn = (typeof fetchForRef === 'function' && fetchForRef(slot.ref)) || globalThis.fetch
      return generateOnce({
        provider,
        prompt: request.prompt,
        size: request.size,
        quality: request.quality,
        referenceImages: request.referenceImages,
        session,
        fetchImpl: fetchFn,
        signal: request.signal,
      })
    },
  }
}
