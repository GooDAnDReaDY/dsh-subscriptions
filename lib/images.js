// Image generation on a subscription.
//
// This module only implements the protocol: where to go, what to send and how to read the response. Everything
// else - saving the file, attaching it to the conversation, the card - is the job of the generation
// plugin; this plugin only lends its account.
//
// The token never leaves the process: the plugin exposes an in-process service, not
// a network route. The harness on this machine is reachable without a password, and an endpoint
// handing out a live subscription token would be a wider hole than the ones we already closed.

import {
  CODE_ASSIST_STREAM,
  antigravityIdentityHeaders,
  assistHeaders,
  streamEnvelope,
} from './code-assist.js'

/** Where the ChatGPT subscription request goes. */
export const CODEX_URL = 'https://chatgpt.com/backend-api/codex/images/generations'
/** The model served by this endpoint. */
export const CODEX_MODEL = 'gpt-image-2'
/** Where the Grok subscription request goes. */
export const GROK_URL = 'https://api.x.ai/v1/images/generations'
/** The model served by this endpoint. */
export const GROK_MODEL = 'grok-imagine-image-2.0'
/**
 * Gemini on Cloud Code Assist returns images as inline base64 parts, not as a
 * JSON `data` array, so it needs its own request shape. The transport is the same
 * `streamGenerateContent` the chat path uses; the difference is
 * `generationConfig.responseModalities`, which asks for an image back.
 */
export const ANTIGRAVITY_IMAGE_MODEL = 'gemini-2.5-flash-image'

/** Sizes understood by ChatGPT. */
export const SIZES = ['1024x1024', '1024x1536', '1536x1024', 'auto']

/** Grok thinks in aspect ratios, not sizes. */
const GROK_ASPECT = {
  '1024x1024': '1:1',
  '1024x1536': '2:3',
  '1536x1024': '3:2',
  auto: 'auto',
}

export function codexBody({ prompt, size, quality, referenceImages = [] }) {
  const text = String(prompt || '').trim()
  if (!text) throw new Error('prompt must be a non-empty string')
  return {
    prompt: text,
    model: CODEX_MODEL,
    ...(size ? { size } : {}),
    ...(quality ? { quality } : {}),
    ...(Array.isArray(referenceImages) && referenceImages.length
      ? { images: referenceImages.map((ref) => ({ image_url: ref })) }
      : {}),
  }
}

export function grokBody({ prompt, size, quality, referenceImages = [] }) {
  const text = String(prompt || '').trim()
  if (!text) throw new Error('prompt must be a non-empty string')
  // Grok has only two quality tiers: high is composed from medium.
  const level = quality === 'low' ? 'low'
    : (quality === 'medium' || quality === 'high') ? 'medium'
      : undefined
  return {
    prompt: text,
    model: GROK_MODEL,
    response_format: 'b64_json',
    ...(size && GROK_ASPECT[size] ? { aspect_ratio: GROK_ASPECT[size] } : {}),
    ...(level ? { quality: level } : {}),
    ...(Array.isArray(referenceImages) && referenceImages.length ? { image_urls: referenceImages } : {}),
  }
}

/**
 * Gemini image request body, in the shape `streamGenerateContent` expects.
 *
 * The prompt is a single user turn and the answer is asked for as an image via
 * `responseModalities`. Reference images ride along as `inlineData` parts of the
 * same turn, which is how Gemini expresses image editing.
 *
 * @param {{prompt: string, size?: string, referenceImages?: string[]}} options
 */
export function antigravityBody({ prompt, size, referenceImages = [] }) {
  const text = String(prompt || '').trim()
  if (!text) throw new Error('prompt must be a non-empty string')

  /** @type {Array<Record<string, any>>} */
  const parts = [{ text }]
  if (Array.isArray(referenceImages)) {
    for (const ref of referenceImages) {
      const parsed = parseDataUri(ref)
      // A plain URL cannot be sent inline; Gemini needs bytes or a fileData uri.
      // Keeping it as text is honest: the model is told about it rather than
      // silently losing the reference.
      if (parsed) parts.push({ inlineData: { mimeType: parsed.mimeType, data: parsed.base64 } })
      else parts.push({ text: 'Reference image: ' + String(ref) })
    }
  }

  return {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
      ...(size ? { imageConfig: { aspectRatio: String(size) } } : {}),
    },
  }
}

