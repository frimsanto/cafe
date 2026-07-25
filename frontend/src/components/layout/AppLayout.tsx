import { useEffect, useState, type ReactNode, type SVGProps } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../../auth/AuthContext';
import { ROLE_LABEL, type UserRole } from '../../types/auth';

/** Lebar rel dalam dua mode: ikon saja vs. ikon + label. */
const RAIL_COLLAPSED = 60;
const RAIL_EXPANDED = 200;
/** Kunci localStorage untuk mengingat preferensi lipat sidebar antar sesi. */
const SIDEBAR_STORAGE_KEY = 'sidebar-collapsed';
/** Easing/kurva bersama agar lebar rel & padding konten bergerak serempak. */
const RAIL_TRANSITION = { duration: 0.28, ease: [0.22, 1, 0.36, 1] } as const;

/**
 * Baca preferensi lipat dari localStorage. Default: terlipat (ikon saja) agar
 * tampilan awal sama dengan produksi saat ini; pengguna bisa memperlebar.
 */
function readCollapsed(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const stored = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    return stored === null ? true : stored === 'true';
  } catch {
    return true;
  }
}

/** Kunci ikon garis (monokrom) — bisa diwarnai amber saat aktif. */
type IconKey =
  | 'dashboard'
  | 'menu'
  | 'menuManage'
  | 'cashier'
  | 'kitchen'
  | 'tables';

interface NavItem {
  label: string;
  icon: IconKey;
  /** Tujuan navigasi; kosong berarti halaman belum dibangun. */
  to?: string;
}

/**
 * Menu navigasi per peran — staf hanya melihat area yang menjadi tanggung
 * jawabnya (pembagian hak akses sederhana sesuai PRD).
 */
const NAV_BY_ROLE: Record<UserRole, NavItem[]> = {
  OWNER: [
    { label: 'Dasbor', icon: 'dashboard', to: '/dasbor' },
    { label: 'Menu Kafe', icon: 'menu', to: '/dasbor/menu' },
    { label: 'Manajemen Menu', icon: 'menuManage', to: '/dasbor/manajemen-menu' },
    { label: 'Kasir', icon: 'cashier', to: '/kasir' },
    { label: 'Layar Dapur', icon: 'kitchen', to: '/dapur' },
    { label: 'Manajemen Meja', icon: 'tables', to: '/dasbor/meja' },
  ],
  KASIR: [
    { label: 'Kasir', icon: 'cashier', to: '/kasir' },
    { label: 'Layar Dapur', icon: 'kitchen', to: '/dapur' },
  ],
  DAPUR: [{ label: 'Layar Dapur', icon: 'kitchen', to: '/dapur' }],
};

