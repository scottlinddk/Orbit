import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  type: string
  children: ReactNode
}

/** A crashing widget shows a message instead of taking the whole dashboard down. */
export class WidgetBoundary extends Component<Props, { failed: boolean }> {
  override state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`Widget ${this.props.type} crashed`, error, info.componentStack)
  }

  override render() {
    if (this.state.failed) return <p role="alert">This widget could not be shown.</p>
    return this.props.children
  }
}
