/**
 * Normalize and pretty-print subscription plans.
 */

export function normalizePlanName(provider, rawPlan) {
  if (!rawPlan || typeof rawPlan !== 'string') {
    if (provider === 'kimi') return 'Coding Plan'
    if (provider === 'glm') return 'Coding Plan 150%'
    return ''
  }
  const key = rawPlan.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
  if (provider === 'codex') {
    if (key.includes('pro20') || key === 'pro') return 'Pro 20x'
    if (key.includes('pro5') || key.includes('prolite')) return 'Pro 5x'
    if (key.includes('team')) return 'Team'
    if (key.includes('plus')) return 'Plus'
    if (key.includes('enterp')) return 'Enterprise'
    if (key.includes('edu')) return 'Edu'
    if (key.includes('free')) return 'Free'
  }
  if (provider === 'grok') {
    if (key.includes('super')) return 'SuperGrok'
    if (key.includes('plus') || key.includes('premiumplus')) return 'X Premium+'
    if (key.includes('premium')) return 'X Premium'
    if (key.includes('basic')) return 'X Basic'
    if (key.includes('free')) return 'Free'
  }
  if (provider === 'claude') {
    if (key.includes('team')) return 'Team'
    if (key.includes('enterp')) return 'Enterprise'
    if (key.includes('pro')) return 'Pro'
    if (key.includes('free')) return 'Free'
  }
  if (provider === 'antigravity') {
    if (key.includes('ultra')) return 'Ultra'
    if (key.includes('pro')) return 'Pro'
    if (key.includes('free')) return 'Free'
  }
  if (provider === 'kimi') return 'Coding Plan'
  if (provider === 'glm') return 'Coding Plan 150%'
  return rawPlan
}
