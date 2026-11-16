import { motion } from 'framer-motion'
import { CATEGORIES, CATEGORY_LABEL, type Category } from '@/lib/garments'
import { cn } from '@/lib/utils'

export type CategoryFilter = Category | 'tutto'

const TABS: { key: CategoryFilter; label: string }[] = [
  { key: 'tutto', label: 'Tutto' },
  ...CATEGORIES.map((c) => ({ key: c, label: CATEGORY_LABEL[c] })),
]

/** Tab categorie scorrevoli con sottolineatura accent animata (DESIGN.md). */
export function CategoryTabs({ value, onChange }: { value: CategoryFilter; onChange: (v: CategoryFilter) => void }) {
  return (
    <div
      role="tablist"
      aria-label="Categorie"
      className="-mx-gutter flex gap-6 overflow-x-auto px-gutter [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {TABS.map((t) => {
        const active = t.key === value
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={active}
            onClick={(e) => {
              onChange(t.key)
              e.currentTarget.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
            }}
            className={cn(
              'relative min-h-11 shrink-0 whitespace-nowrap text-body font-medium transition-colors',
              active ? 'text-accent' : 'text-fg-muted',
            )}
          >
            {t.label}
            {active && (
              <motion.span
                layoutId="category-underline"
                className="absolute inset-x-0 bottom-1 h-0.5 rounded-full bg-accent"
                transition={{ type: 'spring', stiffness: 400, damping: 35 }}
              />
            )}
          </button>
        )
      })}
    </div>
  )
}
