import { validateProfile, createVendorFromProfile } from './vendor-factory.js'

/**
 * A vendor pack is a data-only provider declaration. It reuses the declarative
 * profile contract but also carries the built vendor object, so a pack can be
 * registered by another plugin without touching providers/vendors/cascade.
 */
export function normalizeVendorPack(raw) {
  const pack = raw && typeof raw === 'object' ? raw : {}
  const profile = validateProfile({
    id: pack.id,
    displayName: pack.displayName,
    authUrl: pack.authUrl,
    tokenUrl: pack.tokenUrl,
    baseUrl: pack.baseUrl,
    scope: pack.scope,
    tokenStyle: pack.tokenStyle,
    clientId: pack.clientId,
    redirectUri: pack.redirectUri,
    modelsPath: pack.modelsPath,
    models: pack.models,
    headers: pack.headers,
  })
  return { ...profile, vendor: createVendorFromProfile(profile) }
}

export function registerVendorPack(raw, registry = {}) {
  const pack = normalizeVendorPack(raw)
  if (typeof registry.registerVendor !== 'function') throw new Error('vendor pack registry is unavailable')
  registry.registerVendor(pack.vendor)
  if (typeof registry.registerProviderId === 'function') registry.registerProviderId([pack.id])
  if (typeof registry.registerDisplayName === 'function' && pack.displayName) {
    registry.registerDisplayName(pack.id, pack.displayName)
  }
  return pack
}
