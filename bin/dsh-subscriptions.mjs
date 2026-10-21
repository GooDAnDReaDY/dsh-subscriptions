#!/usr/bin/env node
import process from 'node:process'
import { pathToFileURL } from 'node:url'

export function parseArgs(argv) {
  const args = Array.isArray(argv) ? argv.slice() : []
  const command = args.shift() || 'status'
  const options = { command, csv: false, json: false, type: 'accounts', sessionId: '', mode: 'fast', help: false, setKey: '', setValue: '' }
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--csv') options.csv = true
    else if (arg === '--json') options.json = true
    else if (arg === '--help' || arg === '-h') options.help = true
    else if (arg === '--type') options.type = args[++i] || 'accounts'
    else if (arg === '--session') options.sessionId = args[++i] || ''
    else if (command === 'set' && !options.setKey) options.setKey = arg
    else if (command === 'set') options.setValue = arg
    else if (command === 'fast' && !options.sessionId) options.sessionId = arg
    else if (command === 'fast') options.mode = arg === 'standard' || arg === 'off' ? 'standard' : 'fast'
  }
  return options
}

export function parseConfigValue(raw) {
  if (raw === 'true') return true
  if (raw === 'false') return false
  if (raw === 'null') return null
  if (/^-?\d+(?:\.\d+)?$/.test(raw)) return Number(raw)
  if (raw.startsWith('{') || raw.startsWith('[')) {
    try { return JSON.parse(raw) } catch { throw new Error('value is not valid JSON: ' + raw) }
  }
  return raw
}

export function setNested(target, path, value) {
  const parts = String(path || '').split('.').filter(Boolean)
  if (!parts.length) throw new Error('set requires a dot path, for example rotationStrategy')
  for (const part of parts) {
    if (part === '__proto__' || part === 'constructor' || part === 'prototype') throw new Error('unsafe path: ' + path)
  }
  let cursor = target
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i]
    if (!cursor[key] || typeof cursor[key] !== 'object' || Array.isArray(cursor[key])) cursor[key] = {}
    cursor = cursor[key]
  }
  cursor[parts[parts.length - 1]] = value
  return target
}

export function buildRequest(options, env = process.env) {
  const base = String(env.DSH_SUBS_URL || 'http://127.0.0.1:3080/dsh-subscriptions').replace(/\/$/, '')
  const headers = { Accept: 'application/json' }
  if (env.DSH_AUTH_TOKEN) headers.Authorization = 'Bearer ' + env.DSH_AUTH_TOKEN
  if (options.command === 'status') return { url: base + '/status', init: { method: 'GET', headers } }
  if (options.command === 'usage') {
    const params = new URLSearchParams({ type: options.type || 'accounts', format: options.csv ? 'csv' : 'json' })
    return { url: base + '/usage?' + params.toString(), init: { method: 'GET', headers } }
  }
  if (options.command === 'fast') {
    if (!options.sessionId) throw new Error('fast requires a session id: dsh-subscriptions fast <session> [fast|standard]')
    headers['Content-Type'] = 'application/json'
    return {
      url: base + '/speed',
      init: { method: 'POST', headers, body: JSON.stringify({ sessionId: options.sessionId, mode: options.mode || 'fast' }) },
    }
  }
  if (options.command === 'config') return { url: base + '/config', init: { method: 'GET', headers } }
  if (options.command === 'sources') return { url: base + '/sources', init: { method: 'GET', headers } }
  throw new Error('unknown command: ' + options.command)
}

export function formatSources(payload) {
  const lines = []
  const kr = payload && payload.keyRotation
  lines.push('key-rotation: ' + (kr && kr.available ? (kr.healthyKeys + '/' + kr.totalKeys + ' healthy keys') : ('unavailable' + (kr && kr.reason ? ' (' + kr.reason + ')' : ''))))
  for (const row of ((payload && payload.providers) || [])) {
    const availability = (row.candidates || []).map((c) => c.source + '=' + (c.available ? 'yes' : 'no')).join(' ')
    lines.push(row.provider + ': selected=' + (row.selected || 'none') + (availability ? ' ' + availability : ''))
  }
  return lines.join('\n')
}

export function buildSetRequest(options, configPayload, env = process.env) {
  const base = String(env.DSH_SUBS_URL || 'http://127.0.0.1:3080/dsh-subscriptions').replace(/\/$/, '')
  const headers = { Accept: 'application/json', 'Content-Type': 'application/json' }
  if (env.DSH_AUTH_TOKEN) headers.Authorization = 'Bearer ' + env.DSH_AUTH_TOKEN
  const config = configPayload && configPayload.config && typeof configPayload.config === 'object'
    ? JSON.parse(JSON.stringify(configPayload.config))
    : {}
  setNested(config, options.setKey, parseConfigValue(options.setValue))
  return {
    url: base + '/config',
    init: { method: 'PUT', headers, body: JSON.stringify({ config, revision: configPayload && configPayload.revision }) },
  }
}

export async function run(argv = process.argv.slice(2), env = process.env, fetchImpl = fetch) {
  const options = parseArgs(argv)
  if (options.help) return { help: true }
  let request = buildRequest(options.command === 'set' ? { ...options, command: 'config' } : options, env)
  if (options.command === 'set') {
    const current = await fetchImpl(request.url, request.init)
    const text = await current.text()
    if (!current.ok) throw new Error('HTTP ' + current.status + ': ' + text.slice(0, 500))
    request = buildSetRequest(options, JSON.parse(text || '{}'), env)
  }
  const res = await fetchImpl(request.url, request.init)
  const text = await res.text()
  if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + text.slice(0, 500))
  if (options.command === 'sources' && !options.json) {
    try { return { text: formatSources(JSON.parse(text || '{}')), contentType: 'text/plain' } } catch { /* fall back to raw */ }
  }
  return { text, contentType: res.headers.get('content-type') || '' }
}

async function main() {
  const result = await run()
  if (result.help) {
    process.stdout.write('Usage: dsh-subscriptions <status|usage|fast|config|set|sources> [options]\n  usage --csv --type accounts|calls\n  fast <session> [fast|standard]\n  config\n  set <dot.path> <value>\n  sources [--json]\n')
    return
  }
  process.stdout.write(result.text.endsWith('\n') ? result.text : result.text + '\n')
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    process.stderr.write(String(err && err.message || err) + '\n')
    process.exitCode = 1
  })
}
