import { useCallback, useEffect, useState } from 'react';
import type { TopMenuItemDTO } from '../../types/api';
import type { RevenuePeriod } from '../../types/dashboard';
import { dashboardApi } from '../../api/dashboard';
import { describeApiError } from '../../lib/apiClient';
import { subscribeRealtime } from '../../lib/realtime';
import MenuItemImage from '../menu/MenuItemImage';

interface TopMenuListProps {
  cafeId: string;
  period?: RevenuePeriod;
}

/**
 * Daftar menu terlaris — perbandingan magnitude (porsi terjual) antar item.
 *
 * Satu seri data, jadi seluruh bar memakai SATU warna (bukan warna per
 * peringkat); nilainya selalu ditulis sebagai angka sehingga tidak bergantung
 * pada warna saja. Peringkat dihitung backend dan diambil ulang setiap ada
 * pesanan dibayar (event `dashboard.order.paid`).
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

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-bold text-slate-900">Menu Terlaris</h2>
        <span className="text-xs text-slate-400">porsi terjual</span>
      </div>

      {error ? (
        <p className="mt-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      ) : loading ? (
        <div role="status" aria-label="Memuat menu terlaris" className="mt-4 space-y-3.5">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} aria-hidden className="h-9 animate-pulse rounded-lg bg-slate-100" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="mt-4 text-sm text-slate-400">
          Belum ada penjualan pada periode ini.
        </p>
      ) : (
        <ol className="mt-4 space-y-3.5">
          {items.map((item, index) => {
            const percent = (item.soldCount / max) * 100;
            const flashing = item.menuItemId === flashId;

            return (
              <li
                key={item.menuItemId}
                className="flex items-center gap-3"
                title={`${item.name} — ${item.soldCount} porsi terjual`}
              >
                <span className="w-4 shrink-0 text-sm font-bold text-slate-400 tabular-nums">
                  {index + 1}
                </span>

                <MenuItemImage
                  src={item.imageUrl}
                  alt={item.name}
                  className="h-9 w-9 shrink-0 rounded-lg"
                />

                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="truncate text-sm font-semibold text-slate-800">
                      {item.name}
                    </p>
                    <span
                      className={`shrink-0 text-sm font-bold tabular-nums transition-colors duration-500 ${
                        flashing ? 'text-brand-600' : 'text-slate-700'
                      }`}
                    >
                      {item.soldCount}
                    </span>
                  </div>

                  {/* Bar magnitude — track recessive, satu warna untuk satu seri. */}
                  <div
                    className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100"
                    role="presentation"
                  >
                    <div
                      className="h-full rounded-full bg-brand-500 transition-all duration-700"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
