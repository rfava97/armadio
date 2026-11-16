import { Shirt } from 'lucide-react'
import { CATEGORY_SINGULAR } from '@/lib/garments'
import type { GarmentWithThumb } from './api'

export function GarmentCard({ garment, onOpen }: { garment: GarmentWithThumb; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="flex flex-col text-left">
      <div className="flex aspect-[4/5] w-full items-center justify-center rounded-card bg-surface-muted p-3 shadow-card">
        {garment.thumbUrl ? (
          <img
            src={garment.thumbUrl}
            alt={garment.name}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-contain"
          />
        ) : (
          <Shirt className="size-10 text-fg-muted" aria-hidden />
        )}
      </div>
      <span className="mt-2 line-clamp-2 text-card font-medium">{garment.name}</span>
      <span className="text-caption text-fg-muted">{CATEGORY_SINGULAR[garment.category]}</span>
    </button>
  )
}
