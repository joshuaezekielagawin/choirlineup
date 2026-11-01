import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

type Props = { children: ReactNode; title: string; returnTo: string; returnLabel: string }
type State = { error: Error | null }

export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`ChoirLineup ${this.props.title} route failed to render.`, error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return <section className="page-stack route-error" role="alert">
        <p className="eyebrow">THIS PAGE COULDN’T OPEN</p>
        <h2>{this.props.title} hit an unexpected error.</h2>
        <p className="muted">Your saved data has not been changed. Return to the previous screen and try again.</p>
        {import.meta.env.DEV && <pre className="route-error-detail">{this.state.error.message}</pre>}
        <Link className="button-primary" to={this.props.returnTo}>{this.props.returnLabel}</Link>
      </section>
    }
    return this.props.children
  }
}
