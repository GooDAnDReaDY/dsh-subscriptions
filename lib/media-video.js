const ASPECTS = new Set(['16:9', '9:16', '1:1', '4:3', '3:4', '3:2', '2:3'])
const RESOLUTIONS = new Set(['480p', '720p', '1080p'])

/** #801: validate video generation parameters before dispatch. */
export function validateVideoRequest({ duration, aspectRatio, resolution, imageUrl } = {}) {
  const seconds = duration == null ? 5 : Number(duration)
  if (!Number.isFinite(seconds) || seconds < 1 || seconds > 15) {
    const err = new Error('duration must be between 1 and 15 seconds')
    err.code = 'INVALID_VIDEO_PARAMS'
    throw err
  }
  if (aspectRatio != null && !ASPECTS.has(String(aspectRatio))) {
    const err = new Error('unsupported aspect ratio')
    err.code = 'INVALID_VIDEO_PARAMS'
    throw err
  }
  if (resolution != null && !RESOLUTIONS.has(String(resolution))) {
    const err = new Error('unsupported resolution')
    err.code = 'INVALID_VIDEO_PARAMS'
    throw err
  }
  if (imageUrl != null && !/^https?:\/\//i.test(String(imageUrl))) {
    const err = new Error('imageUrl must be http(s)')
    err.code = 'INVALID_VIDEO_PARAMS'
    throw err
  }
  return {
    duration: seconds,
    ...(aspectRatio ? { aspectRatio: String(aspectRatio) } : {}),
    ...(resolution ? { resolution: String(resolution) } : {}),
    ...(imageUrl ? { imageUrl: String(imageUrl) } : {}),
  }
}

export function videoPollDelay(attempt) {
  const n = Number(attempt) || 0
  return Math.min(4000, 500 * 2 ** n)
}

export function extractVideoResult(payload) {
  const body = payload && typeof payload === 'object' ? payload : {}
  const data = body.data && typeof body.data === 'object' ? body.data : body
  return {
    id: data.id || data.video_id || data.request_id || null,
    status: String(data.status || '').toLowerCase(),
    url: data.url || data.video_url || (Array.isArray(data.output) ? data.output[0] : null),
  }
}
