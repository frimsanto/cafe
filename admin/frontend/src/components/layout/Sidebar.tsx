import type { ComponentType, SVGProps } from 'react'
import { NavLink } from 'react-router-dom'
import {
  IkonAplikasi,
  IkonBilling,
  IkonBroadcast,
  IkonDashboard,
  IkonTenant,
  IkonTutup,
} from '../ui/ikon'

interface ItemMenu {
  label: string
  ikon: ComponentType<SVGProps<SVGSVGElement>>
  /** Kosong berarti halamannya belum dibangun — ditandai fase berapa. */
  tujuan?: string
  fase?: string
}

/** Urutan menu mengikuti roadmap fase pada PRD. */
const MENU: ItemMenu[] = [
  { label: 'Dashboard', ikon: IkonDashboard, tujuan: '/dashboard' },
  { label: 'Manajemen Tenant', ikon: IkonTenant, fase: 'Fase 2' },
  { label: 'Billing & Pembayaran', ikon: IkonBilling, fase: 'Fase 2' },
  { label: 'Manajemen Aplikasi', ikon: IkonAplikasi, fase: 'Fase 2' },
  { label: 'Notifikasi & Broadcast', ikon: IkonBroadcast, fase: 'Fase 3' },
]

interface SidebarProps {
  terbuka: boolean
  onTutup: () => void
}

export function Sidebar({ terbuka, onTutup }: SidebarProps) {
  return (
    <>
      {terbuka && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={onTutup}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-hairline bg-surface transition-transform duration-200 lg:translate-x-0 ${
          terbuka ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center justify-between gap-2 border-b border-hairline px-5">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">FES Solution</p>
            <p className="truncate text-xs text-ink-muted">Panel Super Admin</p>
          </div>
          <button
            type="button"
            onClick={onTutup}
            className="-mr-1 rounded-md p-1.5 text-ink-secondary hover:bg-wash lg:hidden"
            aria-label="Tutup menu"
          >
            <IkonTutup className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto p-3" aria-label="Menu utama">
          <ul className="space-y-1">
            {MENU.map(({ label, ikon: Ikon, tujuan, fase }) => (
              <li key={label}>
                {tujuan ? (
                  <NavLink
                    to={tujuan}
                    onClick={onTutup}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                        isActive
                          ? 'bg-wash font-medium text-ink'
                          : 'text-ink-secondary hover:bg-wash hover:text-ink'
                      }`
                    }
                  >
                    <Ikon className="h-5 w-5 shrink-0" />
                    <span className="truncate">{label}</span>
                  </NavLink>
                ) : (
                  <span
                    className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm text-ink-muted"
                    aria-disabled="true"
                    title={`Dibangun pada ${fase}`}
                  >
                    <Ikon className="h-5 w-5 shrink-0" />
                    <span className="truncate">{label}</span>
                  </span>
                )}
              </li>
            ))}
          </ul>

          <p className="mt-4 px-3 text-xs leading-relaxed text-ink-muted">
            Menu yang belum aktif menyusul di Fase 2–3.
          </p>
        </nav>

        <div className="border-t border-hairline px-5 py-4">
          <p className="text-xs text-ink-muted">
            Akses terbatas untuk pemilik platform.
          </p>
        </div>
      </aside>
    </>
  )
}
