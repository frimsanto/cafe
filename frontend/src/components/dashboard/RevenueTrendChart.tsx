import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { RevenueTrendPointDTO } from '../../types/api';
import { TREND_PERIODS, type TrendPeriod } from '../../types/dashboard';
import { dashboardApi } from '../../api/dashboard';
import { describeApiError } from '../../lib/apiClient';
import { subscribeRealtime } from '../../lib/realtime';
import { formatRupiah, formatRupiahSingkat } from '../../lib/format';

/** Batang hari ini dibedakan; sisanya satu warna tenang. */
const WARNA_BATANG = 'rgba(200,137,26,0.45)';
const WARNA_HARI_INI = 'var(--color-amber)';

interface TooltipPayload {
  payload?: RevenueTrendPointDTO;
}

/**
 * Tooltip: omzet LENGKAP + jumlah pesanan.
 *
 * Sumbu Y sengaja diringkas ("150rb"), jadi tooltip inilah satu-satunya tempat
 * pemilik bisa membaca angka sebenarnya — nilainya ditulis penuh di sini.
 */
function TrendTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
}) {
  const titik = payload?.[0]?.payload;
  if (!active || !titik) return null;

  return (
    <div
      className="rounded-xl px-3 py-2 shadow-lg"
      style={{
        backgroundColor: 'var(--color-paper)',
        border: '1px solid var(--color-border)',
        fontFamily: 'var(--font-data)',
      }}
    >
      <p style={{ fontSize: 11, color: 'var(--color-muted)' }}>{titik.label}</p>
      <p
        className="mt-0.5 tabular-nums"
        style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-espresso)' }}
      >
        {formatRupiah(titik.totalRevenue)}
      </p>
      <p className="tabular-nums" style={{ fontSize: 12, color: 'var(--color-subtle)' }}>
        {titik.totalOrders} pesanan
      </p>
    </div>
  );
}

