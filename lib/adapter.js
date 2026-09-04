import { LlmAdapter, LlmError, attributionHeaders } from '@deepseek-ai/dsh-llm'
import { displayName } from './refs.js'
import { getVendor } from './vendors/index.js'
import { modelCatalog } from './messages.js'
import { streamWithRotation } from './stream-rotate.js'
import { pickFetch } from './proxy.js'

// #94: heuristic for test/preview/beta/legacy model ids.
function isDeprecatedId(id) {
  return /(^|[-_:])(test|preview|dev|alpha|beta|snapshot|experimental|legacy|deprecated)([-_:]|$)/i.test(id)
}

function asLlmError(err) {
  if (err instanceof LlmError) return err
  const code = (err && err.code) || 'VENDOR'
  const message = String((err && err.message) || err || 'vendor error')
  try {
    const out = new LlmError(message, code)
    if (err && err.validationUrl) out.validationUrl = err.validationUrl
    return out
  } catch {
    return err
  }
}

export class SubscriptionAdapter extends LlmAdapter {
  constructor(deps) {
    super()
    this.deps = deps
  }

  providerInfo(provider) {
    return { id: provider, name: displayName(provider) }
  }

  providerRetryPolicy(_provider) {
    return undefined
  }

  async listModels(provider) {
    const accounts = await this.deps.listAccounts(provider)
    if (!accounts.some((a) => a.hasToken)) return []
    const cfg = this.deps.vendorConfig(provider)
    const fetchImpl = this.deps.fetchImpl || fetch
    let models = null
    try {
      const blob = await this.deps.ensureFresh(
        provider,
        await this.deps.loadBlob(accounts.find((a) => a.hasToken).ref),
        accounts.find((a) => a.hasToken).ref,
      )
      const live = await getVendor(provider).listModels(blob, cfg, fetchImpl)
      if (Array.isArray(live) && live.length) models = live
    } catch { /* use built-in catalog */ }
    if (!models) models = modelCatalog(provider, cfg.models)
    // #94: optionally hide test/preview/beta/legacy ids from the picker.
    if (typeof this.deps.hideDeprecatedModels === 'function' && this.deps.hideDeprecatedModels()) {
      models = models.filter((m) => !isDeprecatedId(String((m && m.id) || '')))
    }
    // Defensive: ensure every model has the provider field set
    models = models.map((m) => (m && !m.provider ? { ...m, provider } : m))
    return models
  }

  imageRequestPricing(_provider, _model) {
    return undefined
  }

  async resolveModel(provider, model, _signal) {
    const rows = await this.listModels(provider)
    const found = rows.find((row) => row && row.id === model)
    if (found) {
      return {
        provider,
        id: model,
        name: found.name || model,
        ...(found.description ? { description: found.description } : {}),
        ...(found.inputModalities ? { inputModalities: found.inputModalities } : {}),
        ...(found.contextWindow ? { context: { contextWindow: found.contextWindow } } : {}),
        ...(found.reasoning ? { reasoning: found.reasoning } : {}),
      }
    }
    return { provider, id: model, name: model }
  }

  async prepareCall(provider, model, signal) {
    return {
      model: await this.resolveModel(provider, model, signal),
      stream: (options) => this.stream(options),
    }
  }

  async *stream(options) {
    const provider = options.provider
    const deps = this.deps
    let yieldedAny = false
    try {
      if (typeof deps.refreshUsage === 'function') {
        await deps.refreshUsage(provider)
      }
      for await (const event of streamWithRotation({
        accounts: await deps.listAccounts(provider),
        nowMs: () => Date.now(),
        cooldownMs: deps.cooldownMs(),
        switchAtRemaining: typeof deps.switchAtRemaining === 'function' ? deps.switchAtRemaining() : (deps.switchAtRemaining ?? 0),
        options,
        onCooldown: (account) => {
          deps.rememberCooldown(account.ref, account.cooldownUntil, account.cooldownFamilies || null)
          if (typeof deps.recordSwitch === 'function') deps.recordSwitch(account.ref)
        },
        streamOnce: async function* (account, opts) {
          const blob = await deps.ensureFresh(provider, await deps.loadBlob(account.ref), account.ref)
          const vendor = getVendor(provider)
          // ponytail: capture x-ratelimit headers without touching vendors
          const baseFetch = pickFetch(deps, account.ref)
          const quotaFetch = async (url, init) => {
            const res = await baseFetch(url, init)
            try {
              const snap = quotaSnapshot(provider, res.headers, null, Date.now())
              if (snap && typeof deps.rememberQuota === "function") deps.rememberQuota(account.ref, snap)
            } catch {}
            if (!res.ok && res.clone) {
              try {
                const txt = await res.clone().text()
                let j=null; try{ j=JSON.parse(txt)}catch{}
                if (j) {
                  const b = parseBody(provider, j, Date.now())
                  if (b) {
                    const snap2 = quotaSnapshot(provider, res.headers, j, Date.now())
                    if (snap2) deps.rememberQuota(account.ref, snap2)
                  }
                }
              } catch {}
            }
            return res
          }
          try {
            if (typeof deps.rememberRequest === 'function') deps.rememberRequest(account.ref)
            yield* vendor.streamOnce({
              blob,
              options: opts,
              fetchImpl: quotaFetch,
              headers: attributionHeaders(),
              config: deps.vendorConfig(provider),
              signal: opts.signal,
              saveBlob: (next) => deps.saveBlob(account.ref, next),
            })
            // поток завершился успешно: снять кулдаун и здоровье-штрафы
            if (typeof deps.recordSuccess === 'function') deps.recordSuccess(account.ref)
            // #65: записать в историю запросов и стоимости.
            if (typeof deps.recordHistory === 'function') {
              try {
                deps.recordHistory({
                  provider,
                  ref: account.ref,
                  model: (opts && opts.model) || null,
                  path: '/responses',
                  method: 'POST',
                  status: 200,
                  ms: Date.now() - t0,
                  kind: 'stream',
                })
              } catch {}
            }
          } catch (err) {
            if (err && err.code === 'VALIDATION_REQUIRED' && err.validationUrl) {
              await deps.saveBlob(account.ref, {
                ...blob,
                validationUrl: err.validationUrl,
                validationMessage: String(err.message || ''),
              })
            }
            throw err
          }
        },
      })) { yieldedAny = true; yield event }
      return
    } catch (err) {
      // #91: when the whole pool is exhausted and nothing has been streamed
      // yet, continue seamlessly on local Ollama instead of failing the chat.
      if (!yieldedAny && typeof deps.ollamaFallback === 'function') {
        yield* deps.ollamaFallback({ options, provider, err })
        return
      }
      throw asLlmError(err)
    }
  }
}