/**
 * Read images out of a Gemini reply.
 *
 * `streamGenerateContent` answers with candidate parts; an image arrives as
 * `inlineData` (base64) and occasionally as `fileData` (a URI). Text parts are
 * ignored — the caller wants pictures.
 *
 * @param {any} payload
 * @returns {Array<{b64_json: string, mimeType?: string}>}
 */
export function parseAntigravityImages(payload) {
  const body = payload && typeof payload === 'object' ? payload : {}
  const candidates = Array.isArray(body.candidates) ? body.candidates : []
  const images = []
  for (const candidate of candidates) {
    const parts = candidate && candidate.content && Array.isArray(candidate.content.parts)
      ? candidate.content.parts
      : []
    for (const part of parts) {
      if (!part || typeof part !== 'object') continue
      const inline = part.inlineData || part.inline_data
      if (inline && typeof inline.data === 'string' && inline.data) {
        images.push({
          b64_json: inline.data,
          ...(inline.mimeType || inline.mime_type ? { mimeType: inline.mimeType || inline.mime_type } : {}),
        })
      }
    }
  }
  if (!images.length) {
    // An answer with no image is a refusal or a text answer; say which, because
    // "no images" sends the user looking in the wrong place.
    const text = candidates
      .flatMap((c) => (c && c.content && Array.isArray(c.content.parts) ? c.content.parts : []))
      .map((p) => (p && typeof p.text === 'string' ? p.text : ''))
      .join(' ')
      .trim()
    throw new Error(text
      ? 'response contains no image; the model answered: ' + text.slice(0, 200)
      : 'response contains no images')
  }
  return images
}

/** Response parsing: both sides reply in the same shape. */
export function parseImages(payload) {
  const body = payload && typeof payload === 'object' ? payload : {}
  const rows = Array.isArray(body.data) ? body.data : []
  const images = []
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    if (typeof row.b64_json !== 'string' || !row.b64_json) continue
    images.push({
      b64_json: row.b64_json,
      ...(typeof row.revised_prompt === 'string' && row.revised_prompt
        ? { revisedPrompt: row.revised_prompt }
        : {}),
    })
  }
  if (!images.length) throw new Error('response contains no images')
  return images
}

/**
 * One image turn over Cloud Code Assist.
 *
 * This is the same `streamGenerateContent` call the chat path makes — same
 * envelope, same identity headers — with `responseModalities` asking for an
 * image. The response is a candidate list rather than a `data` array, which is
 * why it is parsed by `parseAntigravityImages` and not `parseImages`.
 *
 * @param {{prompt: string, size?: string, referenceImages?: string[], session: any,
 *          fetchImpl: Function, signal?: AbortSignal, model?: string}} options
 */
