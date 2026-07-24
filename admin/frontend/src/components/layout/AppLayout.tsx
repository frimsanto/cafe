import { useState } from 'react'
import type { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

interface AppLayoutProps {
  judul: string
  children: ReactNode
}

export function AppLayout({ judul, children }: AppLayoutProps) {
  const [menuTerbuka, setMenuTerbuka] = useState(false)

  return (
    <div className="min-h-dvh bg-plane">
      <Sidebar terbuka={menuTerbuka} onTutup={() => setMenuTerbuka(false)} />

      <div className="lg:pl-64">
        <Topbar judul={judul} onBukaMenu={() => setMenuTerbuka(true)} />
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
          {children}
        </main>
      </div>
    </div>
  )
}
