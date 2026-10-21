#!/usr/bin/env node
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { readFile } from 'node:fs/promises'

export function parseArgs(argv) {
  const args = Array.isArray(argv) ? argv.slice() : []
  const command = args.shift() || 'status'
  const options = { command, csv: false, json: false, once: false, type: 'accounts', sessionId: '', mode: 'fast', help: false, setKey: '', setValue: '', packAction: '', packFile: '', vaultAction: '', vaultArg: '' }
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i]
    if (arg === '--csv') options.csv = true
    else if (arg === '--json') options.json = true
    else if (arg === '--once') options.once = true
    else if (arg === '--help' || arg === '-h') options.help = true
    else if (arg === '--type') options.type = args[++i] || 'accounts'
    else if (arg === '--session') options.sessionId = args[++i] || ''
    else if (command === 'set' && !options.setKey) options.setKey = arg
    else if (command === 'set') options.setValue = arg
    else if (command === 'packs' && arg === 'add') options.packAction = 'add'
    else if (command === 'packs' && options.packAction === 'add' && !options.packFile) options.packFile = arg
    else if (command === 'vault' && !options.vaultAction) options.vaultAction = arg
    else if (command === 'vault' && !options.vaultArg) options.vaultArg = arg
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
  if (options.command === 'packs') return { url: base + '/config', init: { method: 'GET', headers } }
  if (options.command === 'diagnostics') return { url: base + '/diagnostics', init: { method: 'GET', headers } }
  if (options.command === 'vault') {
    if (options.vaultAction === 'restore') {
      return { url: base + '/vault/snapshots/restore', init: { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: options.vaultArg }) } }
    }
    if (options.vaultAction === 'snapshot') {
      return { url: base + '/vault/snapshots', init: { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ label: options.vaultArg || 'manual' }) } }
    }
    return { url: base + '/vault/snapshots', init: { method: 'GET', headers } }
  }
  throw new Error('unknown command: ' + options.command)
}

export function doctorFailed(payload) {
  const diag = (payload && payload.diagnostics) || {}
  const report = diag.report || {}
  const errors = Array.isArray(report.recentErrors) ? report.recentErrors.length : 0
  const conflicts = Array.isArray(diag.conflicts) ? diag.conflicts.length : 0
  return errors > 0 || conflicts > 0
}

export function formatDoctor(payload) {
  const diag = (payload && payload.diagnostics) || {}
  const report = diag.report || {}
  const sources = (payload && payload.sources) || {}
  const errors = Array.isArray(report.recentErrors) ? report.recentErrors.length : 0
  const conflicts = Array.isArray(diag.conflicts) ? diag.conflicts.length : 0
  const kr = sources.keyRotation || {}
  const lines = []
  lines.push('doctor: ' + (doctorFailed(payload) ? 'degraded' : 'ok'))
  lines.push('errors: ' + errors + ' conflicts: ' + conflicts)
  lines.push('key-rotation: ' + (kr.available ? (kr.healthyKeys + '/' + kr.totalKeys + ' healthy keys') : ('unavailable' + (kr.reason ? ' (' + kr.reason + ')' : ''))))
  const snapshots = diag.vaultSnapshots || {}
  lines.push('snapshots: ' + (snapshots.count || 0) + ' (' + (snapshots.bytes || 0) + ' bytes)')
  for (const row of (sources.providers || [])) lines.push(row.provider + ': ' + (row.selected || 'none'))
  return lines.join('\n')
}

export function sanitizePack(pack) {
  if (!pack || typeof pack !== 'object') return pack
  const copy = JSON.parse(JSON.stringify(pack))
  if (copy.clientSecret) copy.clientSecret = '••••••'
  if (copy.headers && typeof copy.headers === 'object') {
    copy.headers = Object.fromEntries(Object.keys(copy.headers).map((key) => [key, '••••••']))
  }
  return copy
}

export function formatPacks(packs) {
  return JSON.stringify((Array.isArray(packs) ? packs : []).map(sanitizePack), null, 2) + '\\n'
}