async function generateAntigravity(options) {
  const { session, fetchImpl, signal } = options
  const model = options.model || ANTIGRAVITY_IMAGE_MODEL
  const request = antigravityBody(options)

  const { envelope } = streamEnvelope({
    projectId: session.projectId || '',
    model,
    request,
    userAgent: 'antigravity',
    sessionId: session.sessionId,
    paidTierId: session.paidTierId,
  })

  const headers = assistHeaders(session.accessToken, {
    ...antigravityIdentityHeaders(session.projectId || ''),
    Accept: 'text/event-stream',
  })

  const res = await fetchImpl(`${CODE_ASSIST_STREAM}:streamGenerateContent?alt=sse`, {
    method: 'POST',
    headers,
    body: JSON.stringify(envelope),
    signal,
  })

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}))
    const detail = payload && payload.error
      && (payload.error.message || payload.error.code || payload.error)
    throw new Error(`antigravity HTTP ${res.status}${detail ? ': ' + String(detail).slice(0, 200) : ''}`)
  }

  // `alt=sse` still answers with JSON documents, one per event, and an image
  // arrives inside one candidate. Newer builds answer with a single JSON body
  // instead of SSE, so both shapes are accepted.
  const text = await res.text()
  const images = []
  const collect = (payload) => {
    try {
      images.push(...parseAntigravityImages(payload))
    } catch (err) {
      // A text-only event is not an error: keep reading until the image arrives.
      if (!(err && /contains no image/.test(String(err.message)))) throw err
    }
  }

  if (!/^\s*data:/m.test(text)) {
    collect(JSON.parse(text))
  } else {
    for (const line of text.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const body = trimmed.slice(5).trim()
      if (!body || body === '[DONE]') continue
      collect(JSON.parse(body))
    }
  }

  if (!images.length) throw new Error('response contains no images')
  return images
}

/**
 * One request to the right endpoint with this provider's headers.
 *
 * @param options {{provider, prompt, size, quality, session, fetchImpl, signal}}
 *   session - already refreshed token block: accessToken and, for ChatGPT, accountId.
 */
export async function generateOnce(options) {
  const { provider, session, fetchImpl, signal } = options

  // Gemini answers on the chat transport, not an images endpoint: same envelope
  // and headers as the chat path, with `responseModalities` asking for a picture.
  if (provider === 'antigravity') {
    return generateAntigravity(options)
  }

  const isCodex = provider === 'codex'
  const url = isCodex ? CODEX_URL : GROK_URL
  const body = isCodex ? codexBody(options) : grokBody(options)
  const headers = isCodex
    ? {
      authorization: `Bearer ${session.accessToken}`,
      // ChatGPT distinguishes accounts with a separate header; without it the request is rejected.
      'chatgpt-account-id': session.accountId || '',
      originator: 'codex_cli_rs',
      'content-type': 'application/json',
      accept: 'application/json',
    }
    : {
      authorization: `Bearer ${session.accessToken}`,
      'content-type': 'application/json',
      accept: 'application/json',
    }

  const res = await fetchImpl(url, { method: 'POST', headers, body: JSON.stringify(body), signal })
  const payload = await res.json().catch(() => ({}))
  if (!res.ok) {
    const detail = payload && payload.error
      && (payload.error.message || payload.error.code || payload.error)
    throw new Error(`${provider} HTTP ${res.status}${detail ? ': ' + String(detail).slice(0, 200) : ''}`)
  }
  return parseImages(payload)
}

// Multimodal Payload Normalization for Vision Models
export function parseDataUri(uri) {
  if (typeof uri !== 'string') return null
  const m = /^data:([a-zA-Z0-9.+/-]+);base64,(.+)$/.exec(uri.trim())
  if (!m) return null
  return { mimeType: m[1], base64: m[2] }
}

