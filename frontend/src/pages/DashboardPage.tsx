import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
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

function todayLabel(): string {
  return new Date().toLocaleDateString('id-ID', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

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
 * Dasbor pemilik — halaman utama pemantauan kafe.
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

  return (
    <AppLayout
      title="Dasbor"
      subtitle={todayLabel()}
      actions={
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          title={`${visibleCount} dari ${totalCount} metrik tampil`}
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
        >
          <span aria-hidden>⚙️</span>
          <span className="hidden sm:inline">Sesuaikan</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold tabular-nums text-slate-500">
            {visibleCount}/{totalCount}
          </span>
        </button>
      }
    >
      {anyVisible ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {prefs.revenue && (
            <div className="sm:col-span-2">
              <RevenuePanel cafeId={cafeId} />
            </div>
          )}

          {prefs.ordersToday && (
            <StatCard
              label="Pesanan Hari Ini"
              value={String(orders.ordersToday)}
              icon="🧾"
              deltaPercent={growthPercent(orders.ordersToday, orders.ordersYesterday)}
              deltaLabel="vs kemarin"
            />
          )}

          {prefs.activeOrders && (
            <StatCard
              label="Sedang Diproses"
              value={String(orders.activeOrders)}
              icon="🍳"
              hint="Pesanan aktif di dapur"
            />
          )}

          {prefs.revenueTrend && (
            <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:col-span-2 xl:col-span-3">
              <h2 className="text-base font-bold text-slate-900">Tren Omzet</h2>
              <p className="mt-1 text-sm text-slate-500">
                Grafik omzet harian akan tampil di sini.
              </p>
              <div className="mt-4 flex h-56 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-400">
                Menyusul pada task berikutnya
              </div>
            </section>
          )}

          {prefs.topMenu && (
            <div className="sm:col-span-2 xl:col-span-1">
              <TopMenuList cafeId={cafeId} />
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-20 text-center">
          <span className="text-4xl">🧩</span>
          <h2 className="mt-3 text-lg font-semibold text-slate-700">
            Semua metrik disembunyikan
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Aktifkan minimal satu metrik untuk mulai memantau kafe.
          </p>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="mt-5 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            Sesuaikan Dasbor
          </button>
        </div>
      )}

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
