// #557: Headless Auth Helper with SSH Tunnel Command Generator and Terminal QR Code
// Assists users logging in to OAuth providers on remote headless servers (VPS, Docker, MiniPC).

import { escapeHtml } from './http.js'

// --- QR Code Generator (Byte Mode, ECC Level L, Versions 1-10) ---

const EXP = new Uint8Array(512)
const LOG = new Uint8Array(256)
for (let i = 0, x = 1; i < 255; i++) {
  EXP[i] = x
  LOG[x] = i
  x = (x << 1) ^ (x >= 128 ? 0x11d : 0)
}
for (let i = 255; i < 512; i++) {
  EXP[i] = EXP[i - 255]
}

function gfMul(x, y) {
  return (x === 0 || y === 0) ? 0 : EXP[LOG[x] + LOG[y]]
}

function polyMul(p1, p2) {
  const r = new Uint8Array(p1.length + p2.length - 1)
  for (let i = 0; i < p1.length; i++) {
    for (let j = 0; j < p2.length; j++) {
      r[i + j] ^= gfMul(p1[i], p2[j])
    }
  }
  return r
}

function rsGenPoly(deg) {
  let p = new Uint8Array([1])
  for (let i = 0; i < deg; i++) {
    p = polyMul(p, new Uint8Array([1, EXP[i]]))
  }
  return p
}

function rsCompute(data, ecCount) {
  const gen = rsGenPoly(ecCount)
  const out = new Uint8Array(ecCount)
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ out[0]
    for (let j = 0; j < ecCount - 1; j++) {
      out[j] = out[j + 1] ^ gfMul(gen[j + 1], factor)
    }
    out[ecCount - 1] = gfMul(gen[ecCount], factor)
  }
  return out
}

const V_INFO = [
  null,
  { v: 1, total: 26, ec: 7, b: 1, align: [] },
  { v: 2, total: 44, ec: 10, b: 1, align: [6, 18] },
  { v: 3, total: 70, ec: 15, b: 1, align: [6, 22] },
  { v: 4, total: 100, ec: 20, b: 1, align: [6, 26] },
  { v: 5, total: 134, ec: 26, b: 1, align: [6, 30] },
  { v: 6, total: 172, ec: 18, b: 2, align: [6, 34] },
  { v: 7, total: 196, ec: 20, b: 2, align: [6, 22, 38] },
  { v: 8, total: 242, ec: 24, b: 2, align: [6, 24, 42] },
  { v: 9, total: 292, ec: 30, b: 2, align: [6, 26, 46] },
  { v: 10, total: 346, ec: 18, b: 4, align: [6, 28, 50] },
]

