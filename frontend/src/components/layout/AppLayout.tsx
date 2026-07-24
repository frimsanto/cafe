import { useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { ROLE_LABEL, type UserRole } from '../../types/auth';

interface NavItem {
  label: string;
  icon: string;
  /** Tujuan navigasi; kosong berarti halaman belum dibangun. */
  to?: string;
}

/**
 * Menu navigasi per peran — staf hanya melihat area yang menjadi tanggung
 * jawabnya (pembagian hak akses sederhana sesuai PRD).
 */
const NAV_BY_ROLE: Record<UserRole, NavItem[]> = {
  OWNER: [
    { label: 'Dasbor', icon: '📊', to: '/dasbor' },
    { label: 'Menu Kafe', icon: '🍽️', to: '/dasbor/menu' },
    { label: 'Manajemen Menu', icon: '🧾', to: '/dasbor/manajemen-menu' },
    { label: 'Kasir', icon: '💳', to: '/kasir' },
    { label: 'Layar Dapur', icon: '🍳', to: '/dapur' },
    { label: 'Manajemen Meja', icon: '🪑', to: '/dasbor/meja' },
  ],
  KASIR: [
    { label: 'Kasir', icon: '💳', to: '/kasir' },
    { label: 'Layar Dapur', icon: '🍳', to: '/dapur' },
  ],
  DAPUR: [{ label: 'Layar Dapur', icon: '🍳', to: '/dapur' }],
};

interface AppLayoutProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * Kerangka aplikasi untuk staf & pemilik: sidebar tetap pada layar besar dan
 * drawer pada layar kecil, dengan identitas pengguna, peran, dan kafe (tenant)
 * yang sedang aktif.
 */
export default function AppLayout({
  title,
  subtitle,
  actions,
  children,
}: AppLayoutProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);

  const navItems = user ? NAV_BY_ROLE[user.role] : [];

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const sidebar = (
    <div className="flex h-full flex-col">
      {/* Merek + tenant aktif */}
      <div className="flex items-center gap-2.5 px-5 py-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-lg text-white">
          ☕
        </span>
        <div className="min-w-0">
          <p className="truncate font-bold leading-tight text-slate-900">CafeOS</p>
          <p className="truncate text-xs text-slate-500">
            {user?.cafeName ?? 'Belum masuk'}
          </p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {navItems.map((item) => {
          const active = item.to !== undefined && location.pathname === item.to;
          const base =
            'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition';

          if (!item.to) {
            return (
              <span
                key={item.label}
                className={`${base} cursor-not-allowed text-slate-400`}
              >
                <span className="text-base">{item.icon}</span>
                <span className="flex-1 text-left">{item.label}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Segera
                </span>
              </span>
            );
          }

          return (
            <Link
              key={item.label}
              to={item.to}
              onClick={() => setNavOpen(false)}
              className={`${base} ${
                active
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              <span className="flex-1 text-left">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Identitas pengguna + keluar */}
      <div className="border-t border-slate-200 p-4">
        {user ? (
          <>
            <div className="flex items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-700">
                {user.name.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800">
                  {user.name}
                </p>
                <p className="truncate text-xs text-slate-500">
                  {ROLE_LABEL[user.role]}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="mt-3 w-full rounded-lg bg-slate-100 py-2 text-sm font-semibold text-slate-600 transition hover:bg-rose-50 hover:text-rose-600"
            >
              Keluar
            </button>
          </>
        ) : (
          <Link
            to="/login"
            className="block w-full rounded-lg bg-brand-600 py-2 text-center text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            Masuk
          </Link>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-100">
      <aside className="fixed inset-y-0 left-0 hidden w-60 border-r border-slate-200 bg-white lg:block">
        {sidebar}
      </aside>

      {navOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Tutup menu"
            onClick={() => setNavOpen(false)}
            className="absolute inset-0 bg-slate-900/40"
          />
          <aside className="absolute inset-y-0 left-0 w-64 bg-white shadow-xl">
            {sidebar}
          </aside>
        </div>
      )}

      <div className="lg:pl-60">
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="flex items-center gap-3 px-4 py-4 sm:px-6">
            <button
              type="button"
              onClick={() => setNavOpen(true)}
              aria-label="Buka menu"
              className="rounded-lg p-2 text-slate-600 transition hover:bg-slate-100 lg:hidden"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M3 6h18M3 12h18M3 18h18" />
              </svg>
            </button>

            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-bold text-slate-900 sm:text-xl">
                {title}
              </h1>
              {subtitle && <p className="truncate text-sm text-slate-500">{subtitle}</p>}
            </div>

            {/* Ringkasan pengguna pada layar lebar */}
            {user && (
              <div className="hidden items-center gap-2 rounded-xl bg-slate-100 px-3 py-1.5 md:flex">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-xs font-bold text-white">
                  {user.name.charAt(0).toUpperCase()}
                </span>
                <span className="text-sm font-medium text-slate-700">
                  {ROLE_LABEL[user.role]}
                </span>
              </div>
            )}

            {actions && <div className="shrink-0">{actions}</div>}
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6">{children}</main>
      </div>
    </div>
  );
}
