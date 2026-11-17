import { NavLink } from 'react-router-dom'
import { Shirt, User } from 'lucide-react'
import { HangerIcon } from './HangerIcon'
import { cn } from '@/lib/utils'

const tabs = [
  { to: '/armadio', label: 'Armadio', Icon: HangerIcon, fillable: false },
  { to: '/outfit', label: 'Outfit', Icon: Shirt, fillable: true },
  { to: '/profilo', label: 'Profilo', Icon: User, fillable: true },
] as const

export function BottomBar() {
  return (
    <nav
      aria-label="Navigazione principale"
      className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-gutter pb-[max(12px,env(safe-area-inset-bottom))]"
    >
      <ul className="flex w-full max-w-sm items-center justify-between gap-1 wood rounded-full p-1.5">
        {tabs.map(({ to, label, Icon, fillable }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-full py-1.5 text-[12px] font-medium transition-colors',
                  isActive ? 'bg-champagne text-accent shadow-card' : 'text-champagne/80',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className="size-6"
                    aria-hidden
                    fill={isActive && fillable ? 'currentColor' : 'none'}
                    strokeWidth={isActive ? 2.4 : 2}
                  />
                  {label}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}
