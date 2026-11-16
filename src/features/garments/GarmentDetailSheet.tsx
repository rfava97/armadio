import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Pencil, Shirt, Trash2 } from 'lucide-react'
import { BottomSheet } from '@/components/BottomSheet'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/toast'
import { CATEGORY_SINGULAR } from '@/lib/garments'
import { colorName } from '@/lib/colors'
import { useDeleteGarment, useSignedImage, useUpdateGarment, type GarmentWithThumb } from './api'
import { GarmentForm } from './GarmentForm'
import { isFormComplete, type FormValues } from './form'

type Mode = 'view' | 'edit' | 'confirm-delete'

const toValues = (g: GarmentWithThumb): FormValues => ({
  name: g.name,
  category: g.category,
  color: g.color,
  tags: g.tags,
})

export function GarmentDetailSheet({ garment, onClose }: { garment: GarmentWithThumb | null; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>('view')
  const [values, setValues] = useState<FormValues | null>(null)
  const [shownId, setShownId] = useState<string | null>(null)

  // nuovo capo aperto → riparte dalla vista
  if (garment && garment.id !== shownId) {
    setShownId(garment.id)
    setMode('view')
    setValues(toValues(garment))
  }

  const state = garment && values ? { garment, mode, values, setMode, setValues } : null
  return (
    <BottomSheet
      open={!!garment}
      onClose={onClose}
      title={garment?.name ?? ''}
      footer={state ? <Footer {...state} onClose={onClose} /> : null}
    >
      {state && <Body {...state} />}
    </BottomSheet>
  )
}

type State = {
  garment: GarmentWithThumb
  mode: Mode
  values: FormValues
  setMode: (m: Mode) => void
  setValues: (v: FormValues) => void
}

function Body({ garment, mode, values, setValues }: State) {
  const { data: url } = useSignedImage(garment.image_path)
  const src = url ?? garment.thumbUrl

  if (mode === 'edit') {
    return <GarmentForm value={values} onChange={setValues} suggestedColor={garment.color} />
  }

  const color = colorName(garment.color)
  return (
    <div className="flex flex-col gap-5">
      <div className="flex aspect-[4/5] w-full items-center justify-center rounded-card bg-surface-muted p-6">
        {src ? (
          <img src={src} alt={garment.name} className="h-full w-full object-contain" />
        ) : (
          <Shirt className="size-12 text-fg-muted" aria-hidden />
        )}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-body">
        <dt className="text-fg-muted">Categoria</dt>
        <dd>{CATEGORY_SINGULAR[garment.category]}</dd>
        <dt className="text-fg-muted">Colore</dt>
        <dd className="flex items-center gap-2">
          {garment.color && (
            <span
              className="size-4 rounded-full border border-border"
              style={{ backgroundColor: garment.color }}
              aria-hidden
            />
          )}
          {color ?? '–'}
        </dd>
        <dt className="text-fg-muted">Tag</dt>
        <dd>{garment.tags.length ? garment.tags.join(', ') : '–'}</dd>
      </dl>
      {mode === 'confirm-delete' && (
        <p role="alert" className="rounded-input bg-surface-muted p-4 text-body">
          Eliminare <strong>{garment.name}</strong>? L'operazione non si può annullare.
        </p>
      )}
    </div>
  )
}

function Footer({ garment, mode, values, setMode, onClose }: State & { onClose: () => void }) {
  const navigate = useNavigate()
  const toast = useToast()
  const updateMut = useUpdateGarment()
  const deleteMut = useDeleteGarment()

  const close = onClose

  if (mode === 'edit') {
    return (
      <div className="flex flex-col gap-2">
        <Button
          disabled={!isFormComplete(values) || updateMut.isPending}
          onClick={() =>
            updateMut.mutate(
              { id: garment.id, ...values, category: values.category! },
              {
                onSuccess: () => {
                  toast('Modifiche salvate')
                  close()
                },
              },
            )
          }
        >
          {updateMut.isPending && <Loader2 className="size-5 animate-spin" aria-hidden />}
          Salva modifiche
        </Button>
        <Button variant="ghost" size="md" onClick={() => setMode('view')}>
          Annulla
        </Button>
        {updateMut.error && <p className="text-caption text-danger">{updateMut.error.message}</p>}
      </div>
    )
  }

  if (mode === 'confirm-delete') {
    return (
      <div className="flex flex-col gap-2">
        <Button
          variant="danger"
          disabled={deleteMut.isPending}
          onClick={() =>
            deleteMut.mutate(garment, {
              onSuccess: () => {
                toast('Capo eliminato')
                close()
              },
            })
          }
        >
          {deleteMut.isPending ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Trash2 className="size-5" aria-hidden />}
          Elimina definitivamente
        </Button>
        <Button variant="ghost" size="md" onClick={() => setMode('view')}>
          Annulla
        </Button>
        {deleteMut.error && <p className="text-caption text-danger">{deleteMut.error.message}</p>}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <Button onClick={() => navigate('/outfit', { state: { garmentId: garment.id } })}>Prova nel camerino</Button>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" size="md" onClick={() => setMode('edit')}>
          <Pencil className="size-4" aria-hidden />
          Modifica
        </Button>
        <Button
          variant="secondary"
          size="md"
          className="text-danger [&_svg]:text-danger"
          onClick={() => setMode('confirm-delete')}
        >
          <Trash2 className="size-4" aria-hidden />
          Elimina
        </Button>
      </div>
    </div>
  )
}
