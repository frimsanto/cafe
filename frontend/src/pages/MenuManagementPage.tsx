import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import type { MenuItem, MenuItemInput } from '../types/menu';
import { useMenuManager } from '../hooks/useMenuManager';
import AppLayout from '../components/layout/AppLayout';
import MenuAdminItemCard from '../components/menuadmin/MenuAdminItemCard';
import MenuAdminToolbar, {
  ALL_CATEGORIES,
} from '../components/menuadmin/MenuAdminToolbar';
import MenuStatsStrip from '../components/menuadmin/MenuStatsStrip';
import MenuItemFormModal from '../components/menuadmin/MenuItemFormModal';
import CategoryManagerModal from '../components/menuadmin/CategoryManagerModal';
import MoveItemModal from '../components/menuadmin/MoveItemModal';

type SaveAction = 'added' | 'updated' | 'moved' | 'hidden' | 'shown';

/** Kalimat notifikasi setelah sebuah aksi berhasil dijalankan. */
function noticeText(action: SaveAction, categoryName: string): string {
  switch (action) {
    case 'added':
      return `berhasil ditambahkan ke kategori ${categoryName}.`;
    case 'moved':
      return `berhasil dipindahkan ke kategori ${categoryName}.`;
    case 'hidden':
      return 'disembunyikan — di menu digital pelanggan kini ditandai “Habis”.';
    case 'shown':
      return 'ditampilkan kembali dan bisa dipesan pelanggan.';
    default:
      return `berhasil diperbarui pada kategori ${categoryName}.`;
  }
}

/**
 * Halaman utama Manajemen Menu (pemilik kafe).
 *
 * Menampilkan seluruh kategori beserta item-nya — termasuk kategori kosong dan
 * item yang sedang disembunyikan (tampil sebagai "Habis" di menu pelanggan) —
 * dengan pencarian dan penyaring kategori.
 *
 * Fase frontend: data berasal dari `useMenuManager` (salinan data tiruan yang
 * bisa diubah). Fase backend akan menggantinya dengan API menu per kafe.
 */