export function encodeQrMatrix(text) {
  const str = String(text || '')
  const data = Buffer.from(str, 'utf8')
  let ver = 1
  while (ver <= 10) {
    const info = V_INFO[ver]
    const dataCap = info.total - info.ec * info.b
    const lenBits = ver < 10 ? 8 : 16
    const requiredBits = 4 + lenBits + data.length * 8
    if (requiredBits <= dataCap * 8) break
    ver++
  }
  if (ver > 10) throw new Error('text too long for QR encoder')

  const info = V_INFO[ver]
  const totalDataBytes = info.total - info.ec * info.b
  const bits = []
  function pushBits(val, len) {
    for (let i = len - 1; i >= 0; i--) bits.push((val >> i) & 1)
  }
  pushBits(4, 4)
  pushBits(data.length, ver < 10 ? 8 : 16)
  for (const b of data) pushBits(b, 8)
  const rem = totalDataBytes * 8 - bits.length
  pushBits(0, Math.min(4, rem))
  while (bits.length % 8 !== 0) bits.push(0)
  const padBytes = [0xec, 0x11]
  let pIdx = 0
  while (bits.length < totalDataBytes * 8) {
    pushBits(padBytes[pIdx++ % 2], 8)
  }

  const dataBytes = new Uint8Array(totalDataBytes)
  for (let i = 0; i < totalDataBytes; i++) {
    let byte = 0
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i * 8 + j]
    dataBytes[i] = byte
  }

  const blockSize = Math.floor(totalDataBytes / info.b)
  const ecBlocks = []
  const dataBlocks = []
  for (let b = 0; b < info.b; b++) {
    const start = b * blockSize
    const slice = dataBytes.subarray(start, start + blockSize)
    dataBlocks.push(slice)
    ecBlocks.push(rsCompute(slice, info.ec))
  }

  const finalCodewords = []
  for (let i = 0; i < blockSize; i++) {
    for (let b = 0; b < info.b; b++) finalCodewords.push(dataBlocks[b][i])
  }
  for (let i = 0; i < info.ec; i++) {
    for (let b = 0; b < info.b; b++) finalCodewords.push(ecBlocks[b][i])
  }

  const size = 17 + 4 * ver
  const matrix = Array.from({ length: size }, () => new Int8Array(size).fill(-1))
  const isFunc = Array.from({ length: size }, () => new Uint8Array(size))

  function setFunc(r, c, val) {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      matrix[r][c] = val
      isFunc[r][c] = 1
    }
  }

  function drawFinder(r0, c0) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const nr = r0 + r
        const nc = c0 + c
        if (nr < 0 || nr >= size || nc < 0 || nc >= size) continue
        if (r === -1 || r === 7 || c === -1 || c === 7) {
          setFunc(nr, nc, 0)
        } else if (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)) {
          setFunc(nr, nc, 1)
        } else {
          setFunc(nr, nc, 0)
        }
      }
    }
  }
  drawFinder(0, 0)
  drawFinder(0, size - 7)
  drawFinder(size - 7, 0)

  for (let i = 8; i < size - 8; i++) {
    setFunc(6, i, i % 2 === 0 ? 1 : 0)
    setFunc(i, 6, i % 2 === 0 ? 1 : 0)
  }

  const align = info.align
  for (let i = 0; i < align.length; i++) {
    for (let j = 0; j < align.length; j++) {
      const ar = align[i]
      const ac = align[j]
      if ((ar === 6 && ac === 6) || (ar === 6 && ac === size - 7) || (ar === size - 7 && ac === 6)) continue
      for (let r = -2; r <= 2; r++) {
        for (let c = -2; c <= 2; c++) {
          const val = (Math.max(Math.abs(r), Math.abs(c)) !== 1) ? 1 : 0
          setFunc(ar + r, ac + c, val)
        }
      }
    }
  }

  setFunc(4 * ver + 9, 8, 1)

  for (let i = 0; i < 9; i++) {
    if (!isFunc[8][i]) setFunc(8, i, 0)
    if (!isFunc[i][8]) setFunc(i, 8, 0)
  }
  for (let i = 0; i < 8; i++) {
    if (!isFunc[8][size - 1 - i]) setFunc(8, size - 1 - i, 0)
    if (!isFunc[size - 1 - i][8]) setFunc(size - 1 - i, 8, 0)
  }

  const allBits = []
  for (const cw of finalCodewords) {
    for (let i = 7; i >= 0; i--) allBits.push((cw >> i) & 1)
  }
  const remBits = [0, 0, 7, 7, 7, 7, 7, 0, 0, 0, 0][ver] || 0
  for (let i = 0; i < remBits; i++) allBits.push(0)

  let bitIdx = 0
  let dir = -1
  let c = size - 1
  while (c > 0) {
    if (c === 6) c--
    for (let rStep = 0; rStep < size; rStep++) {
      const r = dir === -1 ? (size - 1 - rStep) : rStep
      for (let dc = 0; dc < 2; dc++) {
        const col = c - dc
        if (!isFunc[r][col]) {
          const bit = bitIdx < allBits.length ? allBits[bitIdx++] : 0
          const mask = ((r + col) % 2 === 0) ? 1 : 0
          matrix[r][col] = bit ^ mask
        }
      }
    }
    dir = -dir
    c -= 2
  }

  const formatBits = 0x77c4
  for (let i = 0; i < 15; i++) {
    const bit = (formatBits >> (14 - i)) & 1
    if (i < 6) matrix[8][i] = bit
    else if (i === 6) matrix[8][7] = bit
    else if (i === 7) matrix[8][8] = bit
    else if (i === 8) matrix[7][8] = bit
    else matrix[14 - i][8] = bit

    if (i < 8) matrix[size - 1 - i][8] = bit
    else matrix[8][size - 15 + i] = bit
  }

  return matrix
}

export function renderAsciiQr(text) {
  const m = encodeQrMatrix(text)
  const size = m.length
  const border = 1
  const lines = []
  for (let r = -border; r < size + border; r += 2) {
    let line = ''
    for (let c = -border; c < size + border; c++) {
      const top = (r >= 0 && r < size && c >= 0 && c < size) ? m[r][c] : 0
      const bot = (r + 1 >= 0 && r + 1 < size && c >= 0 && c < size) ? m[r + 1][c] : 0
      if (top && bot) line += '█'
      else if (top && !bot) line += '▀'
      else if (!top && bot) line += '▄'
      else line += ' '
    }
    lines.push(line)
  }
  return lines.join('\n')
}

export function renderSvgQr(text, { size = 200, border = 2, color = '#000000', bg = '#ffffff' } = {}) {
  const m = encodeQrMatrix(text)
  const n = m.length
  const total = n + border * 2
  let paths = ''
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (m[r][c]) {
        paths += `M${c + border},${r + border}h1v1h-1z `
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${size}" height="${size}" shape-rendering="crispEdges">` +
    `<rect width="${total}" height="${total}" fill="${bg}"/>` +
    `<path d="${paths.trim()}" fill="${color}"/>` +
    `</svg>`
}

export function renderSvgDataUrl(text, options) {
  const svg = renderSvgQr(text, options)
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)
}

// --- SSH Tunnel Command Generator ---

