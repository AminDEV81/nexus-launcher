import React from 'react'

interface Props {
  /** Changing this key (e.g. the active tab) clears a previous error and retries rendering. */
  resetKey: string
  children: React.ReactNode
}

interface State {
  failedKey: string | null
}

/**
 * Keeps a crashing screen from taking the whole console down: the header and controller hints stay
 * alive and switching tabs (or going back) retries rendering.
 */
export class ConsoleErrorBoundary extends React.Component<Props, State> {
  state: State = { failedKey: null }

  static getDerivedStateFromError(): Partial<State> {
    return { failedKey: '__pending__' }
  }

  componentDidCatch(error: Error): void {
    this.setState({ failedKey: this.props.resetKey })
    console.error('Console screen crashed:', error)
  }

  componentDidUpdate(prev: Props): void {
    if (prev.resetKey !== this.props.resetKey && this.state.failedKey !== null) {
      this.setState({ failedKey: null })
    }
  }

  render(): React.ReactNode {
    if (this.state.failedKey !== null) {
      return (
        <div className="flex flex-col gap-3 px-6 pt-10">
          <h2 className="text-[2rem] font-semibold tracking-tight text-white">
            Something went wrong
          </h2>
          <p className="text-[1.1rem] text-white/50">
            Switch to another tab or go back, then try again.
          </p>
        </div>
      )
    }
    return this.props.children
  }
}
