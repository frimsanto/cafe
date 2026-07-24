import type {
  CafeInfo,
  MenuCategory,
  MenuCategoryWithItems,
  MenuItem,
  TableInfo,
} from '../types/menu';

// ── Data tiruan (mock) untuk fase frontend ──────────────────────────────────
// Fase backend nanti akan mengganti sumber data ini dengan pemanggilan API
// (mis. GET /cafes/:id/menu). Bentuk data sengaja dibuat sama dengan skema DB
// pada PRD agar migrasi ke data asli mulus.

const CAFE_ID = 'cafe-demo-001';

export const mockCafe: CafeInfo = {
  id: CAFE_ID,
  name: 'Kopi Senja',
  tagline: 'Ngopi santai, pesan langsung dari meja',
};

export const mockTable: TableInfo = {
  id: 'table-12',
  tableName: 'Meja 12',
};

export const mockCategories: MenuCategory[] = [
  { id: 'cat-kopi', cafeId: CAFE_ID, name: 'Kopi', orderPosition: 1 },
  { id: 'cat-nonkopi', cafeId: CAFE_ID, name: 'Non-Kopi', orderPosition: 2 },
  { id: 'cat-makanan', cafeId: CAFE_ID, name: 'Makanan', orderPosition: 3 },
  { id: 'cat-cemilan', cafeId: CAFE_ID, name: 'Cemilan', orderPosition: 4 },
  { id: 'cat-dessert', cafeId: CAFE_ID, name: 'Dessert', orderPosition: 5 },
];

