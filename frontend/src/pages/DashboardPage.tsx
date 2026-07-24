import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../auth/AuthContext';
import { dashboardApi } from '../api/dashboard';
import { kitchenApi } from '../api/orders';
import { subscribeRealtime } from '../lib/realtime';
import { useDashboardPrefs } from '../hooks/useDashboardPrefs';
import AppLayout from '../components/layout/AppLayout';
import StatCard from '../components/dashboard/StatCard';
import RevenuePanel from '../components/dashboard/RevenuePanel';
import TopMenuList from '../components/dashboard/TopMenuList';
import DashboardSettingsPanel from '../components/dashboard/DashboardSettingsPanel';
import DecryptedText from '../components/dashboard/DecryptedText';

function todayLabel(): string {
  return new Date().toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

/** Sapaan berdasarkan jam setempat (pagi/siang/sore). */
function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 11) return 'Selamat pagi';
  if (hour < 15) return 'Selamat siang';
  return 'Selamat sore';
}

/** Texture kertas halus untuk latar kanvas dasbor (tidak mengganggu baca). */
const PAPER_TEXTURE =
  `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E")`;

/** Angka KPI ringkas di kartu atas dasbor. */
interface OrderStats {
  ordersToday: number;
  ordersYesterday: number;
  activeOrders: number;
}

/**
 * Persentase perubahan terhadap pembanding. `null` bila pembandingnya nol —
 * tidak ada dasar perbandingan yang bermakna.
 */
