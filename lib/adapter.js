import { LlmAdapter, LlmError, attributionHeaders } from '@deepseek-ai/dsh-llm'
import { displayName } from './refs.js'
import { getVendor } from './vendors/index.js'
import { modelCatalog } from './messages.js'
import { streamWithRotation } from './stream-rotate.js'

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
    try {
      const blob = await this.deps.ensureFresh(
        provider,
        await this.deps.loadBlob(accounts.find((a) => a.hasToken).ref),
        accounts.find((a) => a.hasToken).ref,
      )
      const models = await getVendor(provider).listModels(blob, cfg, fetchImpl)
      if (Array.isArray(models) && models.length) return models
    } catch { /* use built-in catalog */ }
    return modelCatalog(provider, cfg.models)
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

  async *stream(options) {
    const provider = options.provider
    const deps = this.deps
    try {
      if (typeof deps.refreshUsage === 'function') {
        await deps.refreshUsage(provider)
      }
      yield* streamWithRotation({
        accounts: await deps.listAccounts(provider),
        nowMs: () => Date.now(),
        cooldownMs: deps.cooldownMs(),
        switchAtRemaining: typeof deps.switchAtRemaining === 'function' ? deps.switchAtRemaining() : (deps.switchAtRemaining ?? 0),
        options,
        onCooldown: (account) => {
          deps.rememberCooldown(account.ref, account.cooldownUntil)
          if (typeof deps.recordSwitch === 'function') deps.recordSwitch(account.ref)
        },
        streamOnce: async function* (account, opts) {
          const blob = await deps.ensureFresh(provider, await deps.loadBlob(account.ref), account.ref)
          const vendor = getVendor(provider)
          // ponytail: capture x-ratelimit headers without touching vendors
          const baseFetch = deps.fetchImpl || fetch
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
      })
    } catch (err) {
      throw asLlmError(err)
    }
  }
}