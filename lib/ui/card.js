// Plugin settings card and its slot registration extracted verbatim from client.js (#266).
export function makeCard(deps) {
  const { React, NS, getT, setT, SubsSection, en, ru, INSTRUCTIONS, ErrorBoundary, Chevron, badgeFor, normalizePlanBadge, formatRelativeReset, ResetCountdown } = deps
  const t = (...a) => getT()(...a)
    function PluginCard(props) {
      const t = (props && props.t) || ((key) => key)
      const [open, setOpen] = React.useState(false)
      return React.createElement('li', {
        className: 'dsub-card' + (open ? ' dsub-cardOpen' : ''),
      },
        React.createElement('button', {
          type: 'button',
          className: 'dsub-header',
          onClick: () => setOpen(!open),
          'aria-expanded': open,
        },
          React.createElement('div', { className: 'dsub-headText' },
            React.createElement('div', { className: 'dsub-name' }, t('title')),
            React.createElement('div', { className: 'dsub-description' }, t('cardIntro')),
          ),
          React.createElement(Chevron, { className: 'dsub-chev' + (open ? ' dsub-chevOpen' : '') }),
        ),
        open ? React.createElement('div', { className: 'dsub-body' },
          React.createElement(ErrorBoundary, null, React.createElement(SubsSection, props)),
        ) : null,
      )
    }

    function registerSettings(ctx) {
      // Languages can come from more than this plugin: dictionary packages declare
      // Russian for foreign namespaces. The core throws on re-declaring the same
      // namespace+language pair, and an unguarded call used to take down the
      // whole plugin - in the UI it surfaced as Failed to
      // load plugins listing perfectly innocent neighbours.
      //
      // So each language is declared separately and politely: if someone got
      // there first we yield, while our own English still lands.
      const addLocale = (locale, dictionary) => {
        try {
          return ctx.locale.register(NS, locale, dictionary)
        } catch (alreadyTaken) {
          return () => {}
        }
      }
      ctx.effect(() => {
        const undo = [addLocale('en', en), addLocale('ru', ru)]
        return () => { for (const off of undo) off() }
      }, 'dsh-subscriptions: словари')
    // Labels outside a component take the translator bound to the namespace.
      setT(ctx.locale.bind(NS))
      // The canonical place is the Plugins tab: a card with its own header
      // and collapse instead of a row in the side list. The registration key must
      // equal the settings namespace, otherwise the tab silently hides the slot.
      let moved = false
      try {
        moved = !!ctx.slots.inject('settings.plugin.item', () => ctx.slots.register(
          {
            name: 'settings.plugin.item',
            key: NS,
            locale: NS,
            inject: () => ({ ctx: ctx }),
          },
          PluginCard,
        ))
      } catch { moved = false }
      if (moved) return
      // #244: Fallback for harness cores before settings.plugin.item slot was
      // introduced (< 0.1.2-rc.1). Once all production profiles run a core
      // that has settings.plugin.item, this block can be safely removed.
      // Tracked in Gitea #244 — do not remove without verifying minimum core.
      try {
        ctx.slots.inject('settings.section', () => ctx.slots.register(
          {
            name: 'settings.section',
            id: '@goodandready/dsh-subscriptions',
            order: 28,
            locale: NS,
            label: () => t('title'),
            inject: () => ({ ctx: ctx }),
          },
          SubsSection,
        ))
      } catch (e) {
        // Neither slot system available — settings panel will not render.
        // This is expected on headless / non-web profiles.
      }
    }

    // Hot provider switcher in the composer row: a click cycles
    // the active subscription provider for the next request.

  return { PluginCard, registerSettings }
}
