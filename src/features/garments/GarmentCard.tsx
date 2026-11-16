import { useState } from 'react'
import { Shirt } from 'lucide-react'
import { CATEGORY_SINGULAR } from '@/lib/garments'
import { cachedMassScale, massScale } from '@/lib/image/visualMass'
import { cn } from '@/lib/utils'
import type { GarmentWithThumb } from './api'

export function GarmentCard({ garment, onOpen }: { garment: GarmentWithThumb; onOpen: () => void }) {
  const key = garment.image_path
  const [scale, setScale] = useState<number | undefined>(() => cachedMassScale(key))
  const pct = `${(scale ?? 1) * 100}%`

  return (
    <button type="button" onClick={onOpen} className="flex flex-col text-left">
      <div className="flex aspect-[4/5] w-full items-center justify-center rounded-card bg-surface-muted p-3 shadow-card">
        {garment.thumbUrl ? (
          <img
            src={garment.thumbUrl}
            alt={garment.name}
            // serve per leggere i pixel e calcolare la "massa" del capo
            crossOrigin="anonymous"
            loading="lazy"
            decoding="async"
            onLoad={(e) => scale === undefined && setScale(massScale(key, e.currentTarget))}
            style={{ width: pct, height: pct }}
            className={cn('object-contain transition-opacity', scale === undefined ? 'opacity-0' : 'opacity-100')}
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
