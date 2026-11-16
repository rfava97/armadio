import { useState, type FormEvent, type ReactNode } from 'react'
import { Camera, Check, Crosshair, KeyRound, LogOut, Ruler } from 'lucide-react'
import { Mannequin } from '@/components/Mannequin'
import { Spinner } from '@/components/Spinner'
import { useToast } from '@/components/toast'
import { estimate } from '@/lib/mannequin'
import { cn } from '@/lib/utils'
import { useBodyPhotoUrl, useProfile, useSaveProfile, type AvatarMode } from '@/features/profile/api'
import { MeasuresSheet } from '@/features/profile/MeasuresSheet'
import { BodyPhotoSheet, CalibrateSheet } from '@/features/profile/BodyPhotoSheet'
import { AnchorEditor } from '@/features/profile/AnchorEditor'
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
    <form onSubmit={save} className="mt-3 flex flex-col gap-4 rounded-card border border-border bg-surface p-5">
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

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="mt-10 mb-3 text-overline font-semibold uppercase text-accent">{children}</h2>
}

export default function Profilo() {
  const { session } = useAuth()
  const { data: profile, isLoading, error, refetch } = useProfile()
  const save = useSaveProfile()
  const photo = useBodyPhotoUrl(profile?.body_photo_path)
  const toast = useToast()
  const [sheet, setSheet] = useState<'misure' | 'foto' | 'calibra' | null>(null)
  const [photoAspect, setPhotoAspect] = useState<number | null>(null)

  const choose = (mode: AvatarMode) => {
    if (!profile || profile.avatar_mode === mode) return
    if (mode === 'foto' && !profile.body_photo_path) {
      setSheet('foto')
      return
    }
    save.mutate({ avatar_mode: mode })
  }

  const resolved = profile ? estimate(profile) : null

  return (
    <main>
      <p className="text-overline font-semibold uppercase text-accent">Atelier personale</p>
      <h1 className="font-display text-screen-title">Profilo</h1>

      {isLoading && (
        <div className="mt-8 grid grid-cols-2 gap-3">
          <div className="aspect-[3/4] animate-pulse rounded-card bg-garment-bg" />
          <div className="aspect-[3/4] animate-pulse rounded-card bg-garment-bg" />
        </div>
      )}
      {error && (
        <div className="mt-8 flex flex-col items-center gap-4 text-center">
          <p className="text-fg-muted">Non riesco a caricare il profilo.</p>
          <Button variant="secondary" size="md" onClick={() => refetch()}>
            Riprova
          </Button>
        </div>
      )}

      {profile && resolved && (
        <>
          <SectionTitle>Avatar in uso</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <AvatarCard
              title="La tua foto"
              active={profile.avatar_mode === 'foto'}
              onSelect={() => choose('foto')}
            >
              {profile.body_photo_path ? (
                photo.data ? (
                  <>
                    {/* legge le proporzioni per sovrapporre i punti alla foto */}
                    {photoAspect === null && (
                      <img
                        src={photo.data}
                        alt=""
                        hidden
                        onLoad={(e) => setPhotoAspect(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)}
                      />
                    )}
                    {photoAspect !== null &&
                      (profile.body_anchors ? (
                        <AnchorEditor
                          src={photo.data}
                          aspect={photoAspect}
                          anchors={profile.body_anchors}
                          readOnly
                          maxHeight="100%"
                          className="h-full"
                        />
                      ) : (
                        <img src={photo.data} alt="La tua foto" className="h-full object-contain" />
                      ))}
                  </>
                ) : (
                  <Spinner className="size-6 text-accent" />
                )
              ) : (
                <span className="flex flex-col items-center gap-2 text-caption text-fg-muted">
                  <Camera className="size-8 text-accent" aria-hidden />
                  Aggiungi una foto
                </span>
              )}
            </AvatarCard>
            <AvatarCard title="Manichino" active={profile.avatar_mode === 'manichino'} onSelect={() => choose('manichino')}>
              <Mannequin measures={profile} className="h-full w-full" />
            </AvatarCard>
          </div>
          <div className="mt-3 flex gap-2">
            <Button variant="secondary" size="md" className="flex-1" onClick={() => setSheet('foto')}>
              <Camera className="size-5" aria-hidden />
              {profile.body_photo_path ? 'Cambia foto' : 'Aggiungi foto'}
            </Button>
            {profile.body_photo_path && (
              <Button variant="secondary" size="md" className="flex-1" onClick={() => setSheet('calibra')}>
                <Crosshair className="size-5" aria-hidden />
                Calibra punti
              </Button>
            )}
          </div>

          <SectionTitle>Le tue misure</SectionTitle>
          <div className="rounded-card border border-border bg-surface p-5">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              {SUMMARY.map(({ key, label, unit }) => (
                <div key={key} className="flex flex-col">
                  <dt className="text-caption text-fg-muted">{label}</dt>
                  <dd className="font-display text-[22px] leading-7 font-semibold">
                    {resolved[key]}
                    <span className="ml-1 font-sans text-caption font-normal text-fg-muted">
                      {unit}
                      {key !== 'height_cm' && profile[key] === null ? ' · stimata' : ''}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
            <Button className="mt-5" onClick={() => setSheet('misure')}>
              <Ruler className="size-5" aria-hidden />
              Personalizza le misure
            </Button>
          </div>

          <MeasuresSheet
            open={sheet === 'misure'}
            initial={profile}
            saving={save.isPending}
            error={save.error?.message ?? null}
            onClose={() => setSheet(null)}
            onSave={async (m) => {
              try {
                await save.mutateAsync(m)
                setSheet(null)
                window.setTimeout(() => toast('Misure salvate'), 260)
              } catch (e) {
                console.error(e)
              }
            }}
          />
          <BodyPhotoSheet
            open={sheet === 'foto'}
            profile={profile}
            onClose={() => {
              setSheet(null)
              setPhotoAspect(null)
            }}
          />
          <CalibrateSheet
            open={sheet === 'calibra'}
            photoUrl={photo.data ?? null}
            profile={profile}
            onClose={() => setSheet(null)}
          />
        </>
      )}

      <SectionTitle>Account</SectionTitle>
      <p className="text-fg-muted">
        Accesso effettuato come <span className="text-fg">{session?.user.email}</span>
      </p>
      <h3 className="mt-6 text-body font-semibold">Password</h3>
      <PasswordForm />

      <Button variant="secondary" className="mt-8" onClick={() => supabase.auth.signOut()}>
        <LogOut className="size-5" aria-hidden />
        Esci
      </Button>
    </main>
  )
}

const SUMMARY = [
  { key: 'height_cm', label: 'Altezza', unit: 'cm' },
  { key: 'weight_kg', label: 'Peso', unit: 'kg' },
  { key: 'shoulders_cm', label: 'Spalle', unit: 'cm' },
  { key: 'chest_cm', label: 'Petto', unit: 'cm' },
  { key: 'waist_cm', label: 'Vita', unit: 'cm' },
  { key: 'hips_cm', label: 'Fianchi', unit: 'cm' },
] as const

function AvatarCard({
  title,
  active,
  onSelect,
  children,
}: {
  title: string
  active: boolean
  onSelect: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        'flex flex-col overflow-hidden rounded-card border-2 bg-surface text-left transition-colors',
        active ? 'border-accent' : 'border-border',
      )}
    >
      {/* contenuto in assoluto: foto o manichino non possono allungare la card */}
      <div className="relative aspect-[3/4] w-full bg-garment-bg">
        <div className="absolute inset-3 flex items-center justify-center">{children}</div>
      </div>
      <div className="flex flex-col px-3 py-2.5">
        <span className="font-display text-[19px] leading-6 font-semibold">{title}</span>
        <span className={cn('text-caption', active ? 'font-medium text-accent' : 'text-fg-muted')}>
          {active ? 'In uso' : 'Tocca per selezionare'}
        </span>
      </div>
    </button>
  )
}