export function renderTui(data, { color = false } = {}) {
  const health = (data && data.health) || {}
  const checks = health.checks || {}
  const sources = (data && data.sources) || {}
  const snapshots = (data && data.snapshots && data.snapshots.stats) || {}
  const accounts = Array.isArray(data && data.accounts) ? data.accounts : []
  const dim = (text) => color ? '\x1b[2m' + text + '\x1b[0m' : text
  const green = (text) => color ? '\x1b[32m' + text + '\x1b[0m' : text
  const red = (text) => color ? '\x1b[31m' + text + '\x1b[0m' : text
  const lines = []
  lines.push('DSH Subscriptions' + (health.version ? ' ' + health.version : '') + '  ' + (health.status === 'healthy' ? green('healthy') : red(health.status || 'unknown')))
  lines.push(dim('accounts: ' + (checks.connectedAccounts || 0) + ' configured · key-rotation: ' + (checks.keyRotation ? 'yes' : 'no') + ' · ollama: ' + (checks.ollama ? 'yes' : 'no') + ' · webhook: ' + (checks.webhook ? 'yes' : 'no')))
  lines.push('')
  lines.push('ACCOUNTS')
  for (const account of accounts) {
    if (!account || !account.provider) continue
    const usage = account.usagePercent == null ? '-' : Math.round(account.usagePercent) + '%'
    lines.push('  ' + String(account.provider).padEnd(14) + '#' + (account.index || 1) + '  ' + (account.configured ? green('ok') : dim('off')) + '  ' + usage)
  }
  lines.push('')
  lines.push('SOURCES')
  for (const row of (sources.providers || [])) lines.push('  ' + String(row.provider).padEnd(14) + (row.selected || dim('none')))
  lines.push('')
  lines.push('VAULT')
  lines.push('  snapshots: ' + (snapshots.count || 0) + ' · ' + (snapshots.bytes || 0) + ' bytes')
  lines.push('')
  lines.push(dim('r refresh · q quit'))
  return lines.join('\n')
}

export function formatSnapshotStatus(payload) {
  const stats = (payload && payload.stats) || {}
  return 'snapshots: ' + (stats.count || 0) + '  bytes: ' + (stats.bytes || 0) + '  path: ' + (stats.path || '-')
}

export function formatSnapshots(payload) {
  const rows = (payload && payload.snapshots) || []
  if (!rows.length) return 'no vault snapshots'
  return rows.map((s) => s.id + '  ' + s.createdAt + '  ' + (s.label || '-') + '  ' + s.slotCount + ' slots').join('\n')
}

export function mergeProviderPack(packs, pack) {
  const list = (Array.isArray(packs) ? packs : []).filter((p) => p && p.id !== pack.id)
  return [...list, pack]
}

