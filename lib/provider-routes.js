/**
 * Opt-in namespaced provider routes.
 *
 * DSH refuses to bind the same provider id twice, so when another subscription
 * plugin already owns `claude`/`codex`/… our adapter is skipped entirely
 * (adapter-manager's claim guard). With `namespacedRoutes` enabled we register
 * `subscriptions-<vendor>` instead, which lets both plugins serve models while
 * keeping every id distinct and stable across restarts.
 */

export const ROUTE_PREFIX = 'subscriptions-'

/** Map a vendor id to its namespaced route id. */
export function subscriptionRoute(provider) {
  return ROUTE_PREFIX + String(provider)
}

/** Map a namespaced route id back to the vendor id; throws for foreign routes. */
export function vendorFromRoute(route) {
  const value = String(route)
  if (!value.startsWith(ROUTE_PREFIX)) throw new Error('Unknown subscription route: ' + value)
  return value.slice(ROUTE_PREFIX.length)
}

export function isSubscriptionRoute(route) {
  return typeof route === 'string' && route.startsWith(ROUTE_PREFIX) && route.length > ROUTE_PREFIX.length
}

function withRoute(value, route) {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map((item) => withRoute(item, route))
  return { ...value, provider: route }
}

/**
 * Wraps an adapter so the engine keeps talking in vendor ids while DSH sees
 * `subscriptions-<vendor>` routes. The wrapper is deliberately thin: every
 * method unwraps the route, delegates, and re-stamps the provider on results.
 */
export class NamespacedAdapter {
  constructor(adapter) {
    this.adapter = adapter
  }

  providerInfo(route) {
    const info = this.adapter.providerInfo(vendorFromRoute(route))
    if (info === null || typeof info !== 'object') return info
    return { ...info, id: route, name: info.name ? info.name + ' (Subscriptions+)' : info.name }
  }

  providerRetryPolicy(route) {
    return this.adapter.providerRetryPolicy(vendorFromRoute(route))
  }

  async listModels(route) {
    const models = await this.adapter.listModels(vendorFromRoute(route))
    return Array.isArray(models) ? models.map((model) => withRoute(model, route)) : models
  }

  async resolveModel(route, model, signal) {
    return withRoute(await this.adapter.resolveModel(vendorFromRoute(route), model, signal), route)
  }

  async prepareCall(route, model, signal) {
    const prepared = await this.adapter.prepareCall(vendorFromRoute(route), model, signal)
    if (prepared === null || typeof prepared !== 'object') return prepared
    return {
      ...prepared,
      model: withRoute(prepared.model, route),
      stream: (options) => prepared.stream({ ...options, provider: vendorFromRoute(route) }),
    }
  }

  stream(options) {
    const route = options && options.provider
    return this.adapter.stream({ ...options, provider: isSubscriptionRoute(route) ? vendorFromRoute(route) : route })
  }

  imageRequestPricing(route, model) {
    return this.adapter.imageRequestPricing(vendorFromRoute(route), model)
  }
}
