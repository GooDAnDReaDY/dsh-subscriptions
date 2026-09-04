import { LlmError } from '@deepseek-ai/dsh-llm'
import { openaiMessages } from '../messages.js'
import { openaiChatStream, httpError } from '../wire.js'
import { asUsageSnapshot } from '../usage.js'

export const id = 'cody'
export const CODY_API_BASE = 'https://sourcegraph.com/.api'

export const CODY_MODELS = [
  {
    id: 'cody-claude-3.5-sonnet',
    name: 'Claude 3.5 Sonnet (Sourcegraph Cody)',
    contextWindow: 200000,
    maxTokens: 8192,
    inputModalities: ['text']
  }
]

export function providerInfo() {
  return { id, name: 'Sourcegraph Cody' }
}

export function defaults() {
  return {
    apiBase: CODY_API_BASE,
    models: CODY_MODELS.map((m) => m.id)
  }
}

export function authorizeUrl() {
  return 'https://sourcegraph.com/user/settings/tokens'
}

export async function listModels() {
  return CODY_MODELS
}

export async function usage(blob) {
  if (blob && (blob.accessToken || blob.token)) {
    const snap = asUsageSnapshot(15)
    if (snap) snap.plan = 'Cody Pro'
    return snap
  }
  return null
}

export async function* streamOnce({ blob, options, fetchImpl, headers, config, signal }) {
  const impl = fetchImpl || fetch
  const token = blob && (blob.accessToken || blob.token)
  if (!token) throw new LlmError('Sourcegraph Cody not authenticated', 'AUTH')

  const url = `${(config && config.apiBase) || CODY_API_BASE}/chat/completions`
  const body = {
    model: 'claude-3-5-sonnet',
    messages: openaiMessages(options),
    stream: true
  }

  const res = await impl(url, {
    method: 'POST',
    headers: {
      ...headers,
      'Authorization': `token ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body),
    signal
  })

  if (!res.ok) throw httpError(res.status, await res.text())
  yield* openaiChatStream(res.body)
}
