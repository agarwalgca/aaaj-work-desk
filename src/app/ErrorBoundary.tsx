import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '../components/Button'

/**
 * A render that throws should cost one screen, not the session.
 *
 * The detail is shown rather than swallowed: there is nobody to file a bug report
 * with, so the person sitting in front of it reading the message aloud down the
 * phone is the error reporting.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Work Desk failed to render', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <main className="bg-paper flex min-h-dvh items-center justify-center p-4">
        <div className="rounded-card border-rule bg-card w-full max-w-md border p-6">
          <h1 className="font-serif text-lg font-semibold">Something went wrong</h1>
          <p className="text-ink-soft mt-2 text-sm">
            Nothing saved on this device has been lost. Reloading usually clears it.
          </p>
          <pre className="rounded-control border-rule text-ink-soft mt-3 overflow-x-auto border p-2 font-mono text-xs">
            {error.message}
          </pre>
          <div className="mt-4 flex gap-2">
            <Button onClick={() => window.location.reload()}>Reload</Button>
            <Button variant="secondary" onClick={() => this.setState({ error: null })}>
              Try again
            </Button>
          </div>
        </div>
      </main>
    )
  }
}
