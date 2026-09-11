import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openaiMessages, openaiTools, modelCatalog } from '../lib/messages.js'
import { httpError, tokenBlobFromOAuth, readJson, openaiChatStream, formTokenRequest, jsonTokenRequest } from '../lib/wire.js'

// #288 follow-up: request-body builders and the SSE/wire helpers.

const text = (s) => [{ type: 'text', text: s }]

test('openaiMessages prefixes an explicit system prompt', () => {
  const out = openaiMessages({ system: 'be brief', messages: [] })
  assert.deepEqual(out, [{ role: 'system', content: 'be brief' }])
})

test('openaiMessages keeps system-role messages and flattens blocks', () => {
  const out = openaiMessages({
    messages: [
      { role: 'system', content: text('rules') },
      { role: 'user', content: text('hi') },
      { role: 'assistant', content: [{ type: 'reasoning', text: 'think' }, ...text('answer')] },
    ],
  })
  assert.deepEqual(out[0], { role: 'system', content: 'rules' })
  assert.deepEqual(out[1], { role: 'user', content: 'hi' })
  assert.equal(out[2].content, 'thinkanswer')
})

test('openaiMessages maps tool calls and keeps a null content', () => {
  const out = openaiMessages({
    messages: [{
      role: 'assistant',
      content: [{ type: 'tool-call', id: 'call_1', name: 'search', arguments: '{"q":"x"}' }],
    }],
  })
  assert.equal(out[0].content, null)
  assert.deepEqual(out[0].tool_calls[0], {
    id: 'call_1', type: 'function', function: { name: 'search', arguments: '{"q":"x"}' },
  })
})

test('openaiMessages defaults missing tool arguments to an empty object', () => {
  const out = openaiMessages({
    messages: [{ role: 'assistant', content: [{ type: 'tool-call', id: 'c', name: 'n' }] }],
  })
  assert.equal(out[0].tool_calls[0].function.arguments, '{}')
})

test('openaiMessages turns tool results into tool messages', () => {
  const out = openaiMessages({
    messages: [{
      role: 'user',
      content: [
        { type: 'tool-result', toolCallId: 'call_1', content: text('42') },
        { type: 'tool-result', toolCallId: 'call_2', content: [] },
      ],
    }],
  })
  assert.equal(out[0].role, 'tool')
  assert.equal(out[0].tool_call_id, 'call_1')
  assert.equal(out[0].content, '42')
  assert.equal(out[1].content, '(no output)')
})

test('openaiMessages keeps an empty user turn when there are no tool results', () => {
  const out = openaiMessages({ messages: [{ role: 'user', content: [] }] })
  assert.deepEqual(out, [{ role: 'user', content: '' }])
})

test('openaiTools returns undefined without tools and maps definitions', () => {
  assert.equal(openaiTools({}), undefined)
  assert.equal(openaiTools({ tools: [] }), undefined)
  const mapped = openaiTools({ tools: [{ name: 't', description: 'd' }] })
  assert.equal(mapped[0].type, 'function')
  assert.equal(mapped[0].function.name, 't')
  assert.deepEqual(mapped[0].function.parameters, { type: 'object' })
})

test('modelCatalog normalizes string and object entries and drops junk', () => {
  const cat = modelCatalog('codex', [
    'gpt-x',
    null,
    { slug: 's-1', display_name: 'S One', contextWindow: 1000, reasoning: true },
    { id: 'plain' },
    { name: 'by-name' },
    { description: 'no id' },
  ])
  assert.equal(cat.length, 4)
  assert.deepEqual(cat[0], { provider: 'codex', id: 'gpt-x', name: 'gpt-x' })
  assert.equal(cat[1].id, 's-1')
  assert.equal(cat[1].name, 'S One')
  assert.equal(cat[1].contextWindow, 1000)
  assert.equal(cat[1].reasoning, true)
  assert.equal(cat[2].id, 'plain')
  assert.equal(cat[3].id, 'by-name')
})

test('httpError derives codes from status and body hints', () => {
  assert.equal(httpError(429, '').code, 'RATE_LIMIT')
  assert.equal(httpError(402, '').code, 'QUOTA')
  assert.equal(httpError(401, '').code, 'VENDOR')
  assert.equal(httpError(403, '').code, 'VENDOR')
  assert.equal(httpError(400, 'you hit a quota').code, 'QUOTA')
  assert.equal(httpError(500, 'rate limit exceeded').code, 'RATE_LIMIT')
  assert.equal(httpError(500, 'boom').code, 'VENDOR')
})

