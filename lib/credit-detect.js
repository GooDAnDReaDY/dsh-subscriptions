export function detectCodexBillingType(rawBilling) {
  if (!rawBilling || typeof rawBilling !== 'object') {
    return { plan: 'Free / Unknown', isHardLimit: false, isPrepaid: false }
  }

  const planId = String(rawBilling.plan || rawBilling.subscription_type || '').toLowerCase()
  const hasHardLimit = Boolean(rawBilling.hard_limit_reached || rawBilling.is_blocked)
  const isPrepaid = Boolean(rawBilling.has_payment_method || rawBilling.is_prepaid)

  let label = 'Free'
  if (planId.includes('team')) label = 'Team'
  else if (planId.includes('pro')) label = 'Pro'
  else if (planId.includes('plus')) label = 'Plus'
  else if (planId.includes('enterprise')) label = 'Enterprise'

  return {
    plan: label,
    isHardLimit: hasHardLimit,
    isPrepaid,
    remainingCredits: rawBilling.remaining_credits != null ? Number(rawBilling.remaining_credits) : null
  }
}
