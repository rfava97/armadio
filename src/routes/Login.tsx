import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { ArrowLeft, KeyRound, Mail, UserPlus } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/auth/context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

function parseEmailLink(value: string): { tokenHash: string; type: 'magiclink' | 'signup' | 'email' } | null {
  if (!/^https?:\/\//.test(value)) return null
  try {
    const url = new URL(value)
    const tokenHash = url.searchParams.get('token') ?? url.searchParams.get('token_hash')
    if (!tokenHash) return null
    const t = url.searchParams.get('type')
    const type = t === 'signup' || t === 'email' ? t : 'magiclink'
    return { tokenHash, type }
  } catch {
    return null
  }
}

export default function Login() {
  const { session } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState<'password' | 'signup' | 'email' | 'code'>('password')
  const [info, setInfo] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (session) return <Navigate to="/armadio" replace />

  function goTo(next: typeof step) {
    setError(null)
    setInfo(null)
    setStep(next)
  }

  async function signInWithPassword(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) {
      setError(error.code === 'invalid_credentials' ? 'Email o password errati' : error.message)
    }
  }

  async function signUp(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setInfo(null)
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: window.location.origin + import.meta.env.BASE_URL },
    })
    setBusy(false)
    if (error) {
      setError(
        error.code === 'user_already_exists'
          ? 'Esiste già un account con questa email: accedi'
          : error.code === 'signup_disabled'
            ? 'Le registrazioni sono disattivate in Supabase'
            : error.message,
      )
      return
    }
    // Con "Confirm email" disattivato la sessione arriva subito e si entra nell'app.
    if (!data.session) {
      setInfo("Account creato. Conferma l'email dal link che ti ho mandato, poi accedi con la password.")
      setStep('password')
    }
  }

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
    const value = code.trim()
    // Nell'app installata su iPhone il link dell'email si apre in Safari (sessione separata):
    // si può incollare qui il link copiato, che contiene il token_hash.
    const linkToken = parseEmailLink(value)
    const { error } = linkToken
      ? await supabase.auth.verifyOtp({ token_hash: linkToken.tokenHash, type: linkToken.type })
      : await supabase.auth.verifyOtp({ email: email.trim(), token: value, type: 'email' })
    setBusy(false)
    if (error) setError(linkToken ? 'Link non valido o scaduto' : 'Codice non valido o scaduto')
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-gutter pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <h1 className="text-screen-title">Armadio</h1>

      {step === 'password' && (
        <form onSubmit={signInWithPassword} className="mt-8 flex flex-col gap-4">
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
          <label className="flex flex-col gap-2">
            <span className="text-label font-medium text-fg-muted">Password</span>
            <Input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <Button type="submit" disabled={busy || !email || !password}>
            <KeyRound className="size-5" aria-hidden />
            {busy ? 'Accesso…' : 'Accedi'}
          </Button>
          <Button type="button" variant="ghost" size="md" onClick={() => goTo('email')}>
            <Mail className="size-4" aria-hidden />
            Accedi con un link via email
          </Button>
          <Button type="button" variant="ghost" size="md" onClick={() => goTo('signup')}>
            <UserPlus className="size-4" aria-hidden />
            Crea account
          </Button>
        </form>
      )}

      {step === 'signup' && (
        <form onSubmit={signUp} className="mt-8 flex flex-col gap-4">
          <p className="text-fg-muted">Crea il tuo account con email e password.</p>
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
          <label className="flex flex-col gap-2">
            <span className="text-label font-medium text-fg-muted">Password (almeno 8 caratteri)</span>
            <Input
              type="password"
              autoComplete="new-password"
              minLength={8}
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
            />
          </label>
          {confirm.length > 0 && password !== confirm && (
            <p className="text-caption text-danger">Le password non coincidono</p>
          )}
          <Button type="submit" disabled={busy || !email || password.length < 8 || password !== confirm}>
            <UserPlus className="size-5" aria-hidden />
            {busy ? 'Creazione…' : 'Crea account'}
          </Button>
          <Button type="button" variant="ghost" size="md" onClick={() => goTo('password')}>
            <ArrowLeft className="size-4" aria-hidden />
            Ho già un account
          </Button>
        </form>
      )}

      {step === 'email' && (
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
          <Button type="button" variant="ghost" size="md" onClick={() => goTo('password')}>
            <KeyRound className="size-4" aria-hidden />
            Accedi con password
          </Button>
        </form>
      )}

      {step === 'code' && (
        <form onSubmit={verifyCode} className="mt-8 flex flex-col gap-4">
          <p className="text-fg-muted">
            Controlla la posta di <span className="text-fg">{email}</span>. Se usi l'app installata, non aprire
            il link: inserisci qui il codice, oppure tieni premuto il link, copialo e incollalo qui.
          </p>
          <label className="flex flex-col gap-2">
            <span className="text-label font-medium text-fg-muted">Codice o link dell'email</span>
            <Input
              autoComplete="one-time-code"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
            />
          </label>
          <Button type="submit" disabled={busy || code.length < 6}>
            {busy ? 'Verifica…' : 'Accedi'}
          </Button>
          <Button type="button" variant="ghost" size="md" onClick={() => goTo('email')}>
            <ArrowLeft className="size-4" aria-hidden />
            Cambia email
          </Button>
        </form>
      )}

      {info && (
        <p role="status" className="mt-4 text-caption text-fg">
          {info}
        </p>
      )}

      {error && (
        <p role="alert" className="mt-4 text-caption text-danger">
          {error}
        </p>
      )}
    </main>
  )
}