export function normalizeImage(item) {
  if (!item) return null

  // 1. Direct string (data URI or URL)
  if (typeof item === 'string') {
    const dataUri = parseDataUri(item)
    if (dataUri) {
      return { mimeType: dataUri.mimeType, base64: dataUri.base64, url: item.trim() }
    }
    if (/^https?:\/\//i.test(item.trim())) {
      return { mimeType: 'image/jpeg', base64: null, url: item.trim() }
    }
    return null
  }

  if (typeof item !== 'object') return null

  // 2. Anthropic style: { type: 'image', source: { type: 'base64', media_type, data } }
  if (item.source && item.source.type === 'base64' && item.source.data) {
    const mimeType = item.source.media_type || 'image/jpeg'
    const base64 = item.source.data
    return {
      mimeType,
      base64,
      url: `data:${mimeType};base64,${base64}`,
    }
  }

  // 3. Gemini style: { inlineData: { mimeType, data } }
  if (item.inlineData && item.inlineData.data) {
    const mimeType = item.inlineData.mimeType || 'image/jpeg'
    const base64 = item.inlineData.data
    return {
      mimeType,
      base64,
      url: `data:${mimeType};base64,${base64}`,
    }
  }

  // 4. OpenAI style: { type: 'image_url', image_url: { url } } or { type: 'image', image: '...' }
  const rawUrl = (item.image_url && (item.image_url.url || item.image_url)) ||
                 item.image || item.url

  if (typeof rawUrl === 'string') {
    const dataUri = parseDataUri(rawUrl)
    if (dataUri) {
      return { mimeType: dataUri.mimeType, base64: dataUri.base64, url: rawUrl.trim() }
    }
    if (/^https?:\/\//i.test(rawUrl.trim())) {
      return { mimeType: 'image/jpeg', base64: null, url: rawUrl.trim() }
    }
  }

  return null
}

export async function hydrateAttachmentImages(messages, attachments, signal) {
  if (!attachments || typeof attachments.readImageRequest !== 'function' || !Array.isArray(messages)) return messages
  return Promise.all(messages.map(async (message) => {
    if (!message || !Array.isArray(message.content)) return message
    const content = await Promise.all(message.content.map(async (block) => {
      if (!block || block.type !== 'image' || !block.attachment) return block
      try {
        const ref = block.attachment
        const version = await attachments.readImageRequest(ref, {
          width: Number(ref.width) || 1568,
          height: Number(ref.height) || 1568,
          maxBytes: 5 * 1024 * 1024,
        }, signal)
        return {
          type: 'image',
          source: {
            type: 'base64',
            media_type: version.mediaType || ref.mediaType || 'image/jpeg',
            data: Buffer.from(version.data).toString('base64'),
          },
        }
      } catch {
        return {
          type: 'text',
          text: '[image attachment unavailable: ' + String(block.attachment.attachmentId || block.attachment.name || 'unknown') + ']',
        }
      }
    }))
    return { ...message, content }
  }))
}

export function extractImages(content) {
  if (!Array.isArray(content)) {
    const norm = normalizeImage(content)
    return norm ? [norm] : []
  }
  const images = []
  for (const block of content) {
    if (!block) continue
    if (typeof block === 'string') {
      const norm = normalizeImage(block)
      if (norm) images.push(norm)
      continue
    }
    if (block.type === 'image' || block.type === 'image_url' || block.inlineData || block.image_url || block.image) {
      const norm = normalizeImage(block)
      if (norm) images.push(norm)
    }
  }
  return images
}

export function toOpenAiImage(norm) {
  const url = norm.url || (norm.base64 ? `data:${norm.mimeType};base64,${norm.base64}` : null)
  if (!url) return null
  return {
    type: 'image_url',
    image_url: { url },
  }
}

export function toAnthropicImage(norm) {
  if (!norm) return null
  if (norm.base64) {
    return {
      type: 'image',
      source: {
        type: 'base64',
        media_type: norm.mimeType || 'image/jpeg',
        data: norm.base64,
      },
    }
  }
  if (norm.url) {
    return {
      type: 'image',
      source: {
        type: 'url',
        url: norm.url,
      },
    }
  }
  return null
}

export function toGeminiImage(norm) {
  if (!norm) return null
  if (norm.base64) {
    return {
      inlineData: {
        mimeType: norm.mimeType || 'image/jpeg',
        data: norm.base64,
      },
    }
  }
  if (norm.url) {
    return {
      fileData: {
        mimeType: norm.mimeType || 'image/jpeg',
        fileUri: norm.url,
      },
    }
  }
  return null
}

export function toCodexImage(norm) {
  const url = norm.url || (norm.base64 ? `data:${norm.mimeType};base64,${norm.base64}` : null)
  if (!url) return null
  return {
    type: 'input_image',
    image_url: url,
  }
}