const svgProps = {
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const satisfies SVGProps<SVGSVGElement>;

/** Ikon garis untuk rel navigasi — mewarisi `currentColor` agar bisa ditint. */
function NavIcon({ name }: { name: IconKey }) {
  switch (name) {
    case 'dashboard':
      return (
        <svg {...svgProps} aria-hidden>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
        </svg>
      );
    case 'menu': // cangkir kopi
      return (
        <svg {...svgProps} aria-hidden>
          <path d="M4 8h13v5a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8Z" />
          <path d="M17 9h2a2 2 0 1 1 0 4h-2" />
          <path d="M8 2v2M12 2v2" />
        </svg>
      );
    case 'menuManage': // daftar
      return (
        <svg {...svgProps} aria-hidden>
          <path d="M8 6h11M8 12h11M8 18h11" />
          <path d="M4 6h.01M4 12h.01M4 18h.01" />
        </svg>
      );
    case 'cashier': // kartu
      return (
        <svg {...svgProps} aria-hidden>
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <path d="M2 10h20M6 15h4" />
        </svg>
      );
    case 'kitchen': // api kompor
      return (
        <svg {...svgProps} aria-hidden>
          <path d="M12 2C9 6 7 8 7 12a5 5 0 0 0 10 0c0-2-1-3.6-2-5-.6 1.6-1.6 2-2.6 2 1-3-.4-5-.4-7Z" />
        </svg>
      );
    case 'tables': // meja + kursi
      return (
        <svg {...svgProps} aria-hidden>
          <rect x="7.5" y="7.5" width="9" height="9" rx="2" />
          <circle cx="12" cy="4" r="1.3" />
          <circle cx="12" cy="20" r="1.3" />
          <circle cx="4" cy="12" r="1.3" />
          <circle cx="20" cy="12" r="1.3" />
        </svg>
      );
  }
}

/** Ikon keluar (pintu). */
function LogoutIcon() {
  return (
    <svg {...svgProps} aria-hidden>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </svg>
  );
}

/** Chevron kiri — diputar 180° saat terlipat untuk menandai arah "perlebar". */
function ChevronIcon() {
  return (
    <svg {...svgProps} aria-hidden>
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

/** Logo kafe: kotak espresso dengan titik amber di tengah. */
function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <span
      className="flex items-center justify-center rounded-lg"
      style={{ width: size, height: size, backgroundColor: 'var(--color-espresso)' }}
    >
      <span
        className="rounded-full"
        style={{ width: 8, height: 8, backgroundColor: 'var(--color-amber)' }}
      />
    </span>
  );
}

/** Tooltip melayang di sisi kanan rel (muncul saat hover ikon). */
function Tip({ children }: { children: ReactNode }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 -translate-x-1 -translate-y-1/2 whitespace-nowrap rounded-md px-2.5 py-1 opacity-0 shadow-lg transition-all duration-150 group-hover:translate-x-0 group-hover:opacity-100"
      style={{
        fontSize: 12,
        fontWeight: 500,
        fontFamily: 'var(--font-data)',
        backgroundColor: 'var(--color-espresso)',
        color: 'var(--color-paper)',
      }}
    >
      {children}
    </span>
  );
}

