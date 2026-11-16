import { useState } from 'react'
import { Shirt } from 'lucide-react'
import { CATEGORY_SINGULAR } from '@/lib/garments'
import { cachedMassScale, massScale } from '@/lib/image/visualMass'
import { cn } from '@/lib/utils'
import type { GarmentWithThumb } from './api'

export function GarmentCard({ garment, onOpen }: { garment: GarmentWithThumb; onOpen: () => void }) {
  const key = garment.image_path
  const [scale, setScale] = useState<number | undefined>(() => cachedMassScale(key))
  // 24px = margine interno attorno al capo
  const size = `calc((100% - 24px) * ${scale ?? 1})`

  return (
    <button type="button" onClick={onOpen} className="flex min-w-0 flex-col text-left">
      {/* il riquadro ha sempre la stessa forma: l'immagine è posizionata in assoluto e non può allargarlo */}
      <div className="relative aspect-[4/5] w-full overflow-hidden rounded-card bg-garment-bg shadow-card">
        {garment.thumbUrl ? (
          <img
            src={garment.thumbUrl}
            alt={garment.name}
            // serve per leggere i pixel e calcolare la "massa" del capo
            crossOrigin="anonymous"
            loading="lazy"
            decoding="async"
            onLoad={(e) => scale === undefined && setScale(massScale(key, e.currentTarget))}
            style={{ width: size, height: size }}
            className={cn('absolute inset-0 m-auto object-contain transition-opacity', scale === undefined ? 'opacity-0' : 'opacity-100')}
          />
        ) : (
          <Shirt className="absolute inset-0 m-auto size-10 text-fg-muted" aria-hidden />
        )}
      </div>
      <span className="mt-2 truncate font-display text-[19px] font-semibold leading-6">{garment.name}</span>
      <span className="truncate text-overline font-medium uppercase text-fg-muted">{CATEGORY_SINGULAR[garment.category]}</span>
    </button>
  )
}
