import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { ArrowLeft, Mail } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export default function Login() {
  const { session } = useAuth()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'email' | 'code'>('email')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (session) return <Navigate to="/armadio" replace />

  async function sendLink(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin + import.meta.env.BASE_URL },
    })
    setBusy(false)
    if (error) setError(error.message)
    else setStep('code')
  }

  async function verifyCode(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: 'email' })
    setBusy(false)
    if (error) setError('Codice non valido o scaduto')
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-gutter pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <h1 className="text-screen-title">Armadio</h1>

      {step === 'email' ? (
        <form onSubmit={sendLink} className="mt-8 flex flex-col gap-4">
          <p className="text-fg-muted">Ti mando un link di accesso via email.</p>
          <label className="flex flex-col gap-2">
            <span className="text-label font-medium text-fg-muted">Email</span>
            <Input
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nome@esempio.it"
            />
          </label>
          <Button type="submit" disabled={busy || !email}>
            <Mail className="size-5" aria-hidden />
            {busy ? 'Invio in corso…' : 'Invia link di accesso'}
          </Button>
        </form>
      ) : (
        <form onSubmit={verifyCode} className="mt-8 flex flex-col gap-4">
          <p className="text-fg-muted">
            Controlla la posta di <span className="text-fg">{email}</span>. Apri il link oppure, se usi l'app
            installata, inserisci qui il codice dell'email.
          </p>
          <label className="flex flex-col gap-2">
            <span className="text-label font-medium text-fg-muted">Codice</span>
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={10}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
            />
          </label>
          <Button type="submit" disabled={busy || code.length < 6}>
            {busy ? 'Verifica…' : 'Accedi'}
          </Button>
          <Button type="button" variant="ghost" size="md" onClick={() => setStep('email')}>
            <ArrowLeft className="size-4" aria-hidden />
            Cambia email
          </Button>
        </form>
      )}

      {error && (
        <p role="alert" className="mt-4 text-caption text-danger">
          {error}
        </p>
      )}
    </main>
  )
}