export const mockMenuItems: MenuItem[] = [
  // Kopi
  {
    id: 'item-espresso',
    cafeId: CAFE_ID,
    categoryId: 'cat-kopi',
    name: 'Espresso',
    description: 'Single shot kopi arabika, pekat dan aromatik.',
    price: 18000,
    imageUrl:
      'https://images.unsplash.com/photo-1510707577719-ae7c14805e3a?auto=format&fit=crop&w=400&q=60',
    isAvailable: true,
  },
  {
    id: 'item-latte',
    cafeId: CAFE_ID,
    categoryId: 'cat-kopi',
    name: 'Caffè Latte',
    description: 'Espresso dengan steamed milk lembut dan latte art.',
    price: 28000,
    imageUrl:
      'https://images.unsplash.com/photo-1541167760496-1628856ab772?auto=format&fit=crop&w=400&q=60',
    isAvailable: true,
  },
  {
    id: 'item-kopisusu',
    cafeId: CAFE_ID,
    categoryId: 'cat-kopi',
    name: 'Kopi Susu Gula Aren',
    description: 'Racikan favorit dengan manis alami gula aren.',
    price: 24000,
    imageUrl:
      'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?auto=format&fit=crop&w=400&q=60',
    isAvailable: true,
  },
  {
    id: 'item-americano',
    cafeId: CAFE_ID,
    categoryId: 'cat-kopi',
    name: 'Americano',
    description: 'Espresso dengan air panas, ringan dan menyegarkan.',
    price: 22000,
    imageUrl:
      'https://images.unsplash.com/photo-1521302080334-4bebac2763a6?auto=format&fit=crop&w=400&q=60',
    isAvailable: false,
  },

  // Non-Kopi
  {
    id: 'item-matcha',
    cafeId: CAFE_ID,
    categoryId: 'cat-nonkopi',
    name: 'Matcha Latte',
    description: 'Bubuk matcha premium dengan susu segar.',
    price: 30000,
    imageUrl:
      'https://images.unsplash.com/photo-1515823064-d6e0c04616a7?auto=format&fit=crop&w=400&q=60',
    isAvailable: true,
  },
  {
    id: 'item-coklat',
    cafeId: CAFE_ID,
    categoryId: 'cat-nonkopi',
    name: 'Cokelat Panas',
    description: 'Cokelat Belgia lumer, hangat dan creamy.',
    price: 27000,
    imageUrl:
      'https://images.unsplash.com/photo-1542990253-0d0f5be5f0ed?auto=format&fit=crop&w=400&q=60',
    isAvailable: true,
  },
  {
    id: 'item-lemontea',
    cafeId: CAFE_ID,
    categoryId: 'cat-nonkopi',
    name: 'Lemon Tea',
    description: 'Teh hitam segar dengan perasan lemon asli.',
    price: 20000,
    imageUrl:
      'https://images.unsplash.com/photo-1499638673689-79a0b5115d87?auto=format&fit=crop&w=400&q=60',
    isAvailable: true,
  },

  // Makanan
  {
    id: 'item-nasigoreng',
    cafeId: CAFE_ID,
    categoryId: 'cat-makanan',
    name: 'Nasi Goreng Spesial',
    description: 'Nasi goreng dengan telur, ayam, dan acar.',
    price: 35000,
    imageUrl:
      'https://images.unsplash.com/photo-1603133872878-684f208fb84b?auto=format&fit=crop&w=400&q=60',
    isAvailable: true,
  },
  {
    id: 'item-spaghetti',
    cafeId: CAFE_ID,
    categoryId: 'cat-makanan',
    name: 'Spaghetti Aglio Olio',
    description: 'Pasta dengan bawang putih, cabai, dan olive oil.',
    price: 38000,
    imageUrl:
      'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?auto=format&fit=crop&w=400&q=60',
    isAvailable: true,
  },
  {
    id: 'item-sandwich',
    cafeId: CAFE_ID,
    categoryId: 'cat-makanan',
    name: 'Chicken Sandwich',
    description: 'Roti panggang isi ayam, keju, dan selada.',
    price: 32000,
    imageUrl:
      'https://images.unsplash.com/photo-1528735602780-2552fd46c7af?auto=format&fit=crop&w=400&q=60',
    isAvailable: false,
  },

  // Cemilan
  {
    id: 'item-frenchfries',
    cafeId: CAFE_ID,
    categoryId: 'cat-cemilan',
    name: 'French Fries',
    description: 'Kentang goreng renyah dengan saus.',
    price: 22000,
    imageUrl:
      'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?auto=format&fit=crop&w=400&q=60',
    isAvailable: true,
  },
  {
    id: 'item-pisangkeju',
    cafeId: CAFE_ID,
    categoryId: 'cat-cemilan',
    name: 'Pisang Goreng Keju',
    description: 'Pisang goreng crispy dengan taburan keju.',
    price: 18000,
    imageUrl:
      'https://images.unsplash.com/photo-1592151675528-1a0c09dde9b2?auto=format&fit=crop&w=400&q=60',
    isAvailable: true,
  },

  // Dessert
  {
    id: 'item-cheesecake',
    cafeId: CAFE_ID,
    categoryId: 'cat-dessert',
    name: 'Classic Cheesecake',
    description: 'Cheesecake lembut dengan base biskuit.',
    price: 33000,
    imageUrl:
      'https://images.unsplash.com/photo-1533134242443-d4fd215305ad?auto=format&fit=crop&w=400&q=60',
    isAvailable: true,
  },
  {
    id: 'item-brownies',
    cafeId: CAFE_ID,
    categoryId: 'cat-dessert',
    name: 'Brownies à la Mode',
    description: 'Brownies cokelat hangat dengan es krim vanila.',
    price: 29000,
    imageUrl:
      'https://images.unsplash.com/photo-1606313564200-e75d5e30476c?auto=format&fit=crop&w=400&q=60',
    isAvailable: true,
  },
];

/**
 * Gabungkan kategori + item menjadi bentuk siap-render, terurut sesuai
 * `orderPosition`. Kategori tanpa item disembunyikan.
 */
export function getMenuByCategory(): MenuCategoryWithItems[] {
  return [...mockCategories]
    .sort((a, b) => a.orderPosition - b.orderPosition)
    .map((category) => ({
      ...category,
      items: mockMenuItems.filter((item) => item.categoryId === category.id),
    }))
    .filter((category) => category.items.length > 0);
}

/**
 * Menu milik SATU kafe saja (isolasi data multi-tenant): hanya kategori & item
 * yang `cafeId`-nya cocok yang dikembalikan. Kafe yang baru dibuat otomatis
 * mendapat daftar kosong karena belum punya data sendiri.
 */
export function getMenuByCategoryForCafe(cafeId: string): MenuCategoryWithItems[] {
  return [...mockCategories]
    .filter((category) => category.cafeId === cafeId)
    .sort((a, b) => a.orderPosition - b.orderPosition)
    .map((category) => ({
      ...category,
      items: mockMenuItems.filter(
        (item) => item.categoryId === category.id && item.cafeId === cafeId,
      ),
    }));
}
