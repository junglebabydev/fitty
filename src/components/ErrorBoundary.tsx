import { Component, type ErrorInfo, type ReactNode } from 'react'
import { RotateCw } from 'lucide-react'
import { Button } from './Button'
import { ErrorState } from './ErrorState'

export interface ErrorBoundaryProps {
  children: ReactNode
  /** Custom fallback; receives the error and a reset callback. */
  fallback?: (error: Error, reset: () => void) => ReactNode
  /** When this value changes (e.g. the route path) a caught error is cleared automatically. */
  resetKey?: unknown
  onError?: (error: Error, info: ErrorInfo) => void
}

interface ErrorBoundaryState {
  error: Error | null
}

function toError(e: unknown): Error {
  if (e instanceof Error) return e
  return new Error(typeof e === 'string' ? e : 'Unknown error')
}

/**
 * Catches render errors below it so one broken screen never takes the whole app down.
 * Default fallback: ErrorState with "Try again" (re-renders the subtree) and "Reload app"
 * (for failed lazy chunk loads, which React will not retry on its own).
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { error: toError(error) }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary]', error, info.componentStack)
    this.props.onError?.(error, info)
  }

  componentDidUpdate(prev: ErrorBoundaryProps): void {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  reset = (): void => {
    this.setState({ error: null })
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    if (this.props.fallback) return this.props.fallback(error, this.reset)
    return (
      <div className="flex-1 flex flex-col items-center justify-center pt-safe">
        <ErrorState
          title="This screen hit an error"
          body={error.message || 'Something went wrong while rendering.'}
          onRetry={this.reset}
        />
        <Button variant="ghost" size="sm" icon={<RotateCw size={16} />} onClick={() => window.location.reload()} className="-mt-8">
          Reload app
        </Button>
      </div>
    )
  }
}
