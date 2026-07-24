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
import OdometerNumber from './OdometerNumber';

function relativeLabel(seconds: number): string {
  if (seconds < 5) return 'baru saja';
  if (seconds < 60) return `${seconds} detik lalu`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} menit lalu`;
}

/**
 * Metrik omzet dengan pemilih periode — kartu hero dasbor "Cafe Ambient".
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
    <section
      className="card-warm rounded-2xl px-7 py-6"
      style={{ fontFamily: 'var(--font-data)' }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p
            className="uppercase"
            style={{
              fontSize: 10,
              fontWeight: 500,
              letterSpacing: '0.1em',
              color: 'var(--color-muted)',
            }}
          >
            Omzet {meta.label.toLowerCase()}
          </p>
          <p
            className="mt-1 flex items-center gap-1.5"
            style={{ fontSize: 11, color: 'var(--color-muted)' }}
          >
            <span className="relative flex h-1.5 w-1.5">
              <span
                className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
                style={{ backgroundColor: 'var(--color-success)' }}
              />
              <span
                className="relative inline-flex h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: 'var(--color-success)' }}
              />
            </span>
            Live · diperbarui {relativeLabel(secondsAgo)}
          </p>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      {error ? (
        <p
          className="mt-5 rounded-xl px-3 py-2"
          style={{ fontSize: 13, backgroundColor: '#fbeceb', color: '#b4231c' }}
        >
          {error}
        </p>
      ) : loading ? (
        <div
          role="status"
          aria-label="Memuat omzet"
          className="skeleton-warm mt-5 h-11 w-64 rounded-lg"
        />
      ) : (
        <>
          <OdometerNumber
            value={summary?.revenue ?? 0}
            format={formatRupiah}
            className="mt-4 block"
            style={{
              fontSize: 40,
              fontWeight: 500,
              letterSpacing: '-0.03em',
              lineHeight: 1.1,
              color: flash ? 'var(--color-amber)' : 'var(--color-espresso)',
              transition: 'color 500ms ease',
            }}
          />

          <div
            className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1"
            style={{ fontSize: 12 }}
          >
            {delta !== null ? (
              <span
                style={{ fontWeight: 500, color: positive ? 'var(--color-success)' : '#b4231c' }}
              >
                {positive ? '↑' : '↓'} {positive ? '+' : ''}
                {delta.toFixed(1)}%
              </span>
            ) : (
              <span style={{ color: 'var(--color-muted)' }}>{meta.caption}</span>
            )}
            <span style={{ color: 'var(--color-muted)' }}>
              {delta !== null ? `${PERIOD_COMPARISON_LABEL[period]} · ` : ''}
              {summary?.orderCount ?? 0} pesanan
            </span>
          </div>
        </>
      )}
    </section>
  );
}
