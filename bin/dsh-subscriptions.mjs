#!/usr/bin/env node
import process from 'node:process'
import { pathToFileURL } from 'node:url'

export function parseArgs(argv) {
  const args = Array.isArray(argv) ? argv.slice() : []
  const command = args.shift() || 'status'
  const options = { command, csv: false, type: 'accounts', sessionId: '', mode: 'fast', help: false }
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--csv') options.csv = true
    else if (arg === '--help' || arg === '-h') options.help = true
    else if (arg === '--type') options.type = args[++i] || 'accounts'
    else if (arg === '--session') options.sessionId = args[++i] || ''
    else if (command === 'fast' && !options.sessionId) options.sessionId = arg
    else if (command === 'fast') options.mode = arg === 'standard' || arg === 'off' ? 'standard' : 'fast'
  }
  return options
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
  throw new Error('unknown command: ' + options.command)
}

export async function run(argv = process.argv.slice(2), env = process.env, fetchImpl = fetch) {
  const options = parseArgs(argv)
  if (options.help) return { help: true }
  const request = buildRequest(options, env)
  const res = await fetchImpl(request.url, request.init)
  const text = await res.text()
  if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + text.slice(0, 500))
  return { text, contentType: res.headers.get('content-type') || '' }
}

async function main() {
  const result = await run()
  if (result.help) {
    process.stdout.write('Usage: dsh-subscriptions <status|usage|fast> [options]\n  usage --csv --type accounts|calls\n  fast <session> [fast|standard]\n')
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
