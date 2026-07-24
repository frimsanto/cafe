import { useMemo } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { getMenuByCategoryForCafe } from '../data/mockMenu';
import { formatRupiah } from '../lib/format';
import AppLayout from '../components/layout/AppLayout';
import MenuItemImage from '../components/menu/MenuItemImage';

/**
 * Daftar menu milik kafe yang sedang masuk.
 *
 * Menunjukkan isolasi data multi-tenant: data disaring berdasarkan `cafeId`
 * pengguna, sehingga satu kafe tidak pernah melihat menu kafe lain. Kafe yang
 * baru mendaftar akan melihat daftar kosong.
 *
 * Fase ini masih baca-saja; tambah/ubah menu ada di fitur Manajemen Menu.
 */
export default function CafeMenuPage() {
  const { user } = useAuth();

  const categories = useMemo(
    () => (user ? getMenuByCategoryForCafe(user.cafeId) : []),
    [user],
  );

  if (!user) return <Navigate to="/login" replace />;

  const totalItems = categories.reduce((sum, c) => sum + c.items.length, 0);

  return (
    <AppLayout
      title="Menu Kafe"
      subtitle={`${totalItems} item · ${user.cafeName}`}
      actions={
        <Link
          to="/dasbor/manajemen-menu"
          className="rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
        >
          Kelola menu
        </Link>
      }
    >
      {/* Penegasan tenant aktif */}
      <div className="mb-5 flex items-start gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-lg">
          🔒
        </span>
        <div className="min-w-0">
          <p className="font-semibold text-slate-800">
            Menampilkan data milik {user.cafeName}
          </p>
          <p className="text-sm text-slate-500">
            Setiap kafe hanya bisa melihat dan mengelola datanya sendiri.
          </p>
        </div>
      </div>

      {totalItems === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-20 text-center">
          <span className="text-4xl">🍽️</span>
          <h2 className="mt-3 text-lg font-semibold text-slate-700">
            Belum ada menu
          </h2>
          <p className="mt-1 max-w-sm text-sm text-slate-500">
            Kafe ini belum memiliki menu sendiri. Menu yang kamu tambahkan hanya
            akan terlihat oleh {user.cafeName}.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {categories.map((category) => (
            <section key={category.id}>
              <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-slate-800">
                {category.name}
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-500">
                  {category.items.length}
                </span>
              </h2>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {category.items.map((item) => (
                  <article
                    key={item.id}
                    className="flex gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200"
                  >
                    <MenuItemImage
                      src={item.imageUrl}
                      alt={item.name}
                      className="h-16 w-16 shrink-0 rounded-xl"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="truncate font-semibold text-slate-900">
                          {item.name}
                        </h3>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            item.isAvailable
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {item.isAvailable ? 'Tersedia' : 'Habis'}
                        </span>
                      </div>
                      <p className="line-clamp-1 text-sm text-slate-500">
                        {item.description}
                      </p>
                      <p className="mt-1 font-bold text-brand-700">
                        {formatRupiah(item.price)}
                      </p>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </AppLayout>
  );
}
