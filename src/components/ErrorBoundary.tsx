import { Component, type ErrorInfo, type ReactNode } from 'react'
import { RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'

type State = { error: Error | null }

/**
 * Se una parte dell'app va in errore, React smonta tutto e la pagina resta bianca: qui invece resta
 * un messaggio con "Ricarica" e il testo dell'errore (da mandare a chi sistema l'app).
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-bg p-6 text-center">
        <h1 className="font-display text-screen-title">Qualcosa si è bloccato</h1>
        <p className="max-w-sm text-body text-fg-muted">Ricarica l'app: i tuoi capi e gli outfit sono salvati.</p>
        <Button onClick={() => window.location.reload()}>
          <RotateCcw className="size-5" aria-hidden />
          Ricarica
        </Button>
        <p className="max-w-sm text-caption break-words text-fg-muted">Errore: {error.message || String(error)}</p>
      </main>
    )
  }
}
