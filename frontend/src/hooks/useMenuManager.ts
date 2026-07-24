import { useCallback, useMemo, useState } from 'react';
import type {
  MenuCategory,
  MenuCategoryWithItems,
  MenuItem,
  MenuItemInput,
} from '../types/menu';
import { mockCategories, mockMenuItems } from '../data/mockMenu';

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
  /** Tambah item baru; mengembalikan item yang tersimpan (beserta id barunya). */
  addItem: (input: MenuItemInput) => MenuItem;
  /** Ubah item yang sudah ada. `id` & `cafeId` tidak ikut berubah. */
  updateItem: (id: string, input: MenuItemInput) => void;
  /** Pindahkan item ke kategori lain tanpa mengubah data lainnya. */
  moveItem: (id: string, categoryId: string) => void;
  /**
   * Sembunyikan/tampilkan item di menu pelanggan (`isAvailable`).
   * Mengembalikan status baru item tersebut.
   */
  toggleItemAvailability: (id: string) => boolean;
  /** Tambah kategori baru di urutan paling akhir. */
  addCategory: (name: string) => MenuCategory;
  /** Ganti nama kategori. */
  renameCategory: (id: string, name: string) => void;
  /**
   * Geser kategori satu langkah ke atas/bawah. Urutan inilah yang dipakai
   * menu digital pelanggan (`orderPosition`).
   */
  moveCategoryOrder: (id: string, direction: 'up' | 'down') => void;
  /**
   * Hapus kategori. Hanya berlaku untuk kategori kosong — kategori yang masih
   * berisi item sengaja tidak bisa dihapus agar tidak ada item tanpa induk.
   */
  removeCategory: (id: string) => void;
  setCategories: React.Dispatch<React.SetStateAction<MenuCategory[]>>;
  setItems: React.Dispatch<React.SetStateAction<MenuItem[]>>;
}

function newItemId(): string {
  return `item-${Math.random().toString(36).slice(2, 10)}`;
}

function newCategoryId(): string {
  return `cat-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Sumber data menu yang bisa diubah untuk halaman Manajemen Menu.
 *
 * Berbeda dengan `getMenuByCategoryForCafe` (baca-saja) di `data/mockMenu`,
 * hook ini menyalin data tiruan ke dalam state sehingga tambah/ubah/hapus bisa
 * langsung terlihat di UI selama fase frontend. Data disaring per `cafeId`
 * (isolasi multi-tenant) — kafe yang baru mendaftar mulai dengan menu kosong.
 *
 * Fase backend akan mengganti state awal ini dengan hasil pemanggilan API.
 */
export function useMenuManager(cafeId: string): MenuManager {
  const [categories, setCategories] = useState<MenuCategory[]>(() =>
    mockCategories.filter((category) => category.cafeId === cafeId),
  );
  const [items, setItems] = useState<MenuItem[]>(() =>
    mockMenuItems.filter((item) => item.cafeId === cafeId),
  );

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
    (input: MenuItemInput): MenuItem => {
      const item: MenuItem = { ...input, id: newItemId(), cafeId };
      // Item baru diletakkan di akhir kategorinya (urutan tambah).
      setItems((prev) => [...prev, item]);
      return item;
    },
    [cafeId],
  );

  const updateItem = useCallback((id: string, input: MenuItemInput) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...input } : item)),
    );
  }, []);

  const moveItem = useCallback((id: string, categoryId: string) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, categoryId } : item)),
    );
  }, []);

  const toggleItemAvailability = useCallback(
    (id: string): boolean => {
      const next = !items.find((item) => item.id === id)?.isAvailable;
      setItems((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, isAvailable: next } : item,
        ),
      );
      return next;
    },
    [items],
  );

  const addCategory = useCallback(
    (name: string): MenuCategory => {
      const lastPosition = categories.reduce(
        (max, current) => Math.max(max, current.orderPosition),
        0,
      );
      const category: MenuCategory = {
        id: newCategoryId(),
        cafeId,
        name: name.trim(),
        orderPosition: lastPosition + 1,
      };

      setCategories((prev) => [...prev, category]);
      return category;
    },
    [cafeId, categories],
  );

  const renameCategory = useCallback((id: string, name: string) => {
    setCategories((prev) =>
      prev.map((category) =>
        category.id === id ? { ...category, name: name.trim() } : category,
      ),
    );
  }, []);

  const moveCategoryOrder = useCallback(
    (id: string, direction: 'up' | 'down') => {
      const ordered = [...sortedCategories];
      const index = ordered.findIndex((category) => category.id === id);
      const target = direction === 'up' ? index - 1 : index + 1;
      if (index === -1 || target < 0 || target >= ordered.length) return;

      [ordered[index], ordered[target]] = [ordered[target], ordered[index]];

      // Tulis ulang `orderPosition` menjadi 1..n supaya tidak ada celah/ganda.
      setCategories(
        ordered.map((category, position) => ({
          ...category,
          orderPosition: position + 1,
        })),
      );
    },
    [sortedCategories],
  );

  const removeCategory = useCallback(
    (id: string) => {
      // Penjaga terakhir: UI sudah menonaktifkan tombol hapus untuk kategori
      // yang masih berisi item, tapi aturannya ditegakkan di sini juga.
      if (items.some((item) => item.categoryId === id)) return;
      setCategories((prev) => prev.filter((category) => category.id !== id));
    },
    [items],
  );

  return {
    categories: sortedCategories,
    items,
    categoriesWithItems,
    stats,
    addItem,
    updateItem,
    moveItem,
    toggleItemAvailability,
    addCategory,
    renameCategory,
    moveCategoryOrder,
    removeCategory,
    setCategories,
    setItems,
  };
}
