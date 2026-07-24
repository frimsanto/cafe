import { useEffect, useState } from 'react';
import type { DashboardSummary, RevenuePeriod } from '../../types/dashboard';
import {
  REVENUE_PERIODS,
  growthPercent,
  mockDashboardSummary,
  randomRevenueTick,
} from '../../data/mockDashboard';
import { formatRupiah } from '../../lib/format';
import PeriodSelector from './PeriodSelector';

const TICK_MS = 5000; // simulasi pesanan baru masuk tiap ~5 detik

function relativeLabel(seconds: number): string {
  if (seconds < 5) return 'baru saja';
  if (seconds < 60) return `${seconds} detik lalu`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} menit lalu`;
}

/**
 * Metrik omzet dengan pemilih periode dan pembaruan otomatis.
 *
 * Fase frontend: angka tumbuh dari simulasi (`randomRevenueTick`) seolah ada
 * pesanan baru dibayar. Fase backend akan menggantinya dengan data dorongan
 * realtime (WebSocket) / polling API.
 */
export default function RevenuePanel() {
  const [summary, setSummary] = useState<DashboardSummary>(mockDashboardSummary);
  const [period, setPeriod] = useState<RevenuePeriod>('today');
  const [lastUpdate, setLastUpdate] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [flash, setFlash] = useState(false);

  // Simulasi pembaruan otomatis: omzet & jumlah pesanan bertambah.
  useEffect(() => {
    const id = setInterval(() => {
      const tick = randomRevenueTick();
      setSummary((prev) => ({
        ...prev,
        revenue: {
          ...prev.revenue,
          today: prev.revenue.today + tick,
          thisWeek: prev.revenue.thisWeek + tick,
          thisMonth: prev.revenue.thisMonth + tick,
        },
        orders: { ...prev.orders, ordersToday: prev.orders.ordersToday + 1 },
        updatedAt: new Date().toISOString(),
      }));
      setLastUpdate(Date.now());
      setFlash(true);
      setTimeout(() => setFlash(false), 900);
    }, TICK_MS);
    return () => clearInterval(id);
  }, []);

  // Penanda waktu relatif "diperbarui …".
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const meta = REVENUE_PERIODS.find((p) => p.key === period)!;
  const amount =
    period === 'today'
      ? summary.revenue.today
      : period === 'week'
        ? summary.revenue.thisWeek
        : summary.revenue.thisMonth;

  // Pembanding hanya tersedia untuk periode harian.
  const delta =
    period === 'today'
      ? growthPercent(summary.revenue.today, summary.revenue.yesterday)
      : null;
  const positive = (delta ?? 0) >= 0;
  const secondsAgo = Math.max(0, Math.floor((now - lastUpdate) / 1000));

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-slate-900">Omzet</h2>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Live · diperbarui {relativeLabel(secondsAgo)}
          </p>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      <p
        className={`mt-5 text-3xl font-bold tracking-tight tabular-nums transition-colors duration-500 lg:text-4xl ${
          flash ? 'text-brand-600' : 'text-slate-900'
        }`}
      >
        {formatRupiah(amount)}
      </p>

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        {delta !== null ? (
          <span
            className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-semibold ${
              positive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
            }`}
          >
            {positive ? '▲' : '▼'} {positive ? '+' : ''}
            {delta.toFixed(1)}% <span className="font-normal">vs kemarin</span>
          </span>
        ) : (
          <span className="text-slate-400">{meta.caption}</span>
        )}
        <span className="text-slate-400">
          {summary.orders.ordersToday} pesanan hari ini
        </span>
      </div>
    </section>
  );
}