export default function MenuManagementPage() {
  const { user } = useAuth();
  const cafeId = user?.cafeId ?? '';
  const {
    categories,
    categoriesWithItems,
    items,
    stats,
    addItem,
    updateItem,
    moveItem,
    toggleItemAvailability,
    addCategory,
    renameCategory,
    moveCategoryOrder,
    removeCategory,
  } = useMenuManager(cafeId);

  const [query, setQuery] = useState('');
  const [activeCategoryId, setActiveCategoryId] = useState(ALL_CATEGORIES);
  /** `null` = form tertutup, `'add'` = tambah, atau item yang sedang diubah. */
  const [form, setForm] = useState<'add' | MenuItem | null>(null);
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false);
  /** Item yang sedang dipindahkan antar kategori. */
  const [movingItem, setMovingItem] = useState<MenuItem | null>(null);
  /** Item yang baru disimpan — dipakai untuk notifikasi & penanda pada kartu. */
  const [savedItem, setSavedItem] = useState<
    { id: string; action: SaveAction } | null
  >(null);

  const countByCategory = useMemo(
    () =>
      Object.fromEntries(
        categoriesWithItems.map((category) => [category.id, category.items.length]),
      ),
    [categoriesWithItems],
  );

  // Hasil penyaringan: kategori yang dipilih + pencocokan teks pada nama/deskripsi.
  const visibleCategories = useMemo(() => {
    const keyword = query.trim().toLowerCase();

    return categoriesWithItems
      .filter(
        (category) =>
          activeCategoryId === ALL_CATEGORIES || category.id === activeCategoryId,
      )
      .map((category) => ({
        ...category,
        items: keyword
          ? category.items.filter(
              (item) =>
                item.name.toLowerCase().includes(keyword) ||
                item.description.toLowerCase().includes(keyword),
            )
          : category.items,
      }))
      // Saat mencari, kategori tanpa hasil tidak perlu ditampilkan; tanpa
      // pencarian kategori kosong tetap tampil agar pemilik tahu ada wadahnya.
      .filter((category) => (keyword ? category.items.length > 0 : true));
  }, [categoriesWithItems, activeCategoryId, query]);

  const matchCount = visibleCategories.reduce(
    (sum, category) => sum + category.items.length,
    0,
  );

  const noticeItem = savedItem
    ? items.find((item) => item.id === savedItem.id) ?? null
    : null;

  // Notifikasi berhasil simpan hilang sendiri setelah beberapa detik.
  useEffect(() => {
    if (!savedItem) return;
    const timer = setTimeout(() => setSavedItem(null), 5000);
    return () => clearTimeout(timer);
  }, [savedItem]);

  const handleSubmitItem = async (values: MenuItemInput) => {
    if (form === 'add') {
      const created = await addItem(values);
      setSavedItem({ id: created.id, action: 'added' });
    } else if (form) {
      await updateItem(form.id, values);
      setSavedItem({ id: form.id, action: 'updated' });
    }

    setForm(null);
    // Pastikan item yang baru disimpan benar-benar terlihat, bukan tersembunyi
    // oleh penyaring atau pencarian yang sedang aktif.
    setQuery('');
    setActiveCategoryId(ALL_CATEGORIES);
  };

  const handleMoveItem = async (categoryId: string) => {
    if (!movingItem) return;
    await moveItem(movingItem.id, categoryId);
    setSavedItem({ id: movingItem.id, action: 'moved' });
    setMovingItem(null);
    // Item pindah kategori — jangan sampai hilang di balik penyaring lama.
    setQuery('');
    setActiveCategoryId(ALL_CATEGORIES);
  };

  const handleToggleAvailability = async (item: MenuItem) => {
    const nowAvailable = await toggleItemAvailability(item.id);
    setSavedItem({ id: item.id, action: nowAvailable ? 'shown' : 'hidden' });
  };

  if (!user) return <Navigate to="/login" replace />;

  const isFiltering = query.trim().length > 0 || activeCategoryId !== ALL_CATEGORIES;

  return (
    <AppLayout
      title="Manajemen Menu"
      subtitle={`${stats.itemCount} item · ${stats.categoryCount} kategori · ${user.cafeName}`}
      actions={
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setCategoryManagerOpen(true)}
            aria-label="Kelola kategori"
            className="flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-2 text-sm font-semibold text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-50 sm:px-3"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7h6l2 2h10v9a2 2 0 0 1-2 2H3Z" />
            </svg>
            <span className="hidden sm:inline">Kategori</span>
          </button>

          <button
            type="button"
            onClick={() => setForm('add')}
            className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            <span className="hidden sm:inline">Tambah Item</span>
            <span className="sr-only sm:hidden">Tambah item menu</span>
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        {noticeItem && savedItem && (
          <div
            role="status"
            className="flex items-start gap-3 rounded-2xl bg-emerald-50 px-4 py-3 ring-1 ring-emerald-200"
          >
            <span className="text-lg">✅</span>
            <p className="flex-1 text-sm text-emerald-800">
              <span className="font-semibold">{noticeItem.name}</span>{' '}
              {noticeText(
                savedItem.action,
                categories.find((c) => c.id === noticeItem.categoryId)?.name ?? '—',
              )}
            </p>
            <button
              type="button"
              onClick={() => setSavedItem(null)}
              aria-label="Tutup notifikasi"
              className="rounded-full p-1 text-emerald-600 transition hover:bg-emerald-100"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        <MenuStatsStrip stats={stats} />

        <MenuAdminToolbar
          query={query}
          onQueryChange={setQuery}
          categories={categories}
          activeCategoryId={activeCategoryId}
          onCategoryChange={setActiveCategoryId}
          countByCategory={countByCategory}
          totalCount={stats.itemCount}
        />

        {stats.itemCount === 0 && stats.categoryCount === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-20 text-center">
            <span className="text-4xl">🍽️</span>
            <h2 className="mt-3 text-lg font-semibold text-slate-700">
              Menu masih kosong
            </h2>
            <p className="mt-1 max-w-sm text-sm text-slate-500">
              Kafe {user.cafeName} belum punya kategori maupun item menu. Menu yang
              kamu tambahkan hanya akan terlihat oleh kafemu sendiri.
            </p>
            <button
              type="button"
              onClick={() => setCategoryManagerOpen(true)}
              className="mt-4 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
            >
              Buat kategori pertama
            </button>
          </div>
        ) : matchCount === 0 && isFiltering ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-16 text-center">
            <span className="text-3xl">🔍</span>
            <h2 className="mt-3 font-semibold text-slate-700">
              Tidak ada menu yang cocok
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Coba kata kunci lain atau pilih kategori “Semua”.
            </p>
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setActiveCategoryId(ALL_CATEGORIES);
              }}
              className="mt-4 rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-200"
            >
              Reset pencarian
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {isFiltering && (
              <p className="text-sm text-slate-500">
                Menampilkan {matchCount} dari {stats.itemCount} item.
              </p>
            )}

            {visibleCategories.map((category) => (
              <section key={category.id}>
                <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-slate-800">
                  {category.name}
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-500">
                    {category.items.length}
                  </span>
                </h2>

                {category.items.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-4 py-6 text-center text-sm text-slate-500">
                    Belum ada item pada kategori ini.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                    {category.items.map((item) => (
                      <MenuAdminItemCard
                        key={item.id}
                        item={item}
                        highlighted={item.id === savedItem?.id}
                        onEdit={setForm}
                        onMove={setMovingItem}
                        onToggleAvailability={handleToggleAvailability}
                      />
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>
        )}
      </div>

      {movingItem && (
        <MoveItemModal
          item={movingItem}
          categories={categoriesWithItems}
          onMove={handleMoveItem}
          onClose={() => setMovingItem(null)}
        />
      )}

      {categoryManagerOpen && (
        <CategoryManagerModal
          categories={categoriesWithItems}
          onAdd={addCategory}
          onRename={renameCategory}
          onReorder={moveCategoryOrder}
          onRemove={(id) => {
            removeCategory(id);
            // Jangan tinggalkan penyaring yang menunjuk kategori terhapus.
            if (activeCategoryId === id) setActiveCategoryId(ALL_CATEGORIES);
          }}
          onClose={() => setCategoryManagerOpen(false)}
        />
      )}

      {form && (
        <MenuItemFormModal
          // Remount saat berpindah item agar isi formulir ikut berganti.
          key={form === 'add' ? 'add' : form.id}
          categories={categories}
          item={form === 'add' ? null : form}
          defaultCategoryId={
            activeCategoryId === ALL_CATEGORIES ? undefined : activeCategoryId
          }
          existingNames={items
            .filter((item) => form === 'add' || item.id !== form.id)
            .map((item) => item.name.toLowerCase())}
          onSubmit={handleSubmitItem}
          onClose={() => setForm(null)}
        />
      )}
    </AppLayout>
  );
}
