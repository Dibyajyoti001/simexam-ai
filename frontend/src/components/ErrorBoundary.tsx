import { Component, ErrorInfo, ReactNode } from "react"
import { AlertTriangle, RefreshCw } from "lucide-react"
import { Button } from "./ui/button"

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[SimExam ErrorBoundary] Uncaught UI error:", error, errorInfo)
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: null })
    window.location.reload()
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 px-4 text-center text-zinc-100 font-sans">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10 text-red-400 mb-4">
            <AlertTriangle size={28} />
          </div>
          <h2 className="text-xl font-semibold tracking-tight text-zinc-100">
            Something unexpected occurred in this view
          </h2>
          <p className="mt-2 max-w-md text-xs text-zinc-400">
            {this.state.error?.message || "An unexpected error occurred during rendering. Your session progress is saved."}
          </p>
          <div className="mt-6 flex gap-3">
            <Button onClick={this.handleReset} className="h-10 px-5 text-xs">
              <RefreshCw size={14} className="mr-2" />
              Reload Workspace
            </Button>
            <Button
              variant="outline"
              onClick={() => { window.location.href = "/" }}
              className="h-10 px-5 text-xs border-white/10"
            >
              Back to Home
            </Button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
