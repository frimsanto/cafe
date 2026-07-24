import { useCallback, useEffect, useRef, useState } from 'react';
import type { RevenueSummaryDTO } from '../../types/api';
import {
  PERIOD_COMPARISON_LABEL,
  REVENUE_PERIODS,
  type RevenuePeriod,
} from '../../types/dashboard';
import { dashboardApi } from '../../api/dashboard';
import { describeApiError } from '../../lib/apiClient';
import { subscribeRealtime } from '../../lib/realtime';
import { formatRupiah } from '../../lib/format';
import PeriodSelector from './PeriodSelector';

function relativeLabel(seconds: number): string {
  if (seconds < 5) return 'baru saja';
  if (seconds < 60) return `${seconds} detik lalu`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} menit lalu`;
}

/**
 * Metrik omzet dengan pemilih periode.
 *
 * Angkanya dihitung backend (`GET /dashboard/revenue?period=…`) — hanya
 * pesanan dengan pembayaran SUKSES yang masuk hitungan. Pembaruan langsung
 * datang dari event WebSocket `dashboard.order.paid`: begitu ada pesanan
 * dibayar, panel mengambil ulang angkanya dari server alih-alih menambah
 * sendiri di klien, supaya yang tampil selalu sama dengan isi database.
 */
export default function RevenuePanel({ cafeId }: { cafeId: string }) {
  const [summary, setSummary] = useState<RevenueSummaryDTO | null>(null);
  const [period, setPeriod] = useState<RevenuePeriod>('today');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [flash, setFlash] = useState(false);

  // Periode disimpan di ref agar langganan WebSocket tidak perlu dipasang
  // ulang setiap kali pemilik berganti tab periode.
  const periodRef = useRef(period);
  periodRef.current = period;

  const load = useCallback(
    async (target: RevenuePeriod, { quiet = false } = {}) => {
      if (!quiet) setLoading(true);
      try {
        const data = await dashboardApi.revenue(cafeId, target);
        // Balasan periode lain yang datang terlambat tidak boleh menimpa
        // angka periode yang sedang dilihat.
        if (periodRef.current !== target) return;
        setSummary(data);
        setError(null);
        setLastUpdate(Date.now());
        if (quiet) {
          setFlash(true);
          setTimeout(() => setFlash(false), 900);
        }
      } catch (err) {
        if (periodRef.current !== target) return;
        setError(describeApiError(err, 'Gagal memuat omzet.'));
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [cafeId],
  );

  useEffect(() => {
    void load(period);
  }, [load, period]);

  // Pesanan baru dibayar → ambil ulang angka periode yang sedang tampil.
  useEffect(() => {
    if (!cafeId) return;
    return subscribeRealtime(cafeId, (message) => {
      if (message.type === 'dashboard.order.paid') {
        void load(periodRef.current, { quiet: true });
      }
    });
  }, [cafeId, load]);

  // Penanda waktu relatif "diperbarui …".
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const meta = REVENUE_PERIODS.find((p) => p.key === period)!;
  const delta = summary?.growthPercent ?? null;
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

      {error ? (
        <p className="mt-5 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : loading ? (
        <div
          role="status"
          aria-label="Memuat omzet"
          className="mt-5 h-10 w-56 animate-pulse rounded-lg bg-slate-100 lg:h-11"
        />
      ) : (
        <>
          <p
            className={`mt-5 text-3xl font-bold tracking-tight tabular-nums transition-colors duration-500 lg:text-4xl ${
              flash ? 'text-brand-600' : 'text-slate-900'
            }`}
          >
            {formatRupiah(summary?.revenue ?? 0)}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            {delta !== null ? (
              <span
                className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-semibold ${
                  positive
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-rose-50 text-rose-700'
                }`}
              >
                {positive ? '▲' : '▼'} {positive ? '+' : ''}
                {delta.toFixed(1)}%{' '}
                <span className="font-normal">
                  {PERIOD_COMPARISON_LABEL[period]}
                </span>
              </span>
            ) : (
              <span className="text-slate-400">{meta.caption}</span>
            )}
            <span className="text-slate-400">
              {summary?.orderCount ?? 0} pesanan
            </span>
          </div>
        </>
      )}
    </section>
  );
}
