import { useCallback, useEffect, useRef, useState } from 'react'
import { Brush, Check, Eraser, RotateCcw } from 'lucide-react'
import { BottomSheet } from '@/components/BottomSheet'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/Spinner'
import { cn } from '@/lib/utils'
import { hoodMask } from '@/lib/onMe'
import { ctx2d, makeCanvas, releaseCanvas } from '@/lib/image/canvas'
import type { Retouch, RetouchKind } from './api'

type Props = {
  open: boolean
  onClose: () => void
  /** nome del capo (e del modo) nel titolo */
  name: string
  /** livello "su di me" del capo */
  layerUrl: string
  /** livelli dei capi sopra, dal più interno: si vedono in trasparenza mentre ritocchi */
  above: string[]
  /** riga delle spalle nel fotogramma dei livelli (per il colletto automatico) */
  shoulder: number
  /** ritocchi già salvati */
  current?: Retouch
  onSave: (changes: Partial<Record<RetouchKind, Blob | null>>) => void
  saving: boolean
  error: string | null
}

type Tool = 'brush' | 'eraser'
/** zona del livello mostrata e ritoccata */
type View = { x: number; y: number; w: number; h: number }

const BG = '#f3f1ec'
const TINT: Record<RetouchKind, string> = { collar: '#16a34a', hem: '#dc2626' }

const load = async (u: string) => createImageBitmap(await (await fetch(u)).blob())

/** riga più bassa con il capo, nelle colonne centrali (per inquadrare l'orlo dei capi sopra) */
function hemRow(img: ImageBitmap) {
  const c = makeCanvas(img.width, img.height)
  const ctx = ctx2d(c)
  ctx.drawImage(img, 0, 0)
  const x0 = Math.round(img.width * 0.4)
  const w = Math.round(img.width * 0.2)
  const d = ctx.getImageData(x0, 0, w, img.height).data
  releaseCanvas(c)
  for (let y = img.height - 1; y >= 0; y--) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 128) return y
  return Math.round(img.height * 0.55)
}

/** prima riga con il capo (la cima del colletto) */
function topRow(img: ImageBitmap) {
  const c = makeCanvas(img.width, img.height)
  const ctx = ctx2d(c)
  ctx.drawImage(img, 0, 0)
  const d = ctx.getImageData(0, 0, img.width, img.height).data
  releaseCanvas(c)
  for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) if (d[(y * img.width + x) * 4 + 3] > 128) return y
  return 0
}

/**
 * Ritocco a mano di un livello "su di me", con il dito:
 * - Colletto: colori di verde la parte che esce sopra i capi sopra (si parte dal colletto trovato da solo);
 * - Orlo: colori di rosso la parte del capo da nascondere quando ci sono capi sopra (es. una fascia che
 *   esce sotto la giacca).
 * I capi sopra si vedono in trasparenza. Pennello e gomma, con la dimensione del tratto.
 */