function growthPercent(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

/**
 * Pembungkus scroll-reveal: fade + naik lembut saat masuk viewport, sekali saja.
 */
function Reveal({
  delay = 0,
  className,
  children,
}: {
  delay?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Dasbor pemilik — halaman utama pemantauan kafe, gaya "Cafe Ambient".
 *
 * Widget yang tampil dapat disesuaikan pemilik lewat panel kustomisasi.
 * Jumlah pesanan hari ini & pembandingnya diambil dari ringkasan omzet
 * (`orderCount` + `previous.orderCount`), sedangkan "sedang diproses" dihitung
 * dari antrean dapur — backend tidak punya endpoint khusus untuk angka itu.
 */
export default function DashboardPage() {
  const { user } = useAuth();
  const cafeId = user?.cafeId ?? '';
  const { prefs, visibleCount, totalCount, setWidget, reset } =
    useDashboardPrefs(cafeId);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [orders, setOrders] = useState<OrderStats>({
    ordersToday: 0,
    ordersYesterday: 0,
    activeOrders: 0,
  });

  const loadStats = useCallback(async () => {
    if (!cafeId) return;
    // Kedua angka berdiri sendiri: kegagalan salah satu tidak boleh
    // mengosongkan yang lain, jadi hasilnya diperiksa satu per satu.
    const [revenue, active] = await Promise.allSettled([
      dashboardApi.revenue(cafeId, 'today'),
      kitchenApi.listActiveOrders(cafeId),
    ]);

    setOrders((prev) => ({
      ordersToday:
        revenue.status === 'fulfilled' ? revenue.value.orderCount : prev.ordersToday,
      ordersYesterday:
        revenue.status === 'fulfilled'
          ? revenue.value.previous.orderCount
          : prev.ordersYesterday,
      activeOrders:
        active.status === 'fulfilled' ? active.value.length : prev.activeOrders,
    }));
  }, [cafeId]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  // Perbarui KPI saat ada pesanan dibayar atau status dapur berubah.
  useEffect(() => {
    if (!cafeId) return;
    return subscribeRealtime(cafeId, (message) => {
      if (
        message.type === 'dashboard.order.paid' ||
        message.type === 'kitchen.order.created' ||
        message.type === 'kitchen.order.updated'
      ) {
        void loadStats();
      }
    });
  }, [cafeId, loadStats]);

  if (!user) return <Navigate to="/login" replace />;

  const anyVisible = visibleCount > 0;
  const firstName = user.name.split(' ')[0];
  const hasMetrics = prefs.ordersToday || prefs.activeOrders;

  return (
    <AppLayout
      title="Dasbor"
      subtitle={todayLabel()}
      actions={
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          title={`${visibleCount} dari ${totalCount} metrik tampil`}
          className="flex items-center gap-2 rounded-xl px-3 py-2 transition-colors hover:bg-[rgba(26,18,8,0.05)]"
          style={{
            fontFamily: 'var(--font-data)',
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--color-subtle)',
            border: '1px solid var(--color-border)',
            backgroundColor: 'var(--color-paper)',
          }}
        >
          <span aria-hidden>⚙️</span>
          <span className="hidden sm:inline">Sesuaikan</span>
          <span
            className="rounded-full px-2 py-0.5 tabular-nums"
            style={{ fontSize: 11, fontWeight: 600, backgroundColor: 'rgba(26,18,8,0.06)' }}
          >
            {visibleCount}/{totalCount}
          </span>
        </button>
      }
    >
      {/* Kanvas hangat immersive — menembus padding AppLayout agar full-bleed. */}
      <div
        className="relative -mx-4 -my-6 min-h-[calc(100vh-64px)] overflow-hidden sm:-mx-6"
        style={{ backgroundColor: 'var(--color-cream)' }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ backgroundImage: PAPER_TEXTURE, opacity: 0.035 }}
        />

        <div
          className="relative mx-auto max-w-[960px] px-6 py-7 sm:px-8"
          style={{ fontFamily: 'var(--font-data)' }}
        >
          {/* ── Header: sapaan + nama kafe + status buka ── */}
          <motion.header
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="mb-6 flex flex-wrap items-center justify-between gap-3"
          >
            <div>
              <p style={{ fontSize: 13, color: 'var(--color-muted)' }}>
                {greeting()}, {firstName}
              </p>
              <h1
                className="mt-0.5"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 22,
                  fontWeight: 500,
                  letterSpacing: '-0.02em',
                  color: 'var(--color-espresso)',
                }}
              >
                <DecryptedText
                  text={user.cafeName}
                  speed={50}
                  characters="abcdefghijklmnopqrstuvwxyz"
                />
              </h1>
            </div>

            <span
              className="inline-flex items-center gap-2"
              style={{
                backgroundColor: 'rgba(26,18,8,0.06)',
                border: '1px solid rgba(26,18,8,0.12)',
                borderRadius: 20,
                padding: '5px 14px',
              }}
            >
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: 'var(--color-amber)' }}
              />
              <span style={{ fontSize: 11, color: 'var(--color-subtle)' }}>
                Buka sekarang
              </span>
            </span>
          </motion.header>

          {anyVisible ? (
            <div className="space-y-2.5">
              {prefs.revenue && (
                <Reveal delay={0}>
                  <RevenuePanel cafeId={cafeId} />
                </Reveal>
              )}

              {hasMetrics && (
                <div className="flex flex-col gap-2.5 sm:flex-row">
                  {prefs.ordersToday && (
                    <Reveal delay={0.08} className="flex-1">
                      <StatCard
                        label="Pesanan"
                        value={orders.ordersToday}
                        deltaPercent={growthPercent(
                          orders.ordersToday,
                          orders.ordersYesterday,
                        )}
                        deltaLabel="vs kemarin"
                      />
                    </Reveal>
                  )}

                  {prefs.activeOrders && (
                    <Reveal delay={0.16} className="flex-1">
                      <StatCard
                        label="Di dapur"
                        value={orders.activeOrders}
                        hint="aktif sekarang"
                        hintTone="amber"
                      />
                    </Reveal>
                  )}
                </div>
              )}

              {prefs.revenueTrend && (
                <Reveal delay={0.24}>
                  <section
                    className="card-warm rounded-2xl px-6 py-5"
                    style={{ fontFamily: 'var(--font-data)' }}
                  >
                    <h2
                      style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-espresso)' }}
                    >
                      Tren Omzet
                    </h2>
                    <p className="mt-1" style={{ fontSize: 13, color: 'var(--color-muted)' }}>
                      Grafik omzet harian akan tampil di sini.
                    </p>
                    <div
                      className="mt-4 flex h-56 items-center justify-center rounded-xl"
                      style={{
                        border: '1px dashed var(--color-border)',
                        backgroundColor: 'rgba(26,18,8,0.02)',
                        fontSize: 13,
                        color: 'var(--color-muted)',
                      }}
                    >
                      Menyusul pada task berikutnya
                    </div>
                  </section>
                </Reveal>
              )}

              {prefs.topMenu && (
                <Reveal delay={0.32}>
                  <TopMenuList cafeId={cafeId} />
                </Reveal>
              )}
            </div>
          ) : (
            <div
              className="flex flex-col items-center justify-center rounded-2xl px-6 py-20 text-center"
              style={{
                border: '1px dashed var(--color-border)',
                backgroundColor: 'rgba(255,248,240,0.6)',
              }}
            >
              <span className="text-4xl">🧩</span>
              <h2
                className="mt-3"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 18,
                  fontWeight: 500,
                  color: 'var(--color-espresso)',
                }}
              >
                Semua metrik disembunyikan
              </h2>
              <p className="mt-1" style={{ fontSize: 13, color: 'var(--color-muted)' }}>
                Aktifkan minimal satu metrik untuk mulai memantau kafe.
              </p>
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="mt-5 rounded-xl px-5 py-2.5 text-white transition-colors hover:brightness-95"
                style={{ fontSize: 14, fontWeight: 500, backgroundColor: 'var(--color-amber)' }}
              >
                Sesuaikan Dasbor
              </button>
            </div>
          )}
        </div>
      </div>

      {settingsOpen && (
        <DashboardSettingsPanel
          prefs={prefs}
          onToggle={setWidget}
          onReset={reset}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </AppLayout>
  );
}
