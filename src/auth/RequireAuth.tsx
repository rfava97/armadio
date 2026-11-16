import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Spinner } from '@/components/Spinner'
import { useAuth } from './context'

export function RequireAuth() {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center" aria-label="Caricamento">
        <Spinner className="size-6 text-fg-muted" />
      </div>
    )
  }
  if (!session) return <Navigate to="/login" replace state={{ from: location }} />
  return <Outlet />
}
