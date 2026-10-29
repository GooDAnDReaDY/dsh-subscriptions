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

/** #801: provider-specific image-edit request bodies. */
export function referenceImageRequest(provider, { prompt, references = [], model, size } = {}) {
  const checked = validateReferenceImages(references)
  if (!checked.ok) {
    const err = new Error(checked.error)
    err.code = 'INVALID_MEDIA_REFERENCE'
    throw err
  }
  if (provider === 'grok') {
    return {
      model: model || 'grok-2-image',
      prompt,
      image_urls: checked.refs,
      ...(size ? { size } : {}),
    }
  }
  return {
    model: model || 'gpt-image-1',
    prompt,
    images: checked.refs.map((ref) => ({ image_url: ref })),
    ...(size ? { size } : {}),
  }
}