export function RetouchSheet({ open, onClose, name, layerUrl, above, shoulder, current, onSave, saving, error }: Props) {
  const [tab, setTab] = useState<RetouchKind>('collar')
  const [tool, setTool] = useState<Tool>('brush')
  const [size, setSize] = useState(0.025)
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  // cosa è cambiato: per il colletto anche "torna automatico" (si toglie il ritocco)
  const [dirty, setDirty] = useState<Partial<Record<RetouchKind, 'paint' | 'auto'>>>({})

  const view = useRef<HTMLCanvasElement>(null)
  const layer = useRef<ImageBitmap | null>(null)
  const ghosts = useRef<ImageBitmap[]>([])
  const masks = useRef<Partial<Record<RetouchKind, HTMLCanvasElement>>>({})
  const views = useRef<Partial<Record<RetouchKind, View>>>({})
  const tint = useRef<HTMLCanvasElement | null>(null)
  const frame = useRef(0)
  const last = useRef<{ x: number; y: number } | null>(null)

  // dipendenze stabili (gli array e gli oggetti cambiano a ogni render del camerino)
  const aboveKey = above.join('\n')
  const collarUrl = current?.collar
  const hemUrl = current?.hem

  // il colletto trovato da solo, nel fotogramma del livello
  const autoCollar = useCallback(
    async (into: HTMLCanvasElement) => {
      const ctx = ctx2d(into)
      ctx.clearRect(0, 0, into.width, into.height)
      const m = await hoodMask(layerUrl, shoulder, aboveKey ? aboveKey.split('\n') : [], Math.max(into.width, into.height))
      if (m) {
        ctx.drawImage(m, 0, 0, into.width, into.height)
        releaseCanvas(m)
      }
    },
    [layerUrl, shoulder, aboveKey],
  )

  // carica livello, capi sopra e ritocchi
  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      const img = await load(layerUrl)
      const ghostImgs = await Promise.all(aboveKey ? aboveKey.split('\n').map(load) : [])
      const W = img.width
      const H = img.height
      const collar = makeCanvas(W, H)
      const hem = makeCanvas(W, H)
      if (collarUrl) {
        const b = await load(collarUrl)
        ctx2d(collar).drawImage(b, 0, 0, W, H)
        b.close()
      } else await autoCollar(collar)
      if (hemUrl) {
        const b = await load(hemUrl)
        ctx2d(hem).drawImage(b, 0, 0, W, H)
        b.close()
      }
      // inquadrature: il colletto in alto al centro, l'orlo attorno all'orlo dei capi sopra
      const top = topRow(img)
      const vw = Math.round(W * 0.28)
      const collarView = { x: Math.round((W - vw) / 2), y: Math.max(0, top - Math.round(H * 0.015)), w: vw, h: Math.round(vw * 0.75) }
      const hemY = ghostImgs.length ? Math.max(...ghostImgs.map(hemRow)) : hemRow(img)
      const hw = Math.round(W * 0.7)
      const hh = Math.round(hw * 0.7)
      const hemView = { x: Math.round((W - hw) / 2), y: Math.min(H - hh, Math.max(0, hemY - Math.round(hh * 0.55))), w: hw, h: hh }
      if (cancelled) {
        img.close()
        ghostImgs.forEach((g) => g.close())
        releaseCanvas(collar)
        releaseCanvas(hem)
        return
      }
      layer.current = img
      ghosts.current = ghostImgs
      masks.current = { collar, hem }
      views.current = { collar: collarView, hem: hemView }
      setReady(true)
    })().catch((e) => {
      console.error(e)
      if (!cancelled) setLoadError('Non riesco a caricare il capo.')
    })
    return () => {
      cancelled = true
      layer.current?.close()
      ghosts.current.forEach((g) => g.close())
      layer.current = null
      ghosts.current = []
      Object.values(masks.current).forEach((m) => m && releaseCanvas(m))
      masks.current = {}
      if (tint.current) releaseCanvas(tint.current)
      tint.current = null
    }
  }, [open, layerUrl, aboveKey, collarUrl, hemUrl, autoCollar])

  // disegna la zona: capo, capi sopra in trasparenza, la parte colorata
  const draw = useCallback(() => {
    const c = view.current
    const img = layer.current
    const v = views.current[tab]
    const mask = masks.current[tab]
    if (!c || !img || !v || !mask) return
    const ctx = ctx2d(c)
    ctx.globalAlpha = 1
    ctx.fillStyle = BG
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.drawImage(img, v.x, v.y, v.w, v.h, 0, 0, c.width, c.height)
    ctx.globalAlpha = 0.45
    for (const g of ghosts.current) ctx.drawImage(g, v.x * (g.width / img.width), v.y * (g.height / img.height), v.w * (g.width / img.width), v.h * (g.height / img.height), 0, 0, c.width, c.height)
    if (!tint.current) tint.current = makeCanvas(c.width, c.height)
    const t = tint.current
    if (t.width !== c.width || t.height !== c.height) {
      t.width = c.width
      t.height = c.height
    }
    const tctx = ctx2d(t)
    tctx.globalCompositeOperation = 'source-over'
    tctx.clearRect(0, 0, t.width, t.height)
    tctx.drawImage(mask, v.x, v.y, v.w, v.h, 0, 0, t.width, t.height)
    // il colore solo dove c'è il capo: il vuoto del collo non conta
    tctx.globalCompositeOperation = 'destination-in'
    tctx.drawImage(img, v.x, v.y, v.w, v.h, 0, 0, t.width, t.height)
    tctx.globalCompositeOperation = 'source-in'
    tctx.fillStyle = TINT[tab]
    tctx.fillRect(0, 0, t.width, t.height)
    ctx.globalAlpha = 0.5
    ctx.drawImage(t, 0, 0)
    ctx.globalAlpha = 1
  }, [tab])

  const redraw = useCallback(() => {
    cancelAnimationFrame(frame.current)
    frame.current = requestAnimationFrame(draw)
  }, [draw])

  // dimensione del disegno: la larghezza dello schermo, con la proporzione della zona
  useEffect(() => {
    if (!ready) return
    const c = view.current
    const v = views.current[tab]
    if (!c || !v) return
    const w = Math.round(Math.min(c.clientWidth || 360, 720) * Math.min(2, window.devicePixelRatio || 1))
    c.width = w
    c.height = Math.round((w * v.h) / v.w)
    redraw()
  }, [ready, tab, redraw])

  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  // dal dito al punto del livello
  const toLayer = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = e.currentTarget
    const r = c.getBoundingClientRect()
    const v = views.current[tab]!
    return { x: v.x + ((e.clientX - r.left) / r.width) * v.w, y: v.y + ((e.clientY - r.top) / r.height) * v.h }
  }
  const paint = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const mask = masks.current[tab]
    const img = layer.current
    if (!mask || !img) return
    const ctx = ctx2d(mask)
    ctx.globalCompositeOperation = tool === 'brush' ? 'source-over' : 'destination-out'
    ctx.strokeStyle = '#000'
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = size * img.width
    ctx.beginPath()
    ctx.moveTo(from.x, from.y)
    ctx.lineTo(to.x + 0.01, to.y)
    ctx.stroke()
    ctx.globalCompositeOperation = 'source-over'
    setDirty((d) => (d[tab] === 'paint' ? d : { ...d, [tab]: 'paint' }))
    redraw()
  }

  const reset = async () => {
    const mask = masks.current[tab]
    if (!mask) return
    if (tab === 'collar') await autoCollar(mask)
    else ctx2d(mask).clearRect(0, 0, mask.width, mask.height)
    setDirty((d) => ({ ...d, [tab]: 'auto' }))
    redraw()
  }

  const save = async () => {
    const changes: Partial<Record<RetouchKind, Blob | null>> = {}
    for (const k of ['collar', 'hem'] as RetouchKind[]) {
      const how = dirty[k]
      const mask = masks.current[k]
      if (!how || !mask) continue
      if (how === 'auto') {
        changes[k] = null
        continue
      }
      // un orlo senza niente di colorato: nessun ritocco
      const d = ctx2d(mask).getImageData(0, 0, mask.width, mask.height).data
      let any = false
      for (let i = 3; i < d.length && !any; i += 4) if (d[i] > 0) any = true
      changes[k] = any || k === 'collar' ? await new Promise<Blob | null>((ok) => mask.toBlob(ok, 'image/png')) : null
    }
    onSave(changes)
  }

  const changed = Object.keys(dirty).length > 0
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={`Ritocca ${name}`}
      footer={
        <div className="flex gap-2">
          <Button variant="secondary" size="md" className="h-11 flex-1" onClick={onClose} disabled={saving}>
            Annulla
          </Button>
          <Button size="md" className="h-11 flex-1" onClick={save} disabled={!changed || saving || !ready}>
            {saving ? <Spinner /> : <Check className="size-4" aria-hidden />}
            {saving ? 'Attendi…' : 'Salva'}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex rounded-full bg-surface-muted p-0.5" role="tablist">
          {(
            [
              ['collar', 'Colletto'],
              ['hem', 'Orlo'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={cn('h-9 flex-1 rounded-full text-caption font-semibold', tab === k ? 'bg-navy text-on-accent' : 'text-fg')}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-caption text-fg-muted">
          {tab === 'collar'
            ? 'Colora di verde la parte del colletto che esce sopra i capi sopra. I capi sopra si vedono in trasparenza.'
            : 'Colora di rosso la parte del capo da nascondere quando ci sono capi sopra (per esempio una fascia che esce sotto la giacca).'}
        </p>
        <div className="relative overflow-hidden rounded-card border border-border bg-garment-bg">
          <canvas
            ref={view}
            className="block w-full touch-none"
            style={{ aspectRatio: tab === 'collar' ? '4 / 3' : '10 / 7' }}
            onPointerDown={(e) => {
              if (!ready || saving) return
              e.currentTarget.setPointerCapture(e.pointerId)
              const p = toLayer(e)
              last.current = p
              paint(p, p)
            }}
            onPointerMove={(e) => {
              if (!last.current) return
              const p = toLayer(e)
              paint(last.current, p)
              last.current = p
            }}
            onPointerUp={() => (last.current = null)}
            onPointerCancel={() => (last.current = null)}
          />
          {!ready && (
            <div className="absolute inset-0 flex items-center justify-center">
              {loadError ? <p className="text-caption text-danger">{loadError}</p> : <Spinner className="size-6 text-accent" />}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-full bg-surface-muted p-0.5">
            <button
              type="button"
              aria-pressed={tool === 'brush'}
              onClick={() => setTool('brush')}
              className={cn('flex h-9 items-center gap-1.5 rounded-full px-3 text-caption font-semibold', tool === 'brush' ? 'bg-navy text-on-accent' : 'text-fg')}
            >
              <Brush className="size-4" aria-hidden />
              Pennello
            </button>
            <button
              type="button"
              aria-pressed={tool === 'eraser'}
              onClick={() => setTool('eraser')}
              className={cn('flex h-9 items-center gap-1.5 rounded-full px-3 text-caption font-semibold', tool === 'eraser' ? 'bg-navy text-on-accent' : 'text-fg')}
            >
              <Eraser className="size-4" aria-hidden />
              Gomma
            </button>
          </div>
          <button
            type="button"
            onClick={reset}
            disabled={!ready || saving}
            className="ml-auto flex h-9 items-center gap-1 rounded-full px-2 text-caption text-fg-muted disabled:opacity-40"
          >
            <RotateCcw className="size-4" aria-hidden />
            {tab === 'collar' ? 'Automatico' : 'Cancella'}
          </button>
        </div>
        <label className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center gap-2 text-caption">
          <span className="text-fg-muted">Tratto</span>
          <input
            type="range"
            min={0.006}
            max={0.06}
            step={0.002}
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
            className="h-8 w-full min-w-0 accent-[var(--color-accent)]"
          />
        </label>
        {error && <p className="text-caption text-danger">{error}</p>}
      </div>
    </BottomSheet>
  )
}
