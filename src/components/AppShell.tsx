import { Outlet } from 'react-router-dom'
import { BottomBar } from './BottomBar'

export function AppShell() {
  return (
    <div className="mx-auto min-h-dvh max-w-2xl px-gutter pt-[calc(env(safe-area-inset-top)+16px)] pb-[calc(env(safe-area-inset-bottom)+104px)]">
      <Outlet />
      <BottomBar />
    </div>
  )
}