export function buildValidatePackRequest(pack, env = process.env) {
  const base = String(env.DSH_SUBS_URL || 'http://127.0.0.1:3080/dsh-subscriptions').replace(/\/$/, '')
  const headers = { Accept: 'application/json', 'Content-Type': 'application/json' }
  if (env.DSH_AUTH_TOKEN) headers.Authorization = 'Bearer ' + env.DSH_AUTH_TOKEN
  return { url: base + '/provider-packs/validate', init: { method: 'POST', headers, body: JSON.stringify({ pack }) } }
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
  if (options.command === 'tui') {
    const base = String(env.DSH_SUBS_URL || 'http://127.0.0.1:3080/dsh-subscriptions').replace(/\/$/, '')
    const headers = { Accept: 'application/json' }
    if (env.DSH_AUTH_TOKEN) headers.Authorization = 'Bearer ' + env.DSH_AUTH_TOKEN
    const get = (path) => fetchImpl(base + path, { method: 'GET', headers }).then(async (res) => {
      const text = await res.text()
      if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + text.slice(0, 300))
      return JSON.parse(text || '{}')
    })
    const [health, sources, snapshots, config] = await Promise.all([
      get('/health'), get('/sources'), get('/vault/snapshots'), get('/config'),
    ])
    const data = { health, sources, snapshots, accounts: (config && config.accounts) || [] }
    return { text: renderTui(data, { color: false }), tuiData: data, contentType: 'text/plain' }
  }
  if (options.command === 'doctor') {
    const diagReq = buildRequest({ command: 'diagnostics' }, env)
    const srcReq = buildRequest({ command: 'sources' }, env)
    const [diagRes, srcRes] = await Promise.all([fetchImpl(diagReq.url, diagReq.init), fetchImpl(srcReq.url, srcReq.init)])
    const diagText = await diagRes.text()
    const srcText = await srcRes.text()
    if (!diagRes.ok) throw new Error('HTTP ' + diagRes.status + ': ' + diagText.slice(0, 500))
    if (!srcRes.ok) throw new Error('HTTP ' + srcRes.status + ': ' + srcText.slice(0, 500))
    const payload = { diagnostics: JSON.parse(diagText || '{}'), sources: JSON.parse(srcText || '{}') }
    return {
      text: options.json ? JSON.stringify(payload, null, 2) + '\n' : formatDoctor(payload),
      contentType: options.json ? 'application/json' : 'text/plain',
      code: doctorFailed(payload) ? 1 : 0,
    }
  }
  if (options.command === 'packs' && options.packAction === 'add') {
    if (!options.packFile) throw new Error('packs add requires a JSON file')
    const pack = JSON.parse(await readFile(options.packFile, 'utf8'))
    const validate = buildValidatePackRequest(pack.pack || pack, env)
    const checked = await fetchImpl(validate.url, validate.init)
    const checkedText = await checked.text()
    if (!checked.ok) throw new Error('invalid pack: ' + checkedText.slice(0, 500))
    const current = await fetchImpl(buildRequest({ command: 'config' }, env).url, buildRequest({ command: 'config' }, env).init)
    const currentText = await current.text()
    if (!current.ok) throw new Error('HTTP ' + current.status + ': ' + currentText.slice(0, 500))
    const payload = JSON.parse(currentText || '{}')
    const nextConfig = Object.assign({}, payload.config, {
      providerPacks: mergeProviderPack(payload.config && payload.config.providerPacks, pack.pack || pack),
    })
    const put = buildSetRequest({ setKey: 'providerPacks', setValue: JSON.stringify(nextConfig.providerPacks) }, { config: nextConfig, revision: payload.revision }, env)
    const saved = await fetchImpl(put.url, put.init)
    const savedText = await saved.text()
    if (!saved.ok) throw new Error('HTTP ' + saved.status + ': ' + savedText.slice(0, 500))
    return { text: 'saved provider pack ' + ((pack.pack && pack.pack.id) || pack.id || ''), contentType: 'text/plain' }
  }
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
  if (options.command === 'vault' && !options.json) {
    try {
      const payload = JSON.parse(text || '{}')
      if (options.vaultAction === 'status') return { text: formatSnapshotStatus(payload), contentType: 'text/plain' }
      if (options.vaultAction === 'snapshots' || !options.vaultAction) return { text: formatSnapshots(payload), contentType: 'text/plain' }
      if (options.vaultAction === 'snapshot') return { text: 'created ' + (payload.snapshot && payload.snapshot.id), contentType: 'text/plain' }
      if (options.vaultAction === 'restore') return { text: 'restored ' + (payload.slotCount || 0) + ' slots', contentType: 'text/plain' }
    } catch { /* fall back to raw */ }
  }
  if (options.command === 'packs' && options.packAction !== 'add') {
    try {
      const payload = JSON.parse(text || '{}')
      return { text: formatPacks((payload.config && payload.config.providerPacks) || []), contentType: 'application/json' }
    } catch { /* fall back to raw */ }
  }
  if (options.command === 'sources' && !options.json) {
    try { return { text: formatSources(JSON.parse(text || '{}')), contentType: 'text/plain' } } catch { /* fall back to raw */ }
  }
  return { text, contentType: res.headers.get('content-type') || '' }
}

async function runTui(initial) {
  let cleanup = () => {}
  const paint = (data) => process.stdout.write('\x1b[2J\x1b[H' + renderTui(data, { color: true }) + '\n')
  paint(initial)
  const onKey = async (buf) => {
    const key = String(buf)
    if (key === 'q' || key === '\u0003') { cleanup(); process.exit(0) }
    if (key === 'r') {
      try {
        const next = await run(['tui', '--once'])
        if (next.tuiData) paint(next.tuiData)
      } catch (err) { process.stdout.write('\n' + String(err && err.message || err) + '\n') }
    }
  }
  if (process.stdin.isTTY && typeof process.stdin.setRawMode === 'function') {
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.on('data', onKey)
    cleanup = () => {
      process.stdin.removeListener('data', onKey)
      process.stdin.setRawMode(false)
      process.stdin.pause()
    }
  }
}

async function main() {
  const argv = process.argv.slice(2)
  const options = parseArgs(argv)
  const result = await run(argv)
  if (result.help) {
    process.stdout.write('Usage: dsh-subscriptions <status|usage|fast|config|set|sources|packs|vault|tui|doctor> [options]\n  usage --csv --type accounts|calls\n  fast <session> [fast|standard]\n  config\n  set <dot.path> <value>\n  sources [--json]\n  packs\n  packs add <file.json>\n  vault snapshots | vault snapshot [label] | vault restore <id> | vault status\n  tui [--once]\n  doctor [--json]\n')
    return
  }
  if (result.tuiData && !options.once) { await runTui(result.tuiData); return }
  process.stdout.write(result.text.endsWith('\n') ? result.text : result.text + '\n')
  if (result.code) process.exitCode = result.code
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    process.stderr.write(String(err && err.message || err) + '\n')
    process.exitCode = 1
  })
}
