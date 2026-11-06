import { codexBody, grokBody } from './images.js'

export const MAX_REFERENCE_IMAGES = 5

/** #801: validate attachment refs before any generation call. */
export function validateReferenceImages(refs) {
  if (refs == null) return { ok: true, refs: [] }
  if (!Array.isArray(refs)) {
    return { ok: false, error: 'referenceImages must be an array' }
  }
  const clean = refs.map((ref) => String(ref || '').trim()).filter(Boolean)
  if (!clean.length) return { ok: false, error: 'referenceImages must not be empty' }
  if (clean.length > MAX_REFERENCE_IMAGES) return { ok: false, error: 'at most 5 reference images are allowed' }
  if (new Set(clean).size !== clean.length) return { ok: false, error: 'duplicate reference images are not allowed' }
  return { ok: true, refs: clean }
}

/** #801, #1004: provider-specific image-edit request bodies reusing production image builders. */
export function referenceImageRequest(provider, { prompt, references = [], model, size, quality } = {}) {
  const checked = validateReferenceImages(references)
  if (!checked.ok) {
    const err = new Error(checked.error)
    err.code = 'INVALID_MEDIA_REFERENCE'
    throw err
  }
  if (provider === 'grok') {
    const body = grokBody({ prompt, size, quality, referenceImages: checked.refs })
    if (model) body.model = model
    return body
  }
  const body = codexBody({ prompt, size, quality, referenceImages: checked.refs })
  if (model) body.model = model
  return body
}