test('httpError honors an explicit code and truncates the snippet', () => {
  const e = httpError(400, 'x'.repeat(500), 'CUSTOM')
  assert.equal(e.code, 'CUSTOM')
  assert.equal(e.status, 400)
  assert.ok(e.message.length < 460)
})

test('tokenBlobFromOAuth maps snake and camel case fields', () => {
  const b = tokenBlobFromOAuth({ access_token: 'a', refresh_token: 'r', id_token: 'i', expires_in: 60 }, { email: 'e' })
  assert.equal(b.accessToken, 'a')
  assert.equal(b.refreshToken, 'r')
  assert.equal(b.idToken, 'i')
  assert.equal(b.email, 'e')
  assert.ok(b.expiresAt > Date.now())
  const camel = tokenBlobFromOAuth({ accessToken: 'A', refreshToken: 'R' })
  assert.equal(camel.accessToken, 'A')
  assert.equal(camel.refreshToken, 'R')
  assert.ok(camel.expiresAt - Date.now() <= 3600 * 1000 + 1000)
})

test('readJson parses ok bodies and tolerates invalid json', async () => {
  const ok = await readJson(new Response('{"a":1}', { status: 200 }))
  assert.deepEqual(ok, { a: 1 })
  const broken = await readJson(new Response('not json', { status: 200 }))
  assert.deepEqual(broken, {})
})

test('readJson throws httpError on a failed response', async () => {
  await assert.rejects(() => readJson(new Response('quota reached', { status: 429 })), (e) => e.code === 'RATE_LIMIT')
})

function sse(lines) {
  const NL = String.fromCharCode(10)
  return lines.map((l) => 'data: ' + l + NL + NL).join('') + 'data: [DONE]' + NL + NL
}

test('openaiChatStream yields text, reasoning, tool deltas, usage and finish', async () => {
  const body = new Response(sse([
    JSON.stringify({ choices: [{ delta: { content: 'hi' } }] }),
    JSON.stringify({ choices: [{ delta: { reasoning_content: 'why' } }] }),
    JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'c1', function: { name: 'fn' } }] } }] }),
    JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"a":' } }] } }] }),
    JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }),
    JSON.stringify({ usage: { prompt_tokens: 5 }, choices: [{}] }),
  ]), { status: 200 }).body
  const kinds = []
  let textChunk = null
  let reasoning = null
  let finish = null
  let usage = null
  for await (const c of openaiChatStream(body)) {
    kinds.push(c.type)
    if (c.type === 'text-delta') textChunk = c.text
    if (c.type === 'reasoning-delta') reasoning = c.text
    if (c.type === 'finish') finish = c.reason.kind
    if (c.type === 'usage') usage = c.usage
  }
  assert.equal(textChunk, 'hi')
  assert.equal(reasoning, 'why')
  assert.equal(usage.prompt_tokens, 5)
  assert.equal(finish, 'tool')
  assert.ok(kinds.includes('block-start'))
  assert.ok(kinds.includes('tool-call-delta'))
})

test('openaiChatStream maps a length finish reason', async () => {
  const body = new Response(sse([
    JSON.stringify({ choices: [{ delta: { content: 'x' }, finish_reason: 'length' }] }),
  ]), { status: 200 }).body
  let finish = null
  for await (const c of openaiChatStream(body)) if (c.type === 'finish') finish = c.reason.kind
  assert.equal(finish, 'length')
})

test('formTokenRequest posts url-encoded params', async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init })
    return new Response(JSON.stringify({ access_token: 'a' }), { status: 200 })
  }
  const json = await formTokenRequest('https://token.invalid', { grant_type: 'x', code: 'c' }, fetchImpl)
  assert.equal(json.access_token, 'a')
  assert.equal(calls[0].init.method, 'POST')
  const ct = String(calls[0].init.headers['Content-Type'] || calls[0].init.headers['content-type'])
  assert.ok(ct.includes('urlencoded'))
  assert.ok(String(calls[0].init.body).includes('grant_type=x'))
})

test('jsonTokenRequest posts a json body', async () => {
  const calls = []
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init })
    return new Response(JSON.stringify({ ok: true }), { status: 200 })
  }
  const json = await jsonTokenRequest('https://token.invalid', { code: 'c' }, fetchImpl)
  assert.equal(json.ok, true)
  assert.equal(calls[0].init.method, 'POST')
  assert.deepEqual(JSON.parse(calls[0].init.body), { code: 'c' })
})
