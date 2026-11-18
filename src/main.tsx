import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '@/auth/AuthProvider'
import { ToastProvider } from '@/components/ToastProvider'
import App from './App'
import { ErrorBoundary } from '@/components/ErrorBoundary'
import '@fontsource-variable/inter'
import '@fontsource-variable/cormorant-garamond'
import './index.css'

// Dopo un nuovo deploy l'app ancora aperta può cercare file che non esistono più
// ("Importing a module script failed"): ricarico una volta per prendere la versione nuova.
window.addEventListener('vite:preloadError', (e) => {
  const KEY = 'armadio.reloaded-at'
  const last = Number(sessionStorage.getItem(KEY) ?? 0)
  if (Date.now() - last < 30_000) return // già ricaricato da poco: lascio passare l'errore
  e.preventDefault()
  sessionStorage.setItem(KEY, String(Date.now()))
  window.location.reload()
})

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 60_000, retry: 1 } },
})

// BASE_URL termina con "/", il basename del router no
const basename = import.meta.env.BASE_URL.replace(/\/$/, '')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <ToastProvider>
            <BrowserRouter basename={basename}>
              <App />
            </BrowserRouter>
          </ToastProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
)
