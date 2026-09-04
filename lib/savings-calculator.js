export function calculateCacheSavings({ cachedTokens = 0, totalInputTokens = 0, ratePerMillion = 3.0 } = {}) {
  const hitRate = totalInputTokens > 0 ? Math.round((cachedTokens / totalInputTokens) * 100) : 0
  // Anthropic / OpenAI prompt cache discount is typically 90% (cached tokens cost 10% of standard input)
  const fullCost = (cachedTokens / 1_000_000) * ratePerMillion
  const discountedCost = fullCost * 0.1
  const savedDollars = Math.round((fullCost - discountedCost) * 100) / 100

  return {
    cachedTokens,
    totalInputTokens,
    hitRatePercent: hitRate,
    estimatedSavedDollars: savedDollars
  }
}