interface AppLayoutProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * Kerangka aplikasi untuk staf & pemilik dalam gaya "Cafe Ambient". Pada layar
 * besar rel navigasi bisa dilipat: 60px ikon-saja (dengan tooltip) atau 200px
 * ikon + label — dipicu lewat logo/tombol chevron dan diingat di localStorage
 * (`sidebar-collapsed`). Pada layar kecil dipakai laci berlabel (drawer).
 * Identitas pengguna, peran, dan kafe (tenant) aktif tetap ditampilkan.
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
  const [collapsed, setCollapsed] = useState(readCollapsed);

  // Simpan preferensi lipat agar bertahan saat halaman dimuat ulang.
  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed));
    } catch {
      /* storage tidak tersedia — preferensi hanya bertahan di memori */
    }
  }, [collapsed]);

  const toggleSidebar = () => setCollapsed((v) => !v);

  const navItems = user ? NAV_BY_ROLE[user.role] : [];

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  // ── Rel navigasi (desktop): dua mode — ikon saja / ikon + label ─────────
  const rail = (
    <div className="flex h-full flex-col py-4">
      {/* Kepala: logo (klik = toggle) + tombol chevron */}
      <div
        className={
          collapsed
            ? 'flex flex-col items-center gap-2'
            : 'flex items-center gap-2.5 px-3'
        }
      >
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={collapsed ? 'Perlebar menu' : 'Perkecil menu'}
          className="flex items-center gap-2.5 rounded-lg"
        >
          <BrandMark />
          {!collapsed && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2, delay: 0.08 }}
              className="whitespace-nowrap"
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 500,
                fontSize: 16,
                color: 'var(--color-espresso)',
              }}
            >
              CafeOS
            </motion.span>
          )}
        </button>

        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={collapsed ? 'Perlebar menu' : 'Perkecil menu'}
          aria-expanded={!collapsed}
          className={[
            'flex h-8 w-8 items-center justify-center rounded-lg opacity-40 transition-all duration-150 hover:bg-[rgba(26,18,8,0.06)] hover:opacity-100',
            collapsed ? '' : 'ml-auto',
          ].join(' ')}
          style={{ color: 'var(--color-espresso)' }}
        >
          <motion.span
            className="flex"
            animate={{ rotate: collapsed ? 180 : 0 }}
            transition={RAIL_TRANSITION}
          >
            <ChevronIcon />
          </motion.span>
        </button>
      </div>

      {/* Daftar navigasi */}
      <nav
        className={
          collapsed
            ? 'mt-7 flex flex-1 flex-col items-center gap-1.5'
            : 'mt-6 flex flex-1 flex-col gap-1 px-3'
        }
        style={{ fontFamily: 'var(--font-data)' }}
      >
        {navItems.map((item) => {
          const active = item.to !== undefined && location.pathname === item.to;
          const disabled = !item.to;

          // ── Mode terlipat: badge ikon + tooltip hover ──
          if (collapsed) {
            const badge = (
              <span
                className={[
                  'flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-150',
                  active
                    ? 'opacity-100'
                    : disabled
                      ? 'opacity-20'
                      : 'opacity-30 group-hover:opacity-100 group-hover:bg-[rgba(26,18,8,0.06)]',
                ].join(' ')}
                style={
                  active
                    ? { backgroundColor: 'var(--color-espresso)', color: 'var(--color-amber)' }
                    : { color: 'var(--color-espresso)' }
                }
              >
                <NavIcon name={item.icon} />
              </span>
            );

            if (disabled) {
              return (
                <span
                  key={item.label}
                  className="group relative flex cursor-not-allowed items-center justify-center"
                >
                  {badge}
                  <Tip>{item.label} · Segera</Tip>
                </span>
              );
            }

            return (
              <Link
                key={item.label}
                to={item.to!}
                aria-label={item.label}
                aria-current={active ? 'page' : undefined}
                className="group relative flex items-center justify-center"
              >
                {badge}
                <Tip>{item.label}</Tip>
              </Link>
            );
          }

          // ── Mode diperlebar: baris ikon + label (tanpa tooltip) ──
          const base =
            'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors';

          if (disabled) {
            return (
              <span
                key={item.label}
                className={`${base} cursor-not-allowed`}
                style={{ color: 'var(--color-muted)', opacity: 0.55 }}
              >
                <NavIcon name={item.icon} />
                <motion.span
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2, delay: 0.08 }}
                  className="flex-1 whitespace-nowrap text-left"
                >
                  {item.label}
                </motion.span>
                <span
                  className="rounded-full px-2 py-0.5 uppercase"
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: '0.04em',
                    backgroundColor: 'rgba(26,18,8,0.06)',
                    color: 'var(--color-muted)',
                  }}
                >
                  Segera
                </span>
              </span>
            );
          }

          return (
            <Link
              key={item.label}
              to={item.to!}
              aria-current={active ? 'page' : undefined}
              className={base}
              style={
                active
                  ? { backgroundColor: 'rgba(26,18,8,0.06)', color: 'var(--color-espresso)' }
                  : { color: 'var(--color-subtle)' }
              }
            >
              <span style={{ color: active ? 'var(--color-amber)' : 'var(--color-espresso)' }}>
                <NavIcon name={item.icon} />
              </span>
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2, delay: 0.08 }}
                className="flex-1 whitespace-nowrap text-left"
              >
                {item.label}
              </motion.span>
            </Link>
          );
        })}
      </nav>

      {/* Pengguna + keluar */}
      {collapsed ? (
        <div className="mt-4 flex flex-col items-center gap-2">
          {user ? (
            <>
              <div className="group relative">
                <span
                  className="flex h-9 w-9 items-center justify-center rounded-full"
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    backgroundColor: 'rgba(26,18,8,0.08)',
                    color: 'var(--color-subtle)',
                    fontFamily: 'var(--font-data)',
                  }}
                >
                  {user.name.charAt(0).toUpperCase()}
                </span>
                <Tip>
                  {user.name} · {ROLE_LABEL[user.role]}
                </Tip>
              </div>

              <button
                type="button"
                onClick={handleLogout}
                aria-label="Keluar"
                className="group relative flex items-center justify-center"
              >
                <span
                  className="flex h-10 w-10 items-center justify-center rounded-xl opacity-40 transition-all duration-150 hover:bg-[rgba(180,35,28,0.08)] group-hover:opacity-100"
                  style={{ color: 'var(--color-espresso)' }}
                >
                  <LogoutIcon />
                </span>
                <Tip>Keluar</Tip>
              </button>
            </>
          ) : (
            <Link
              to="/login"
              aria-label="Masuk"
              className="group relative flex items-center justify-center"
            >
              <span
                className="flex h-10 w-10 items-center justify-center rounded-xl opacity-60 transition-opacity duration-150 group-hover:opacity-100"
                style={{ color: 'var(--color-espresso)' }}
              >
                <LogoutIcon />
              </span>
              <Tip>Masuk</Tip>
            </Link>
          )}
        </div>
      ) : (
        <div className="mt-4 px-3 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
          {user ? (
            <>
              <div className="flex items-center gap-2.5">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    backgroundColor: 'rgba(26,18,8,0.08)',
                    color: 'var(--color-subtle)',
                    fontFamily: 'var(--font-data)',
                  }}
                >
                  {user.name.charAt(0).toUpperCase()}
                </span>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2, delay: 0.08 }}
                  className="min-w-0 flex-1"
                  style={{ fontFamily: 'var(--font-data)' }}
                >
                  <p
                    className="truncate"
                    style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-espresso)' }}
                  >
                    {user.name}
                  </p>
                  <p className="truncate" style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                    {ROLE_LABEL[user.role]}
                  </p>
                </motion.div>
              </div>

              <button
                type="button"
                onClick={handleLogout}
                className="mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors hover:bg-[rgba(180,35,28,0.06)]"
                style={{ color: 'var(--color-subtle)' }}
              >
                <span style={{ color: 'var(--color-espresso)' }}>
                  <LogoutIcon />
                </span>
                <span className="whitespace-nowrap">Keluar</span>
              </button>
            </>
          ) : (
            <Link
              to="/login"
              className="flex w-full items-center justify-center rounded-lg py-2 text-white transition-colors hover:brightness-95"
              style={{ fontSize: 14, fontWeight: 600, backgroundColor: 'var(--color-amber)' }}
            >
              Masuk
            </Link>
          )}
        </div>
      )}
    </div>
  );

  // ── Laci berlabel (mobile) ──────────────────────────────────────────────
  const drawer = (
    <div
      className="flex h-full flex-col"
      style={{ backgroundColor: 'var(--color-paper)' }}
    >
      <div className="flex items-center gap-2.5 px-5 py-5">
        <BrandMark />
        <div className="min-w-0">
          <p
            className="truncate leading-tight"
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 500,
              color: 'var(--color-espresso)',
            }}
          >
            CafeOS
          </p>
          <p className="truncate" style={{ fontSize: 12, color: 'var(--color-muted)' }}>
            {user?.cafeName ?? 'Belum masuk'}
          </p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3" style={{ fontFamily: 'var(--font-data)' }}>
        {navItems.map((item) => {
          const active = item.to !== undefined && location.pathname === item.to;
          const base =
            'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors';

          if (!item.to) {
            return (
              <span
                key={item.label}
                className={`${base} cursor-not-allowed`}
                style={{ color: 'var(--color-muted)', opacity: 0.55 }}
              >
                <NavIcon name={item.icon} />
                <span className="flex-1 text-left">{item.label}</span>
                <span
                  className="rounded-full px-2 py-0.5 uppercase"
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: '0.04em',
                    backgroundColor: 'rgba(26,18,8,0.06)',
                    color: 'var(--color-muted)',
                  }}
                >
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
              aria-current={active ? 'page' : undefined}
              className={base}
              style={
                active
                  ? { backgroundColor: 'rgba(26,18,8,0.06)', color: 'var(--color-espresso)' }
                  : { color: 'var(--color-subtle)' }
              }
            >
              <span style={{ color: active ? 'var(--color-amber)' : 'var(--color-espresso)' }}>
                <NavIcon name={item.icon} />
              </span>
              <span className="flex-1 text-left">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4" style={{ borderTop: '1px solid var(--color-border)' }}>
        {user ? (
          <>
            <div className="flex items-center gap-2.5">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  backgroundColor: 'rgba(26,18,8,0.08)',
                  color: 'var(--color-subtle)',
                  fontFamily: 'var(--font-data)',
                }}
              >
                {user.name.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1" style={{ fontFamily: 'var(--font-data)' }}>
                <p
                  className="truncate"
                  style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-espresso)' }}
                >
                  {user.name}
                </p>
                <p className="truncate" style={{ fontSize: 12, color: 'var(--color-muted)' }}>
                  {ROLE_LABEL[user.role]}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="mt-3 w-full rounded-lg py-2 transition-colors hover:brightness-95"
              style={{
                fontSize: 14,
                fontWeight: 600,
                fontFamily: 'var(--font-data)',
                backgroundColor: 'rgba(26,18,8,0.06)',
                color: 'var(--color-subtle)',
              }}
            >
              Keluar
            </button>
          </>
        ) : (
          <Link
            to="/login"
            className="block w-full rounded-lg py-2 text-center text-white transition-colors hover:brightness-95"
            style={{ fontSize: 14, fontWeight: 600, backgroundColor: 'var(--color-amber)' }}
          >
            Masuk
          </Link>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-warm-cream">
      <motion.aside
        initial={false}
        animate={{ width: collapsed ? RAIL_COLLAPSED : RAIL_EXPANDED }}
        transition={RAIL_TRANSITION}
        className={[
          'fixed inset-y-0 left-0 z-30 hidden md:block',
          // Terlipat: biarkan tooltip meluber ke kanan. Diperlebar: klip label
          // agar tidak tumpah keluar rel selama animasi melebar.
          collapsed ? 'overflow-visible' : 'overflow-hidden',
        ].join(' ')}
        style={{
          backgroundColor: 'rgba(26,18,8,0.05)',
          borderRight: '1px solid rgba(26,18,8,0.08)',
        }}
      >
        {rail}
      </motion.aside>

      {navOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Tutup menu"
            onClick={() => setNavOpen(false)}
            className="absolute inset-0 bg-warm-espresso/40"
          />
          <aside className="absolute inset-y-0 left-0 w-64 shadow-xl">{drawer}</aside>
        </div>
      )}

      <div
        className={collapsed ? 'md:pl-[60px]' : 'md:pl-[200px]'}
        style={{ transition: 'padding-left 0.28s cubic-bezier(0.22, 1, 0.36, 1)' }}
      >
        <header
          className="sticky top-0 z-30 backdrop-blur"
          style={{
            borderBottom: '1px solid var(--color-border)',
            backgroundColor: 'rgba(255,248,240,0.9)',
          }}
        >
          <div className="flex items-center gap-3 px-4 py-4 sm:px-6">
            <button
              type="button"
              onClick={() => setNavOpen(true)}
              aria-label="Buka menu"
              className="rounded-lg p-2 text-warm-subtle transition hover:bg-warm-espresso/5 md:hidden"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M3 6h18M3 12h18M3 18h18" />
              </svg>
            </button>

            <div className="min-w-0 flex-1">
              <h1
                className="truncate sm:text-xl"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 18,
                  fontWeight: 500,
                  letterSpacing: '-0.01em',
                  color: 'var(--color-espresso)',
                }}
              >
                {title}
              </h1>
              {subtitle && (
                <p className="truncate text-sm text-warm-muted">{subtitle}</p>
              )}
            </div>

            {/* Ringkasan pengguna pada layar lebar */}
            {user && (
              <div className="hidden items-center gap-2 rounded-xl bg-warm-espresso/5 px-3 py-1.5 md:flex">
                <span
                  className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold"
                  style={{ backgroundColor: 'var(--color-espresso)', color: 'var(--color-amber)' }}
                >
                  {user.name.charAt(0).toUpperCase()}
                </span>
                <span className="text-sm font-medium text-warm-subtle">
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
