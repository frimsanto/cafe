import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  MenuCategory,
  MenuCategoryWithItems,
  MenuItem,
  MenuItemInput,
} from '../types/menu';
import { menuApi } from '../api/menu';
import { describeApiError } from '../lib/apiClient';

export interface MenuStats {
  categoryCount: number;
  itemCount: number;
  availableCount: number;
  hiddenCount: number;
}

export interface MenuManager {
  /** Kategori milik kafe aktif, terurut sesuai `orderPosition`. */
  categories: MenuCategory[];
  /** Seluruh item milik kafe aktif. */
  items: MenuItem[];
  /** Kategori + item-nya — termasuk kategori yang masih kosong. */
  categoriesWithItems: MenuCategoryWithItems[];
  stats: MenuStats;
  loading: boolean;
  /** Kegagalan memuat data dari server. */
  error: string | null;
  reload: () => void;
  /** Tambah item baru; mengembalikan item yang tersimpan (beserta id barunya). */
  addItem: (input: MenuItemInput) => Promise<MenuItem>;
  /** Ubah item yang sudah ada. `id` & `cafeId` tidak ikut berubah. */
  updateItem: (id: string, input: MenuItemInput) => Promise<void>;
  /** Pindahkan item ke kategori lain tanpa mengubah data lainnya. */
  moveItem: (id: string, categoryId: string) => Promise<void>;
  /**
   * Sembunyikan/tampilkan item di menu pelanggan (`isAvailable`).
   * Mengembalikan status baru item tersebut.
   */
  toggleItemAvailability: (id: string) => Promise<boolean>;
  /** Tambah kategori baru di urutan paling akhir. */
  addCategory: (name: string) => Promise<void>;
  /** Ganti nama kategori. */
  renameCategory: (id: string, name: string) => Promise<void>;
  /**
   * Geser kategori satu langkah ke atas/bawah. Urutan inilah yang dipakai
   * menu digital pelanggan (`orderPosition`).
   */
  moveCategoryOrder: (id: string, direction: 'up' | 'down') => Promise<void>;
  /**
   * Hapus kategori. Hanya berlaku untuk kategori kosong — kategori yang masih
   * berisi item sengaja tidak bisa dihapus agar tidak ada item tanpa induk.
   */
  removeCategory: (id: string) => Promise<void>;
}

/**
 * Sumber data menu untuk halaman Manajemen Menu — seluruhnya dari API.
 *
 * Setiap perubahan dikirim ke server lalu daftar dimuat ulang, bukan ditambal
 * di klien: `orderPosition` kategori ditulis ulang server saat urutan berubah,
 * jadi hanya server yang tahu nilai akhirnya. Isolasi tenant ditegakkan
 * backend lewat token.
 */
export function useMenuManager(cafeId: string): MenuManager {
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  useEffect(() => {
    if (!cafeId) return;
    let cancelled = false;
    setLoading(true);

    Promise.all([menuApi.listCategories(cafeId), menuApi.listItems(cafeId)])
      .then(([cats, its]) => {
        if (cancelled) return;
        setCategories(cats);
        setItems(its);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setCategories([]);
        setItems([]);
        setError(describeApiError(err, 'Gagal memuat data menu.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [cafeId, reloadKey]);

  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.orderPosition - b.orderPosition),
    [categories],
  );

  const categoriesWithItems = useMemo(
    () =>
      sortedCategories.map((category) => ({
        ...category,
        items: items.filter((item) => item.categoryId === category.id),
      })),
    [sortedCategories, items],
  );

  const stats = useMemo<MenuStats>(() => {
    const availableCount = items.filter((item) => item.isAvailable).length;
    return {
      categoryCount: categories.length,
      itemCount: items.length,
      availableCount,
      hiddenCount: items.length - availableCount,
    };
  }, [categories, items]);

  const addItem = useCallback(
    async (input: MenuItemInput): Promise<MenuItem> => {
      const created = await menuApi.createItem(cafeId, input);
      setItems((prev) => [...prev, created]);
      return created;
    },
    [cafeId],
  );

  const updateItem = useCallback(
    async (id: string, input: MenuItemInput): Promise<void> => {
      const updated = await menuApi.updateItem(cafeId, id, input);
      setItems((prev) => prev.map((item) => (item.id === id ? updated : item)));
    },
    [cafeId],
  );

  const moveItem = useCallback(
    async (id: string, categoryId: string): Promise<void> => {
      const updated = await menuApi.moveItem(cafeId, id, categoryId);
      setItems((prev) => prev.map((item) => (item.id === id ? updated : item)));
    },
    [cafeId],
  );

  const toggleItemAvailability = useCallback(
    async (id: string): Promise<boolean> => {
      const next = !items.find((item) => item.id === id)?.isAvailable;
      const updated = await menuApi.setAvailability(cafeId, id, next);
      setItems((prev) => prev.map((item) => (item.id === id ? updated : item)));
      return updated.isAvailable;
    },
    [cafeId, items],
  );

  const addCategory = useCallback(
    async (name: string): Promise<void> => {
      const created = await menuApi.createCategory(cafeId, name.trim());
      setCategories((prev) => [...prev, created]);
    },
    [cafeId],
  );

  const renameCategory = useCallback(
    async (id: string, name: string): Promise<void> => {
      const updated = await menuApi.renameCategory(cafeId, id, name.trim());
      setCategories((prev) =>
        prev.map((category) => (category.id === id ? updated : category)),
      );
    },
    [cafeId],
  );

  const moveCategoryOrder = useCallback(
    async (id: string, direction: 'up' | 'down'): Promise<void> => {
      const ordered = [...sortedCategories];
      const index = ordered.findIndex((category) => category.id === id);
      const target = direction === 'up' ? index - 1 : index + 1;
      if (index === -1 || target < 0 || target >= ordered.length) return;

      [ordered[index], ordered[target]] = [ordered[target], ordered[index]];

      // Server menulis ulang `orderPosition` menjadi 1..n; pakai balasannya.
      const saved = await menuApi.reorderCategories(
        cafeId,
        ordered.map((category) => category.id),
      );
      setCategories(saved);
    },
    [cafeId, sortedCategories],
  );

  const removeCategory = useCallback(
    async (id: string): Promise<void> => {
      // Penjaga terakhir: UI sudah menonaktifkan tombol hapus untuk kategori
      // yang masih berisi item, tapi aturannya ditegakkan di sini juga.
      if (items.some((item) => item.categoryId === id)) return;
      await menuApi.deleteCategory(cafeId, id);
      setCategories((prev) => prev.filter((category) => category.id !== id));
    },
    [cafeId, items],
  );

  return {
    categories: sortedCategories,
    items,
    categoriesWithItems,
    stats,
    loading,
    error,
    reload,
    addItem,
    updateItem,
    moveItem,
    toggleItemAvailability,
    addCategory,
    renameCategory,
    moveCategoryOrder,
    removeCategory,
  };
}
