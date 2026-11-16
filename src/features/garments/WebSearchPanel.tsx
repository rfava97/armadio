import { useState } from 'react'
import { ArrowLeft, ArrowRight, ClipboardPaste, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Chip } from '@/components/Chip'
import { Spinner } from '@/components/Spinner'
import { downloadImage, extractImageUrl, googleImagesUrl, readClipboard } from '@/lib/webImage'

/**
 * "Cerca su internet" (SPEC 1.3): Google Immagini si apre in un'altra scheda,
 * l'immagine torna qui dagli appunti o da un link incollato.
 */
export function WebSearchPanel({ onFile, onBack }: { onFile: (file: File) => void; onBack: () => void }) {
  const [query, setQuery] = useState('')
  const [whiteBg, setWhiteBg] = useState(true)
  const [link, setLink] = useState('')
  const [busy, setBusy] = useState<'paste' | 'link' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showLinkHint, setShowLinkHint] = useState(false)

  const search = () => {
    const q = query.trim()
    if (!q) return
    window.open(googleImagesUrl(whiteBg ? `${q} sfondo bianco` : q), '_blank', 'noopener')
  }

  const fromUrl = async (url: string, kind: 'paste' | 'link') => {
    setBusy(kind)
    try {
      onFile(await downloadImage(url))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Download non riuscito.')
    } finally {
      setBusy(null)
    }
  }

  const paste = async () => {
    setError(null)
    setBusy('paste')
    let content
    try {
      content = await readClipboard()
    } catch (e) {
      setBusy(null)
      // permesso negato o browser senza accesso agli appunti: resta il campo link
      console.warn(e)
      setShowLinkHint(true)
      setError('Non riesco a leggere gli appunti. Incolla il link qui sotto.')
      return
    }
    if (content.kind === 'file') {
      setBusy(null)
      onFile(content.file)
    } else if (content.kind === 'url') {
      await fromUrl(content.url, 'paste')
    } else {
      setBusy(null)
      setError('Negli appunti non c’è un’immagine. Tieni premuta l’immagine e scegli “Copia”.')
    }
  }

  const importLink = () => {
    setError(null)
    const url = extractImageUrl(link)
    if (!url) {
      setError('Questo non sembra un link.')
      return
    }
    fromUrl(url, 'link')
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-2">
          <span className="text-label font-medium text-fg-muted">Cosa cerchi?</span>
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                search()
              }
            }}
            placeholder="Es. giacca di jeans uomo"
            enterKeyHint="search"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Chip selected={whiteBg} onClick={() => setWhiteBg((v) => !v)}>
            Su sfondo bianco
          </Chip>
        </div>
        <Button variant="secondary" disabled={!query.trim()} onClick={search}>
          <Search className="size-5 text-accent" aria-hidden />
          Cerca su Google
        </Button>
      </div>

      <ol className="flex flex-col gap-1 rounded-input bg-surface-muted p-3 text-caption">
        <li>1. Tocca l’immagine per aprirla grande.</li>
        <li>2. Tienila premuta e scegli “Copia”.</li>
        <li>3. Torna qui e premi “Incolla immagine”.</li>
      </ol>

      <Button onClick={paste} disabled={busy !== null}>
        {busy === 'paste' ? <Spinner /> : <ClipboardPaste className="size-5" aria-hidden />}
        {busy === 'paste' ? 'Scarico l’immagine…' : 'Incolla immagine'}
      </Button>

      <div className="flex flex-col gap-2">
        <span className="text-label font-medium text-fg-muted">Oppure incolla il link dell’immagine</span>
        <div className="flex gap-2">
          <Input
            type="url"
            inputMode="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                importLink()
              }
            }}
            placeholder="https://…"
            aria-label="Link dell’immagine"
            enterKeyHint="go"
            autoFocus={showLinkHint}
          />
          <button
            type="button"
            onClick={importLink}
            disabled={!link.trim() || busy !== null}
            aria-label="Importa immagine dal link"
            className="flex size-12 shrink-0 items-center justify-center rounded-input bg-accent text-on-accent disabled:opacity-40"
          >
            {busy === 'link' ? <Spinner className="size-5" /> : <ArrowRight className="size-5" />}
          </button>
        </div>
        <p className="text-caption text-fg-muted">Va bene anche il link della pagina del prodotto.</p>
      </div>

      {error && (
        <p role="alert" className="text-caption text-danger">
          {error}
        </p>
      )}

      <Button variant="ghost" size="md" onClick={onBack}>
        <ArrowLeft className="size-5" aria-hidden />
        Indietro
      </Button>
    </div>
  )
}
