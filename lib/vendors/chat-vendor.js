/**
 * Declarative vendors for the OpenAI-compatible `/chat/completions` family (#629).
 *
 * Four modules — `replit`, `spark`, `cody`, `qwen` — were the same ninety lines
 * with different constants: a base URL, a model table, a token header prefix, an
 * error string. A protocol drift meant editing each copy, and they had already
 * started to differ in places nobody intended (some sent `max_tokens`, some did
 * not; some sent tools, some could not).
 *
 * A vendor in this family is now a *profile*: data, not code. `createChatVendor`
 * builds the module surface the registry expects, and the per-vendor file shrinks
 * to its profile. Providers with their own quota calls, auth flows or protocols
 * (`glm`, `kimi`, `kiro`, `cursor`, `claude`, `codex`, `grok`, `antigravity`,
 * `copilot`) stay hand-written — the difference is real, not accidental.
 */
import { LlmError } from '@deepseek-ai/dsh-llm'
import { openaiMessages, openaiTools } from '../messages.js'
import { openaiChatStream, httpError, readErrorBody } from '../wire.js'

/**
 * Which blob field carries the credential, and how the header is spelled.
 * `bearer` is the common case; `sourcegraph` uses `token <t>`, which is why the
 * header cannot be hard-coded as `Bearer`.
 */
const AUTH_PREFIX = {
  bearer: 'Bearer',
  token: 'token',
}

/**
 * Build a vendor module from a profile.
 *
 * @param {object} profile
 * @param {string} profile.id
 * @param {string} profile.name            display name for providerInfo
 * @param {string} profile.apiBase         default base URL
 * @param {Array<object>} profile.models   catalog rows ({id, name, contextWindow, maxTokens, inputModalities})
 * @param {string} profile.authorizeUrl    where a user obtains a token
 * @param {string[]} [profile.authFields]  blob fields to try, in order; default ['accessToken','apiKey']
 * @param {'bearer'|'token'} [profile.authStyle]  header prefix; default bearer
 * @param {string} profile.missingAuth     error message when no credential is present
 * @param {boolean} [profile.tools]        forward tool definitions; default true
 * @param {boolean} [profile.generationParams] forward max_tokens/temperature; default true
 * @param {Record<string,string>} [profile.modelAliases] catalog id -> upstream id
 * @param {(id: string) => string} [profile.mapModel] custom id mapping, overrides aliases
 * @param {() => any} [profile.usage]      optional quota reader
 */
export function createChatVendor(profile) {
  const id = String(profile.id)
  const base = String(profile.apiBase || '').replace(/\/+$/, '')
  const models = Array.isArray(profile.models) ? profile.models : []
  const modelIds = models.map((row) => String(/** @type {any} */ (row).id))
  const authStyle = AUTH_PREFIX[profile.authStyle] || AUTH_PREFIX.bearer
  const sendTools = profile.tools !== false
  const sendGeneration = profile.generationParams !== false

  /** Resolve the upstream model id from a catalog id. */
  function mapModel(requested) {
    if (typeof profile.mapModel === 'function') return profile.mapModel(String(requested || ''))
    const wanted = String(requested || '').trim()
    if (!wanted) return modelIds[0] || ''
    const alias = profile.modelAliases && profile.modelAliases[wanted]
    return alias || wanted
  }

  /** Read the credential out of the blob without inventing one. */
  function credential(blob) {
    if (!blob) return ''
    // An explicit `authField` list keeps each vendor reading exactly the keys it
    // read before the refactor: `replit`/`cody` accept `token`, `spark`/`qwen`
    // accept `apiKey`. Unifying them silently dropped two working paths.
    const fields = Array.isArray(profile.authFields) && profile.authFields.length
      ? profile.authFields
      : ['accessToken', 'apiKey']
    for (const field of fields) {
      const value = blob[field]
      if (value) return String(value)
    }
    return ''
  }

  return {
    id,

    providerInfo() {
      return { id, name: String(profile.name || id) }
    },

    defaults() {
      return { apiBase: base, models: modelIds.slice() }
    },

    authorizeUrl() {
      return String(profile.authorizeUrl || '')
    },

    async listModels() {
      return models.slice()
    },

    async usage(blob, config, fetchImpl) {
      const reader = /** @type {any} */ (profile).usage
      if (typeof reader === 'function') return reader({ blob, config, fetchImpl, id })
      return null
    },

    /**
     * A single streaming turn. The shape is fixed by the registry: it must yield
     * the canonical chunks `openaiChatStream` already produces, so a protocol
     * change lands in one place for every vendor in the family.
     */
    async *streamOnce({ blob, options, fetchImpl, headers, config, signal }) {
      const impl = fetchImpl || fetch
      const token = credential(blob)
      if (!token) throw new LlmError(String(profile.missingAuth || 'not authenticated'), 'AUTH')

      const apiBase = String((config && config.apiBase) || base).replace(/\/+$/, '')
      const model = mapModel(options && options.model)

      /** @type {Record<string, any>} */
      const body = { model, messages: openaiMessages(options), stream: true }
      if (sendGeneration) {
        if (options && options.maxTokens != null) body.max_tokens = options.maxTokens
        if (options && options.temperature != null) body.temperature = options.temperature
      }
      if (sendTools) {
        const tools = openaiTools(options)
        if (tools && tools.length) body.tools = tools
      }

      const res = await impl(`${apiBase}/chat/completions`, {
        method: 'POST',
        headers: {
          ...headers,
          Authorization: `${authStyle} ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal,
      })

      if (!res.ok) throw httpError(res.status, await readErrorBody(res))
      yield* openaiChatStream(res.body)
    },
  }
}
