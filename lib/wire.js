import { iterateSse, jsonSse } from './sse.js'
import { validationFromHttpError, validationRequiredError, googleRateLimitMessage, googleLicenseMessage } from './google-validation.js'

export function httpError(status, bodyText, code) {
  const snippet = String(bodyText || '').slice(0, 400)
  const err = new Error(snippet ? `vendor http ${status}: ${snippet}` : `vendor http ${status}`)
  err.status = status
  if (code) {
    err.code = code
    return err
  }
  if (status === 429) err.code = 'RATE_LIMIT'
  else if (status === 402) err.code = 'QUOTA'
  else if (status === 401 || status === 403) err.code = 'VENDOR'
  else if (/quota|rate.?limit|usage.?limit|billing/i.test(snippet)) {
    err.code = status === 400 ? 'QUOTA' : 'RATE_LIMIT'
  } else err.code = 'VENDOR'
  return err
}

export function throwHttpError(status, bodyText) {
  const validation = validationFromHttpError(status, bodyText)
  if (validation) throw validationRequiredError(validation)
  const license = googleLicenseMessage(status, bodyText)
  if (license) {
    const err = httpError(status, bodyText, 'LICENSE_REQUIRED')
    err.message = `${license} (${err.message})`
    throw err
  }
  const hint = googleRateLimitMessage(status, bodyText)
  if (hint) {
    const err = httpError(status, bodyText, status === 429 ? 'RATE_LIMIT' : undefined)
    err.message = `${hint} (${err.message})`
    throw err
  }
  throw httpError(status, bodyText)
}

export async function readJson(res) {
  const text = await res.text()
  if (!res.ok) {
    const validation = validationFromHttpError(res.status, text)
    if (validation) throw validationRequiredError(validation)
    throw httpError(res.status, text)
  }
  try { return JSON.parse(text) } catch { return {} }
}

export function tokenBlobFromOAuth(json, extra) {
  const expiresIn = Number(json.expires_in) || 3600
  return {
    accessToken: json.access_token || json.accessToken || '',
    refreshToken: json.refresh_token || json.refreshToken || '',
    expiresAt: Date.now() + expiresIn * 1000,
    idToken: json.id_token || json.idToken || '',
    ...(extra || {}),
  }
}

function openBlock(kind, index) {
  return { kind, index, text: '', id: '', name: '' }
}

export async function* openaiChatStream(body) {
  let next = 0
  let textBlock = null
  const tools = new Map()
  let finish = { kind: 'stop' }
  for await (const data of iterateSse(body)) {
    const json = jsonSse(data)
    if (!json) continue
    const choice = (json.choices && json.choices[0]) || {}
    const delta = choice.delta || json.delta || {}
    if (typeof delta.content === 'string' && delta.content) {
      if (!textBlock) {
        textBlock = openBlock('text', next++)
        yield { type: 'block-start', index: textBlock.index, blockType: 'text' }
      }
      yield { type: 'text-delta', index: textBlock.index, text: delta.content }
    }
    if (typeof delta.reasoning_content === 'string' && delta.reasoning_content) {
      yield { type: 'reasoning-delta', index: 0, text: delta.reasoning_content }
    }
    for (const call of delta.tool_calls || []) {
      let block = tools.get(call.index)
      if (!block) {
        block = openBlock('tool-call', next++)
        tools.set(call.index, block)
        yield { type: 'block-start', index: block.index, blockType: 'tool-call' }
      }
      if (call.id) block.id = call.id
      if (call.function && call.function.name) block.name = call.function.name
      const fragment = (call.function && call.function.arguments) || ''
      yield {
        type: 'tool-call-delta',
        index: block.index,
        id: block.id,
        ...(block.name ? { name: block.name } : {}),
        argumentsDelta: fragment,
      }
    }
    if (json.usage) yield { type: 'usage', usage: json.usage }
    if (choice.finish_reason === 'length') finish = { kind: 'length' }
    else if (choice.finish_reason === 'tool_calls') finish = { kind: 'tool' }
  }
  yield { type: 'finish', reason: finish }
}

export { streamResponses as codexResponsesStream } from './responses-stream.js'

export async function* anthropicStream(body) {
  let index = 0
  let textIndex = 0
  for await (const data of iterateSse(body)) {
    const json = jsonSse(data)
    if (!json) continue
    if (json.type === 'content_block_start') {
      const block = json.content_block || {}
      if (block.type === 'text') {
        textIndex = json.index || index++
        yield { type: 'block-start', index: textIndex, blockType: 'text' }
      } else if (block.type === 'tool_use') {
        yield { type: 'block-start', index: json.index || index++, blockType: 'tool-call' }
        yield {
          type: 'tool-call-delta',
          index: json.index || 0,
          id: block.id,
          name: block.name,
          argumentsDelta: '',
        }
      }
    } else if (json.type === 'content_block_delta') {
      const delta = json.delta || {}
      if (delta.type === 'text_delta' && delta.text) {
        yield { type: 'text-delta', index: json.index || textIndex, text: delta.text }
      } else if (delta.type === 'input_json_delta' && delta.partial_json) {
        yield {
          type: 'tool-call-delta',
          index: json.index || 0,
          argumentsDelta: delta.partial_json,
        }
      }
    } else if (json.type === 'message_delta' && json.usage) {
      yield { type: 'usage', usage: json.usage }
    }
  }
  yield { type: 'finish', reason: { kind: 'stop' } }
}

export async function* googleStream(body) {
  let index = 0
  let started = false
  for await (const data of iterateSse(body)) {
    const json = jsonSse(data)
    const wrapped = json && json.response ? json.response : json
    if (!wrapped) continue
    const cand = wrapped.candidates && wrapped.candidates[0]
    const parts = cand && cand.content && Array.isArray(cand.content.parts) ? cand.content.parts : []
    for (const part of parts) {
      if (part.text) {
        if (!started) {
          yield { type: 'block-start', index, blockType: 'text' }
          started = true
        }
        yield { type: 'text-delta', index, text: part.text }
      }
      if (part.functionCall) {
        yield { type: 'block-start', index: index + 1, blockType: 'tool-call' }
        yield {
          type: 'tool-call-delta',
          index: index + 1,
          name: part.functionCall.name,
          argumentsDelta: JSON.stringify(part.functionCall.args || {}),
        }
      }
    }
    if (wrapped.usageMetadata) {
      yield {
        type: 'usage',
        usage: {
          input: wrapped.usageMetadata.promptTokenCount,
          output: wrapped.usageMetadata.candidatesTokenCount,
        },
      }
    }
  }
  yield { type: 'finish', reason: { kind: 'stop' } }
}

export async function formTokenRequest(url, params, fetchImpl, headers, { timeoutMs = 25000 } = {}) {
  const impl = fetchImpl || fetch
  const timeoutSignal = AbortSignal.timeout(timeoutMs)
  const res = await impl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', ...(headers || {}) },
    body: new URLSearchParams(params),
    signal: timeoutSignal,
  })
  return readJson(res)
}

export async function jsonTokenRequest(url, body, fetchImpl, headers) {
  const impl = fetchImpl || fetch
  const res = await impl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...(headers || {}) },
    body: JSON.stringify(body),
  })
  return readJson(res)
}