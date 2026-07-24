// Tipe data domain menu — mengikuti skema `menu_categories` & `menu_items` pada PRD.
// Dipakai lintas fitur (menu digital, keranjang, KDS, manajemen menu).

export interface MenuCategory {
  id: string;
  cafeId: string;
  name: string;
  /** Urutan tampil kategori pada menu digital (order_position). */
  orderPosition: number;
}

export interface MenuItem {
  id: string;
  cafeId: string;
  categoryId: string;
  name: string;
  description: string;
  /** Harga dalam Rupiah (bilangan bulat, tanpa desimal). */
  price: number;
  imageUrl: string;
  isAvailable: boolean;
}

/**
 * Data item menu yang diisi lewat formulir manajemen menu. `id` dibuat oleh
 * sistem dan `cafeId` diambil dari kafe yang sedang masuk, jadi keduanya tidak
 * pernah diisi manual.
 */
export type MenuItemInput = Omit<MenuItem, 'id' | 'cafeId'>;

/** Kategori beserta daftar item-nya — bentuk siap-render untuk halaman menu. */
export interface MenuCategoryWithItems extends MenuCategory {
  items: MenuItem[];
}

/** Info kafe & meja hasil terjemahan QR code (`GET /api/tables/by-qr/:qrCode`). */
export interface CafeInfo {
  id: string;
  name: string;
  tagline: string;
}

export interface TableInfo {
  id: string;
  tableName: string;
}