/** Tombol rentang 7 / 30 hari — sengaja terpisah dari pemilih periode kartu omzet. */
function TrendSelector({
  value,
  onChange,
}: {
  value: TrendPeriod;
  onChange: (next: TrendPeriod) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Rentang grafik"
      className="flex gap-1 rounded-xl p-1"
      style={{ backgroundColor: 'rgba(26,18,8,0.05)' }}
    >
      {TREND_PERIODS.map((opsi) => {
        const aktif = opsi.key === value;
        return (
          <button
            key={opsi.key}
            type="button"
            aria-pressed={aktif}
            onClick={() => onChange(opsi.key)}
            className="rounded-lg px-3 py-1.5 transition-colors"
            style={{
              fontSize: 12,
              fontWeight: 500,
              backgroundColor: aktif ? 'var(--color-paper)' : 'transparent',
              color: aktif ? 'var(--color-espresso)' : 'var(--color-muted)',
              boxShadow: aktif ? '0 1px 2px rgba(26,18,8,0.08)' : 'none',
            }}
          >
            {opsi.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Grafik tren omzet harian — 7 atau 30 hari terakhir.
 *
 * Angkanya datang dari `GET /dashboard/revenue-trend`, yang memakai dasar yang
 * sama persis dengan kartu omzet di atasnya (waktu pembayaran + pembayaran
 * SUKSES). Hari tanpa transaksi tetap digambar sebagai batang nol, supaya jeda
 * sepi terbaca sebagai jeda sepi — bukan menghilang dan membuat grafik seolah
 * rapat terus.
 *
 * Sama seperti `RevenuePanel`, grafik menyegarkan dirinya saat ada pesanan
 * dibayar: yang diambil ulang adalah data dari server, bukan tebakan lokal.
 */
export default function RevenueTrendChart({ cafeId }: { cafeId: string }) {
  const [period, setPeriod] = useState<TrendPeriod>('7d');
  const [data, setData] = useState<RevenueTrendPointDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Rentang yang sedang dilihat, dibaca oleh langganan WebSocket tanpa membuat
  // langganannya dipasang ulang setiap kali pemilik berganti tombol.
  const periodRef = useRef(period);
  periodRef.current = period;

  const load = useCallback(
    async (target: TrendPeriod, { quiet = false } = {}) => {
      if (!cafeId) return;
      if (!quiet) setLoading(true);
      try {
        const res = await dashboardApi.revenueTrend(cafeId, target);
        // Balasan rentang lain yang datang terlambat tidak boleh menimpa
        // grafik yang sedang dilihat.
        if (periodRef.current !== target) return;
        setData(res.trend);
        setError(null);
      } catch (err) {
        if (periodRef.current !== target) return;
        setError(describeApiError(err, 'Gagal memuat tren omzet.'));
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [cafeId],
  );

  useEffect(() => {
    void load(period);
  }, [load, period]);

  useEffect(() => {
    if (!cafeId) return;
    return subscribeRealtime(cafeId, (message) => {
      if (message.type === 'dashboard.order.paid') {
        void load(periodRef.current, { quiet: true });
      }
    });
  }, [cafeId, load]);

  // Hari ini selalu batang terakhir (server menyusunnya menaik).
  const indeksHariIni = data.length - 1;
  const kosong = data.length > 0 && data.every((d) => d.totalRevenue === 0);
  // 30 label tidak muat di lebar ponsel — tampilkan setiap hari ke-4 saja.
  const jarakLabel = period === '30d' ? 4 : 0;

  return (
    <section
      className="card-warm rounded-2xl px-6 py-5"
      style={{ fontFamily: 'var(--font-data)' }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-espresso)' }}>
            Tren Omzet
          </h2>
          <p className="mt-1" style={{ fontSize: 12, color: 'var(--color-muted)' }}>
            Omzet harian {period === '7d' ? '7' : '30'} hari terakhir
          </p>
        </div>
        <TrendSelector value={period} onChange={setPeriod} />
      </div>

      {error ? (
        <p
          className="mt-4 rounded-xl px-3 py-2"
          style={{ fontSize: 13, backgroundColor: '#fbeceb', color: '#b4231c' }}
        >
          {error}
        </p>
      ) : loading ? (
        <div
          role="status"
          aria-label="Memuat tren omzet"
          className="skeleton-warm mt-4 h-56 rounded-xl"
        />
      ) : kosong ? (
        <div
          className="mt-4 flex h-56 flex-col items-center justify-center rounded-xl text-center"
          style={{
            border: '1px dashed var(--color-border)',
            backgroundColor: 'rgba(26,18,8,0.02)',
          }}
        >
          <span className="text-2xl" aria-hidden>
            📭
          </span>
          <p className="mt-2" style={{ fontSize: 13, color: 'var(--color-muted)' }}>
            Belum ada transaksi
          </p>
          <p className="mt-0.5" style={{ fontSize: 12, color: 'var(--color-muted)' }}>
            Omzet akan muncul di sini begitu ada pesanan yang dibayar.
          </p>
        </div>
      ) : (
        <div className="mt-4 h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -8 }}>
              <XAxis
                dataKey="label"
                interval={jarakLabel}
                tickLine={false}
                axisLine={{ stroke: 'var(--color-border)' }}
                tick={{ fontSize: 11, fill: 'var(--color-muted)' }}
              />
              <YAxis
                tickFormatter={formatRupiahSingkat}
                tickLine={false}
                axisLine={false}
                width={52}
                tick={{ fontSize: 11, fill: 'var(--color-muted)' }}
              />
              <Tooltip
                content={<TrendTooltip />}
                cursor={{ fill: 'rgba(26,18,8,0.04)' }}
              />
              <Bar dataKey="totalRevenue" radius={[4, 4, 0, 0]} maxBarSize={44}>
                {data.map((titik, index) => (
                  <Cell
                    key={titik.date}
                    fill={index === indeksHariIni ? WARNA_HARI_INI : WARNA_BATANG}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
