import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { TopMenuItemDTO } from '../../types/api';
import { REVENUE_PERIODS, type RevenuePeriod } from '../../types/dashboard';
import { dashboardApi } from '../../api/dashboard';
import { describeApiError } from '../../lib/apiClient';
import { subscribeRealtime } from '../../lib/realtime';

interface TopMenuListProps {
  cafeId: string;
  period?: RevenuePeriod;
}

/** Warna bar magnitude per peringkat (nilai selalu tertulis sebagai angka). */
function barColor(rank: number): string {
  if (rank === 1) return 'var(--color-amber)';
  if (rank <= 3) return '#d8c0a0';
  return '#e8d5b8';
}

/**
 * Daftar menu terlaris — perbandingan magnitude (porsi terjual) antar item,
 * dalam gaya "Cafe Ambient". Warna bar mengikuti peringkat, tetapi jumlahnya
 * selalu ditulis sebagai angka sehingga tidak bergantung pada warna saja.
 * Peringkat dihitung backend dan diambil ulang setiap ada pesanan dibayar
 * (event `dashboard.order.paid`).
 */
export default function TopMenuList({ cafeId, period = 'today' }: TopMenuListProps) {
  const [items, setItems] = useState<TopMenuItemDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flashId, setFlashId] = useState<string | null>(null);

  const load = useCallback(
    async ({ quiet = false } = {}) => {
      if (!quiet) setLoading(true);
      try {
        const data = await dashboardApi.topMenu(cafeId, period);
        setItems((prev) => {
          // Sorot item yang jumlah terjualnya bertambah sejak muat terakhir.
          if (quiet) {
            const grew = data.find((next) => {
              const before = prev.find((p) => p.menuItemId === next.menuItemId);
              return before && next.soldCount > before.soldCount;
            });
            if (grew) {
              setFlashId(grew.menuItemId);
              setTimeout(() => setFlashId(null), 900);
            }
          }
          return data;
        });
        setError(null);
      } catch (err) {
        setError(describeApiError(err, 'Gagal memuat menu terlaris.'));
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [cafeId, period],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!cafeId) return;
    return subscribeRealtime(cafeId, (message) => {
      if (message.type === 'dashboard.order.paid') void load({ quiet: true });
    });
  }, [cafeId, load]);

  const max = Math.max(...items.map((i) => i.soldCount), 1);
  const periodLabel = REVENUE_PERIODS.find((p) => p.key === period)?.label.toLowerCase();

  return (
    <section
      className="card-warm rounded-2xl px-6 py-5"
      style={{ fontFamily: 'var(--font-data)' }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 style={{ fontSize: 13, fontWeight: 500, color: 'var(--color-espresso)' }}>
          Menu terlaris
        </h2>
        <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>{periodLabel}</span>
      </div>

      {error ? (
        <p
          className="mt-4 rounded-xl px-3 py-2"
          style={{ fontSize: 13, backgroundColor: '#fbeceb', color: '#b4231c' }}
        >
          {error}
        </p>
      ) : loading ? (
        <div role="status" aria-label="Memuat menu terlaris" className="mt-4 space-y-3">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} aria-hidden className="skeleton-warm h-8 rounded-lg" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="mt-4" style={{ fontSize: 13, color: 'var(--color-muted)' }}>
          Belum ada penjualan pada periode ini.
        </p>
      ) : (
        <ol className="mt-3">
          {items.map((item, index) => {
            const rank = index + 1;
            const percent = (item.soldCount / max) * 100;
            const flashing = item.menuItemId === flashId;
            const countColor =
              flashing || rank === 1 ? 'var(--color-amber)' : 'var(--color-muted)';

            return (
              <li
                key={item.menuItemId}
                style={{ borderBottom: '1px solid rgba(26,18,8,0.05)' }}
              >
                <div
                  className="flex items-center gap-3 rounded-md px-1.5 py-2.5 transition-colors hover:bg-[rgba(26,18,8,0.02)]"
                  title={`${item.name} — ${item.soldCount} porsi terjual`}
                >
                  <span
                    className="w-4 shrink-0 text-center"
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 13,
                      color: 'var(--color-subtle)',
                    }}
                  >
                    {rank}
                  </span>

                  <span
                    className="shrink-0 basis-2/5 truncate"
                    style={{ fontSize: 13, color: 'var(--color-espresso)' }}
                  >
                    {item.name}
                  </span>

                  <div className="min-w-0 flex-1" role="presentation">
                    <motion.div
                      className="rounded-[3px]"
                      style={{ height: 5, backgroundColor: barColor(rank) }}
                      initial={{ width: 0 }}
                      whileInView={{ width: `${percent}%` }}
                      viewport={{ once: true, margin: '-40px' }}
                      transition={{
                        duration: 0.7,
                        delay: index * 0.1,
                        ease: [0.22, 1, 0.36, 1],
                      }}
                    />
                  </div>

                  <span
                    className="w-9 shrink-0 text-right tabular-nums transition-colors duration-500"
                    style={{ fontSize: 12, fontWeight: 500, color: countColor }}
                  >
                    {item.soldCount}
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
