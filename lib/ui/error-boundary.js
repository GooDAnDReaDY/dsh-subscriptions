// ErrorBoundary extracted verbatim from client.js (#266).
export function makeErrorBoundary(deps) {
  const { React } = deps
    class ErrorBoundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { hasError: false, error: null }
      }
      static getDerivedStateFromError(error) {
        return { hasError: true, error }
      }
      componentDidCatch(error, info) {
        try { console.error("[dsh-subscriptions UI error]", error, info) } catch {}
      }
      render() {
        if (this.state.hasError) {
          return React.createElement(
            "div",
            { style: { padding: "12px", border: "1px solid var(--dsw-alias-state-error-primary, #e5534b)", borderRadius: "8px", background: "var(--dsw-alias-bg-layer-2, #1f1f1f)", margin: "8px 0", fontSize: "13px" } },
            React.createElement("div", { style: { fontWeight: 600, color: "var(--dsw-alias-state-error-primary, #e5534b)", marginBottom: "4px" } }, "Subscriptions UI error"),
            React.createElement("div", { style: { color: "var(--dsw-alias-label-secondary, #8b949e)", fontSize: "12px", marginBottom: "8px" } }, String(this.state.error && this.state.error.message || this.state.error || "Unknown error")),
            React.createElement("button", {
              className: "dsub-mini",
              onClick: () => this.setState({ hasError: false, error: null })
            }, "Retry")
          )
        }
        return this.props.children
      }
    }
  return ErrorBoundary
}