export function generateSshTunnelCommand({ port = 1455, host = '', user = '' } = {}) {
  const cleanPort = Number(port) || 1455
  let cleanHost = String(host || '').trim()
  if (!cleanHost || cleanHost === '127.0.0.1' || cleanHost === 'localhost' || cleanHost === '::1') {
    cleanHost = '<remote-host>'
  }
  // Strip existing port if passed from req.headers.host
  if (cleanHost.includes(':')) {
    cleanHost = cleanHost.split(':')[0]
  }
  const cleanUser = String(user || '').trim() || (process.env.USER || process.env.USERNAME || '<user>')
  return `ssh -N -L ${cleanPort}:127.0.0.1:${cleanPort} ${cleanUser}@${cleanHost}`
}

export function getHeadlessAuthInfo({ provider = '', redirectUri = '', authUrl = '', host = '', user = '' } = {}) {
  let loopbackPort = 1455
  let isLoopback = false
  if (redirectUri) {
    try {
      const u = new URL(redirectUri)
      if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') {
        isLoopback = true
        loopbackPort = Number(u.port) || 1455
      }
    } catch { /* ignore malformed */ }
  } else if (provider === 'grok') {
    loopbackPort = 56121
    isLoopback = true
  } else if (provider === 'codex') {
    loopbackPort = 1455
    isLoopback = true
  }

  const sshTunnelCommand = generateSshTunnelCommand({ port: loopbackPort, host, user })
  let terminalQr = ''
  let svgDataUrl = ''
  if (authUrl) {
    try {
      terminalQr = renderAsciiQr(authUrl)
      svgDataUrl = renderSvgDataUrl(authUrl)
    } catch { /* ignore length limits */ }
  }

  return {
    provider,
    isLoopback,
    loopbackPort,
    sshTunnelCommand,
    authUrl,
    terminalQr,
    svgDataUrl,
  }
}

export function safePostMessageOrigin(originHeader) {
  try {
    const u = new URL(String(originHeader || ''))
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.origin
    if (u.protocol === 'dsh-app:') return 'dsh-app://' + u.host
  } catch { /* invalid origin */ }
  return ''
}

export async function handleHeadlessRedirect(req, res, { pending, completeOAuth, accountsView }) {
  const rawUrl = new URL(req.url || '/', 'http://127.0.0.1')
  const code = rawUrl.searchParams.get('code') || ''
  const state = rawUrl.searchParams.get('state') || ''
  const error = rawUrl.searchParams.get('error') || ''
  const errorDesc = rawUrl.searchParams.get('error_description') || error

  if (error) {
    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(`<!doctype html><meta charset="utf-8"><title>OAuth Error</title><body style="font-family:sans-serif;padding:2rem;">` +
      `<h2>Authorization Failed</h2><p style="color:#e53935;">${escapeHtml(errorDesc)}</p>` +
      `<p>You can close this tab and return to Settings.</p></body>`)
    return
  }

  if (!code) {
    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(`<!doctype html><meta charset="utf-8"><title>Missing Code</title><body style="font-family:sans-serif;padding:2rem;">` +
      `<h2>Missing Authorization Code</h2><p>No authorization code found in callback query.</p></body>`)
    return
  }

  const row = pending ? pending.get(state) : null
  if (row && typeof completeOAuth === 'function') {
    try {
      await completeOAuth({ provider: row.provider, index: row.index, code, state })
      if (typeof accountsView === 'function') await accountsView()
      const targetOrigin = safePostMessageOrigin(req && req.headers && req.headers.origin)
      const relay = targetOrigin
        ? `<script>if (window.opener) { window.opener.postMessage({ type: 'dsh-oauth-success', state: ${JSON.stringify(String(state))} }, ${JSON.stringify(targetOrigin)}); }</script>`
        : ''
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(`<!doctype html><meta charset="utf-8"><title>Subscriptions</title><body style="font-family:sans-serif;padding:2rem;">` +
        `<h2 style="color:#2e7d32;">Signed In Successfully</h2>` +
        `<p>Your account has been authorized. You can close this window and return to Settings.</p>` +
        relay +
        `</body>`)
      return
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(`<!doctype html><meta charset="utf-8"><title>OAuth Exchange Failed</title><body style="font-family:sans-serif;padding:2rem;">` +
        `<h2>Failed to Complete OAuth</h2><p style="color:#e53935;">${escapeHtml(String(e && e.message || e))}</p></body>`)
      return
    }
  }

  // Fallback: pending state expired or missing (show copyable code)
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(`<!doctype html><meta charset="utf-8"><title>Authorization Code</title><body style="font-family:sans-serif;padding:2rem;">` +
    `<h2>Authorization Code Received</h2>` +
    `<p>Session timed out or running in manual mode. Copy the code or URL below and paste it into Settings &gt; Connect:</p>` +
    `<textarea readonly style="width:100%;height:80px;font-family:monospace;padding:0.5rem;">${escapeHtml(rawUrl.toString())}</textarea>` +
    `<p style="margin-top:1rem;"><strong>Code:</strong> <code>${escapeHtml(code)}</code></p>` +
    `</body>`)
}
