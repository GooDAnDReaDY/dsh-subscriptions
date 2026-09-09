// Small shared UI helpers extracted verbatim from client.js (#266).
export function makeBits(deps) {
  const { React, requireFn, getT } = deps
  const t = (...a) => getT()(...a)
    function normalizePlanBadge(provider, plan) {
      if (!plan && provider !== 'kimi' && provider !== 'glm') return null
      var p = String(plan || '').toLowerCase().replace(/[^a-z0-9]/g, '')
      var label = plan
      if (provider === 'codex') {
        if (p.indexOf('pro20') >= 0 || p === 'pro') label = 'Pro 20x'
        else if (p.indexOf('pro5') >= 0 || p.indexOf('prolite') >= 0) label = 'Pro 5x'
        else if (p.indexOf('team') >= 0) label = 'Team'
        else if (p.indexOf('plus') >= 0) label = 'Plus'
        else if (p.indexOf('enterp') >= 0) label = 'Enterprise'
      } else if (provider === 'grok') {
        if (p.indexOf('super') >= 0) label = 'SuperGrok'
        else if (p.indexOf('plus') >= 0) label = 'X Premium+'
        else if (p.indexOf('premium') >= 0) label = 'X Premium'
      } else if (provider === 'antigravity') {
        if (p.indexOf('ultra') >= 0) label = 'Ultra'
        else if (p.indexOf('pro') >= 0) label = 'Pro'
      } else if (provider === 'kimi') {
        label = 'Coding Plan'
      } else if (provider === 'glm') {
        label = '150% Boost'
      }
      return label ? React.createElement('span', { className: 'dsub-planBadge' }, label) : null
    }

    function formatRelativeReset(resetAt, lang, now) {
      if (!resetAt || !Number.isFinite(resetAt) || resetAt <= 0) return ''
      var delta = resetAt - (now || Date.now())
      var isRu = lang !== 'en'
      if (delta <= 0) return isRu ? 'только что' : 'just now'
      var totalMinutes = Math.max(1, Math.round(delta / 60000))
      var days = Math.floor(totalMinutes / 1440)
      var hours = Math.floor((totalMinutes % 1440) / 60)
      var minutes = totalMinutes % 60
      var bits = []
      if (days) bits.push(days + (isRu ? ' дн' : 'd'))
      if (hours) bits.push(hours + (isRu ? ' ч' : 'h'))
      if (minutes || !bits.length) bits.push(minutes + (isRu ? ' мин' : 'm'))
      return (isRu ? 'через ' : 'in ') + bits.join(' ')
    }

    function ResetCountdown(props) {
      const [now, setNow] = React.useState(Date.now())
      React.useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 1000)
        return () => clearInterval(id)
      }, [])
      const ms = (props.resetAt || 0) - now
      if (ms <= 0) return null
      const total = Math.floor(ms / 1000)
      if (total > 3600) {
        return React.createElement('span', { className: 'dsub-sub', style: { fontVariantNumeric: 'tabular-nums' } },
          t('resetLabel') + ' ' + formatRelativeReset(props.resetAt, t('lang'), now))
      }
      const m = Math.floor(total / 60)
      const sec = total % 60
      const pad = (n) => String(n).padStart(2, '0')
      return React.createElement('span', { className: 'dsub-sub', style: { fontVariantNumeric: 'tabular-nums' } },
        t('resetLabel') + ' ' + pad(m) + ':' + pad(sec))
    }

    function badgeFor(account, t) {
      if (!account || !account.configured) return t('notConnected')
      if (account.validationUrl) return t('verifyAccount')
      if (account.cooldownUntil && account.cooldownUntil > Date.now()) return t('coolingDown')
      if (account.usagePercent != null && account.usagePercent >= 100) return t('usageFull')
      return t('connected')
    }

    // The card in the Plugins tab draws its own header and collapse toggle:
    // the core only provides the list frame.
        // Core chevron icon. Without a guarded require, a missing IconChevronDownOutline14 could take down the whole client half.
    let ChevronIcon = null
    try {
      const primitives = requireFn('@deepseek-ai/dsh-client-ui-primitives')
      ChevronIcon = primitives && primitives.IconChevronDownOutline14
    } catch (noPrimitives) {
      ChevronIcon = null
    }
    function FallbackChevron(props) {
      return React.createElement('svg', { className: props.className, width: 14, height: 14, viewBox: '0 0 14 14', fill: 'none' },
        React.createElement('path', { d: 'M3.5 5.25L7 8.75l3.5-3.5', stroke: 'currentColor', 'stroke-width': 1.5, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
      )
    }
    const Chevron = ChevronIcon || FallbackChevron

  return { normalizePlanBadge, formatRelativeReset, ResetCountdown, badgeFor, Chevron }
}
