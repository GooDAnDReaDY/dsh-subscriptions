// Генерация картинок на подписке.
//
// Здесь только протокол: куда идти, что послать и как прочитать ответ. Всё
// остальное — сохранение файла, вложение в разговор, карточка — дело плагина
// генерации; этот плагин лишь одалживает свой аккаунт.
//
// Токен наружу не отдаётся: плагин объявляет службу внутри процесса, а не
// маршрут в сети. Харнесс на этой машине доступен без пароля, и ручка,
// раздающая живой токен подписки, была бы дырой пошире тех, что мы закрывали.

/** Куда уходит запрос у подписки ChatGPT. */
export const CODEX_URL = 'https://chatgpt.com/backend-api/codex/images/generations'
/** Модель, которую отдаёт этот адрес. */
export const CODEX_MODEL = 'gpt-image-2'
/** Куда уходит запрос у подписки Grok. */
export const GROK_URL = 'https://api.x.ai/v1/images/generations'
/** Модель, которую отдаёт этот адрес. */
export const GROK_MODEL = 'grok-imagine-image-2.0'

/** Размеры, которые понимает ChatGPT. */
export const SIZES = ['1024x1024', '1024x1536', '1536x1024', 'auto']

/** Grok мыслит не размерами, а соотношением сторон. */
const GROK_ASPECT = {
  '1024x1024': '1:1',
  '1024x1536': '2:3',
  '1536x1024': '3:2',
  auto: 'auto',
}

export function codexBody({ prompt, size, quality }) {
  const text = String(prompt || '').trim()
  if (!text) throw new Error('нужен непустой запрос')
  return {
    prompt: text,
    model: CODEX_MODEL,
    ...(size ? { size } : {}),
    ...(quality ? { quality } : {}),
  }
}

export function grokBody({ prompt, size, quality }) {
  const text = String(prompt || '').trim()
  if (!text) throw new Error('нужен непустой запрос')
  // У Grok качество всего двух ступеней: высокое складывается со средним.
  const level = quality === 'low' ? 'low'
    : (quality === 'medium' || quality === 'high') ? 'medium'
      : undefined
  return {
    prompt: text,
    model: GROK_MODEL,
    response_format: 'b64_json',
    ...(size && GROK_ASPECT[size] ? { aspect_ratio: GROK_ASPECT[size] } : {}),
    ...(level ? { quality: level } : {}),
  }
}

/** Разбор ответа: обе стороны отвечают одинаково. */
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
  if (!images.length) throw new Error('в ответе нет картинок')
  return images
}

/**
 * Один запрос к нужному адресу с заголовками этого провайдера.
 *
 * @param options {{provider, prompt, size, quality, session, fetchImpl, signal}}
 *   session — уже освежённый блок токенов: accessToken и, для ChatGPT, accountId.
 */
export async function generateOnce(options) {
  const { provider, session, fetchImpl, signal } = options
  const isCodex = provider === 'codex'
  const url = isCodex ? CODEX_URL : GROK_URL
  const body = isCodex ? codexBody(options) : grokBody(options)
  const headers = isCodex
    ? {
      authorization: `Bearer ${session.accessToken}`,
      // ChatGPT различает аккаунты отдельным заголовком, без него отвечает отказом.
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
