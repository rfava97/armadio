import { LogOut } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/context'
import { Button } from '@/components/ui/button'

export default function Profilo() {
  const { session } = useAuth()
  return (
    <main>
      <h1 className="text-screen-title">Profilo</h1>
      <p className="mt-6 text-fg-muted">
        Accesso effettuato come <span className="text-fg">{session?.user.email}</span>
      </p>
      <Button variant="secondary" className="mt-8" onClick={() => supabase.auth.signOut()}>
        <LogOut className="size-5" aria-hidden />
        Esci
      </Button>
    </main>
  )
}
