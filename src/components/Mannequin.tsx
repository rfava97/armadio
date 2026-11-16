import { useId, useMemo } from 'react'
import { ANCHOR_KEYS, buildMannequin, VIEW, type Measures } from '@/lib/mannequin'
import { cn } from '@/lib/utils'

/**
 * Manichino SVG parametrico (DESIGN: colore --mannequin con ombre --mannequin-shadow).
 * Il riquadro è fisso in centimetri: cambiare l'altezza cambia davvero la figura.
 */
export function Mannequin({
  measures,
  className,
  showAnchors = false,
}: {
  measures: Measures
  className?: string
  showAnchors?: boolean
}) {
  const shape = useMemo(() => buildMannequin(measures), [measures])
  const id = useId().replace(/:/g, '')
  const fill = `url(#${id}-g)`

  return (
    <svg
      viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`}
      preserveAspectRatio="xMidYMax meet"
      className={cn('block', className)}
      role="img"
      aria-label={`Manichino, altezza ${Math.round(measures.height_cm)} cm`}
    >
      <defs>
        {/* volume: ombra ai bordi, luce al centro */}
        <linearGradient id={`${id}-g`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="var(--mannequin-shadow)" />
          <stop offset="0.28" stopColor="var(--mannequin)" />
          <stop offset="0.5" stopColor="var(--surface)" stopOpacity="0.9" />
          <stop offset="0.72" stopColor="var(--mannequin)" />
          <stop offset="1" stopColor="var(--mannequin-shadow)" />
        </linearGradient>
      </defs>

      <ellipse {...shape.floor} fill="var(--mannequin-shadow)" opacity="0.45" />
      {shape.arms.map((d, i) => (
        <path key={`a${i}`} d={d} fill={fill} />
      ))}
      {shape.feet.map((f, i) => (
        <ellipse key={`f${i}`} {...f} fill="var(--mannequin-shadow)" />
      ))}
      {/* busto e gambe in un solo tracciato: un'unica sfumatura, nessuna giuntura visibile */}
      <path d={`${shape.torso}${shape.legs[0]}${shape.legs[1]}`} fill={fill} />
      <path d={shape.neck} fill={fill} />
      <ellipse {...shape.head} fill={fill} />

      {showAnchors &&
        ANCHOR_KEYS.map((k) => (
          <circle
            key={k}
            cx={VIEW.x + shape.anchors[k].x * VIEW.w}
            cy={VIEW.y + shape.anchors[k].y * VIEW.h}
            r={1.6}
            fill="var(--accent)"
            stroke="var(--surface)"
            strokeWidth={0.6}
          />
        ))}
    </svg>
  )
}
