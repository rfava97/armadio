import { useState, type FormEvent } from 'react'
import { Check, KeyRound, LogOut } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const MIN_PASSWORD = 8

function PasswordForm() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const mismatch = confirm.length > 0 && password !== confirm

  async function save(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setSaved(false)
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) {
      setError(error.code === 'same_password' ? 'È già la tua password attuale' : error.message)
      return
    }
    setPassword('')
    setConfirm('')
    setSaved(true)
  }

  return (
    <form onSubmit={save} className="mt-4 flex flex-col gap-4 rounded-card bg-surface p-5 shadow-card">
      <p className="text-caption text-fg-muted">
        Con una password accedi senza aspettare l'email, anche dall'app installata.
      </p>
      <label className="flex flex-col gap-2">
        <span className="text-label font-medium text-fg-muted">Nuova password</span>
        <Input
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-2">
        <span className="text-label font-medium text-fg-muted">Ripeti password</span>
        <Input
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          aria-invalid={mismatch}
        />
      </label>
      {mismatch && <p className="text-caption text-danger">Le password non coincidono</p>}
      <Button type="submit" disabled={busy || password.length < MIN_PASSWORD || password !== confirm}>
        <KeyRound className="size-5" aria-hidden />
        {busy ? 'Salvataggio…' : 'Salva password'}
      </Button>
      {password.length > 0 && password.length < MIN_PASSWORD && (
        <p className="text-caption text-fg-muted">Almeno {MIN_PASSWORD} caratteri</p>
      )}
      {saved && (
        <p role="status" className="flex items-center gap-2 text-caption text-fg">
          <Check className="size-4 text-accent" aria-hidden />
          Password salvata
        </p>
      )}
      {error && (
        <p role="alert" className="text-caption text-danger">
          {error}
        </p>
      )}
    </form>
  )
}

export default function Profilo() {
  const { session } = useAuth()
  return (
    <main>
      <h1 className="text-screen-title">Profilo</h1>
      <p className="mt-6 text-fg-muted">
        Accesso effettuato come <span className="text-fg">{session?.user.email}</span>
      </p>

      <h2 className="mt-8 text-body font-semibold">Password</h2>
      <PasswordForm />

      <Button variant="secondary" className="mt-8" onClick={() => supabase.auth.signOut()}>
        <LogOut className="size-5" aria-hidden />
        Esci
      </Button>
    </main>
  )
}
