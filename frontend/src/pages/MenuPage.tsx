import { useEffect, useState } from 'react';
import type { MenuCategoryWithItems } from '../types/menu';
import { menuApi } from '../api/menu';
import { describeApiError } from '../lib/apiClient';
import { useTableSession } from '../table/TableSessionContext';
import MenuHeader from '../components/menu/MenuHeader';
import CategoryNav from '../components/menu/CategoryNav';
import CategorySection from '../components/menu/CategorySection';
import FloatingCartBar from '../components/cart/FloatingCartBar';

/**
 * Halaman menu digital pelanggan (dibuka via pindai QR meja).
 *
 * Menu diambil dari `GET /api/cafes/:cafeId/menu?available=true` — hanya item
 * yang tersedia, supaya pelanggan tidak sempat memesan menu yang habis.
 * Identitas kafe & meja berasal dari token QR di URL, bukan tebakan klien.
 */
export default function MenuPage() {
  const { table, loading: resolving, error: tableError } = useTableSession();
  const [categories, setCategories] = useState<MenuCategoryWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cafeId = table?.cafeId;

  useEffect(() => {
    if (!cafeId) return;
    let cancelled = false;
    setLoading(true);

    menuApi
      .grouped(cafeId, true)
      .then((data) => {
        if (cancelled) return;
        setCategories(data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setCategories([]);
        setError(describeApiError(err, 'Gagal memuat menu.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [cafeId]);

  // Belum ada meja yang dikenali — QR belum dipindai atau tokennya salah.
  if (!resolving && !table) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center bg-slate-100 px-6 text-center shadow-xl">
        <span className="text-5xl">📷</span>
        <h1 className="mt-4 text-lg font-bold text-slate-800">
          Pindai QR di meja kamu
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {tableError ??
            'Menu digital terbuka setelah kamu memindai QR code yang tertempel di meja.'}
        </p>
      </div>
    );
  }

  const busy = resolving || loading;

  return (
    <div className="mx-auto min-h-screen max-w-md bg-slate-100 shadow-xl">
      {table && (
        <MenuHeader
          cafe={{ id: table.cafeId, name: table.cafeName, tagline: '' }}
          table={{ id: table.tableId, tableName: table.tableName }}
        />
      )}
      {!busy && <CategoryNav categories={categories} />}

      <main className="space-y-8 px-4 pb-28 pt-5">
        {busy ? (
          <div role="status" className="space-y-4">
            <span className="sr-only">Memuat menu…</span>
            {Array.from({ length: 5 }, (_, index) => (
              <div
                key={index}
                aria-hidden
                className="h-24 animate-pulse rounded-2xl bg-white/80"
              />
            ))}
          </div>
        ) : error ? (
          <p className="rounded-xl bg-rose-50 px-4 py-3 text-center text-sm text-rose-700">
            {error}
          </p>
        ) : categories.length === 0 ? (
          <p className="py-16 text-center text-slate-400">Menu belum tersedia.</p>
        ) : (
          categories.map((category) => (
            <CategorySection key={category.id} category={category} />
          ))
        )}
      </main>

      <FloatingCartBar />
    </div>
  );
}
