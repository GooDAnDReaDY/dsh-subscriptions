import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const TOOL_OUTPUT = {
  schema: {
    type: 'object',
    additionalProperties: true,
    properties: { text: { type: 'string' } },
    required: ['text'],
  },
  render(_args, value) {
    return [{ type: 'text', text: String((value && value.text) || '') }]
  },
}

function textResult(text) {
  return { text: String(text) }
}

export function extractResponseText(payload) {
  const body = payload && typeof payload === 'object' ? payload : {}
  if (typeof body.output_text === 'string' && body.output_text) return body.output_text
  if (typeof body.answer === 'string' && body.answer) return body.answer
  if (Array.isArray(body.output)) {
    const parts = []
    for (const item of body.output) {
      for (const content of (item && item.content) || []) {
        if (content && typeof content.text === 'string') parts.push(content.text)
      }
    }
    if (parts.length) return parts.join('\n')
  }
  if (Array.isArray(body.choices)) {
    return body.choices.map((choice) => choice && choice.message && choice.message.content)
      .filter((value) => typeof value === 'string').join('\n')
  }
  return JSON.stringify(body).slice(0, 4000)
}

function outputDir(exec) {
  const cwd = (exec && exec.agent && exec.agent.session && exec.agent.session.header
    && exec.agent.session.header.cwd) || process.cwd()
  return path.join(cwd, 'generated', 'subscriptions')
}

async function saveImages(images, exec) {
  const dir = outputDir(exec)
  await mkdir(dir, { recursive: true })
  const out = []
  for (let i = 0; i < images.length; i += 1) {
    const image = images[i]
    if (!image || typeof image.b64_json !== 'string') continue
    const file = path.join(dir, `image-${Date.now()}-${i}.png`)
    await writeFile(file, Buffer.from(image.b64_json, 'base64'))
    out.push(file)
  }
  return out
}

export function registerSubscriptionTools(ctx, deps) {
  const tools = ctx && ctx.tools
  if (!tools || typeof tools.register !== 'function') return () => {}
  const disposers = []
  const register = (definition) => {
    try {
      const off = tools.register(definition)
      if (typeof off === 'function') disposers.push(off)
    } catch (err) {
      // Another plugin may already own this tool name (for example x_search
      // from a Grok search plugin or image_generate from an image plugin).
      // Keep our remaining tools registered instead of failing the whole plugin.
      if (!/already registered/i.test(String(err && err.message || err))) throw err
    }
  }

  register({
    name: 'image_generate',
    description: 'Generate an image with the active ChatGPT/Codex or Grok subscription. Returns saved file paths.',
    output: TOOL_OUTPUT,
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Image prompt' },
        provider: { type: 'string', enum: ['gpt', 'codex', 'grok'], description: 'Preferred provider' },
        size: { type: 'string', description: 'Image size, e.g. 1024x1024' },
        quality: { type: 'string', description: 'low, medium or high' },
      },
      required: ['prompt'],
    },
    async execute(args, exec) {
      const images = deps.images && deps.images()
      if (!images || typeof images.generate !== 'function') throw new Error('subscription image service is unavailable')
      const preferred = String((args && args.provider) || 'gpt').toLowerCase()
      const order = preferred === 'grok' ? ['grok', 'codex'] : ['codex', 'grok']
      let lastError = null
      for (const provider of order) {
        try {
          const rows = await images.generate({
            provider,
            prompt: args && args.prompt,
            size: args && args.size,
            quality: args && args.quality,
            signal: exec && exec.signal,
          })
          const files = await saveImages(rows, exec)
          if (!files.length) throw new Error('image response contained no images')
          return textResult(files.map((file) => `Generated image: ${file}`).join('\n'))
        } catch (err) {
          lastError = err
        }
      }
      throw lastError || new Error('no subscription image provider is available')
    },
  })

  register({
    name: 'x_search',
    description: 'Search X posts through the active Grok subscription and return an answer with citations.',
    output: TOOL_OUTPUT,
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        model: { type: 'string', description: 'Optional Grok model id' },
      },
      required: ['query'],
    },
    async execute(args, exec) {
      const res = await deps.subscriptions.request({
        provider: 'grok',
        path: '/v1/responses',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: {
          model: (args && args.model) || 'grok-4.6',
          input: args && args.query,
          tools: [{ type: 'x_search' }],
          stream: false,
        },
        signal: exec && exec.signal,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(`x_search HTTP ${res.status}: ${extractResponseText(data)}`)
      return textResult(extractResponseText(data))
    },
  })

  register({
    name: 'web_search',
    description: 'Search the web through the active ChatGPT/Codex subscription and return an answer with citations.',
    output: TOOL_OUTPUT,
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        model: { type: 'string', description: 'Optional Codex model id' },
      },
      required: ['query'],
    },
    async execute(args, exec) {
      const res = await deps.subscriptions.request({
        provider: 'codex',
        path: '/responses',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: {
          model: (args && args.model) || 'gpt-5.6',
          input: args && args.query,
          tools: [{ type: 'web_search_preview' }],
          stream: false,
        },
        signal: exec && exec.signal,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(`web_search HTTP ${res.status}: ${extractResponseText(data)}`)
      return textResult(extractResponseText(data))
    },
  })

  register({
    name: 'video_generate',
    description: 'Submit a short video generation request through the active Grok subscription.',
    output: TOOL_OUTPUT,
    parameters: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Video prompt' },
        duration: { type: 'number', description: 'Duration in seconds (1-15)' },
        aspect_ratio: { type: 'string', description: 'e.g. 16:9, 1:1, 9:16' },
        image_url: { type: 'string', description: 'Optional source image URL' },
      },
      required: ['prompt'],
    },
    async execute(args, exec) {
      const res = await deps.subscriptions.request({
        provider: 'grok',
        path: '/v1/videos',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: {
          model: 'grok-imagine-video-1.5',
          prompt: args && args.prompt,
          duration: args && args.duration,
          aspect_ratio: args && args.aspect_ratio,
          image_url: args && args.image_url,
        },
        signal: exec && exec.signal,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(`video_generate HTTP ${res.status}: ${extractResponseText(data)}`)
      return textResult(`Video request submitted: ${JSON.stringify(data).slice(0, 1000)}`)
    },
  })

  return () => {
    for (const off of disposers) {
      try { off() } catch { /* best-effort cleanup */ }
    }
  }
}
