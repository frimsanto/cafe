import type {
  MenuCategory,
  MenuCategoryWithItems,
  MenuItem,
  MenuItemInput,
} from '../types/menu';
import { apiFetch } from '../lib/apiClient';

// Endpoint menu. Membaca menu bersifat PUBLIK (pelanggan memindai QR tanpa
// akun); seluruh operasi tulis hanya untuk OWNER kafe bersangkutan dan
// dilindungi token di sisi backend.

const cafeBase = (cafeId: string) => `/api/cafes/${encodeURIComponent(cafeId)}`;
const id = encodeURIComponent;

export const menuApi = {
  /** Menu lengkap dikelompokkan per kategori — dipakai halaman menu pelanggan. */
  grouped(cafeId: string, availableOnly = false): Promise<MenuCategoryWithItems[]> {
    const query = availableOnly ? '?available=true' : '';
    return apiFetch<MenuCategoryWithItems[]>(`${cafeBase(cafeId)}/menu${query}`);
  },

  listCategories(cafeId: string): Promise<MenuCategory[]> {
    return apiFetch<MenuCategory[]>(`${cafeBase(cafeId)}/categories`);
  },

  listItems(cafeId: string): Promise<MenuItem[]> {
    return apiFetch<MenuItem[]>(`${cafeBase(cafeId)}/menu-items`);
  },

  createCategory(cafeId: string, name: string): Promise<MenuCategory> {
    return apiFetch<MenuCategory>(`${cafeBase(cafeId)}/categories`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  },

  renameCategory(
    cafeId: string,
    categoryId: string,
    name: string,
  ): Promise<MenuCategory> {
    return apiFetch<MenuCategory>(`${cafeBase(cafeId)}/categories/${id(categoryId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    });
  },

  /** Simpan urutan kategori hasil seret-lepas (kirim seluruh urutan baru). */
  reorderCategories(cafeId: string, categoryIds: string[]): Promise<MenuCategory[]> {
    return apiFetch<MenuCategory[]>(`${cafeBase(cafeId)}/categories/order`, {
      method: 'PUT',
      body: JSON.stringify({ categoryIds }),
    });
  },

  deleteCategory(cafeId: string, categoryId: string): Promise<void> {
    return apiFetch<void>(`${cafeBase(cafeId)}/categories/${id(categoryId)}`, {
      method: 'DELETE',
    });
  },

  createItem(cafeId: string, input: MenuItemInput): Promise<MenuItem> {
    return apiFetch<MenuItem>(`${cafeBase(cafeId)}/menu-items`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  updateItem(
    cafeId: string,
    itemId: string,
    input: Partial<MenuItemInput>,
  ): Promise<MenuItem> {
    return apiFetch<MenuItem>(`${cafeBase(cafeId)}/menu-items/${id(itemId)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },

  /** Aktif/nonaktifkan ketersediaan item (tombol cepat di manajemen menu). */
  setAvailability(
    cafeId: string,
    itemId: string,
    isAvailable: boolean,
  ): Promise<MenuItem> {
    return apiFetch<MenuItem>(
      `${cafeBase(cafeId)}/menu-items/${id(itemId)}/availability`,
      { method: 'PATCH', body: JSON.stringify({ isAvailable }) },
    );
  },

  /** Pindahkan item ke kategori lain. */
  moveItem(cafeId: string, itemId: string, categoryId: string): Promise<MenuItem> {
    return apiFetch<MenuItem>(`${cafeBase(cafeId)}/menu-items/${id(itemId)}/move`, {
      method: 'POST',
      body: JSON.stringify({ categoryId }),
    });
  },

  deleteItem(cafeId: string, itemId: string): Promise<void> {
    return apiFetch<void>(`${cafeBase(cafeId)}/menu-items/${id(itemId)}`, {
      method: 'DELETE',
    });
  },
};
