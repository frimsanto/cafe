import { useEffect, useState } from 'react';
import type { TopMenuItem } from '../../types/dashboard';
import { mockTopMenuItems, sellOneItem } from '../../data/mockDashboard';
import MenuItemImage from '../menu/MenuItemImage';

const TICK_MS = 4000; // simulasi satu porsi terjual tiap ~4 detik

/**
 * Daftar menu terlaris — perbandingan magnitude (porsi terjual) antar item.
 *
 * Satu seri data, jadi seluruh bar memakai SATU warna (bukan warna per
 * peringkat); nilainya selalu ditulis sebagai angka sehingga tidak bergantung
 * pada warna saja. Data tiruan diperbarui otomatis seolah ada penjualan baru.
 */
export default function TopMenuList() {
  const [items, setItems] = useState<TopMenuItem[]>(mockTopMenuItems);
  const [flashId, setFlashId] = useState<string | null>(null);

  useEffect(() => {
    const id = setInterval(() => {
      setItems((prev) => {
        const { items: next, soldId } = sellOneItem(prev);
        setFlashId(soldId);
        setTimeout(() => setFlashId(null), 900);
        return next;
      });
    }, TICK_MS);
    return () => clearInterval(id);
  }, []);

  const max = Math.max(...items.map((i) => i.soldCount), 1);

  return (
    <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-base font-bold text-slate-900">Menu Terlaris</h2>
        <span className="text-xs text-slate-400">porsi terjual</span>
      </div>

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
    </section>
  );
}
