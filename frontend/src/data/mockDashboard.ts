import type {
  DashboardSummary,
  RevenuePeriod,
  TopMenuItem,
} from '../types/dashboard';
import { mockMenuItems } from './mockMenu';

// Data tiruan dasbor pemilik. Fase backend akan menggantinya dengan
// GET /api/cafes/:cafeId/dashboard/summary.

export const mockDashboardSummary: DashboardSummary = {
  revenue: {
    today: 2_450_000,
    yesterday: 2_120_000,
    thisWeek: 14_780_000,
    thisMonth: 58_320_000,
  },
  orders: {
    ordersToday: 87,
    ordersYesterday: 79,
    activeOrders: 5,
  },
  updatedAt: new Date().toISOString(),
};

/**
 * Persentase perubahan terhadap pembanding. Mengembalikan `null` bila
 * pembanding nol (tidak ada dasar perbandingan yang bermakna).
 */
export function growthPercent(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

// ── Pemilih periode ──────────────────────────────────────────────────────────

export const REVENUE_PERIODS: {
  key: RevenuePeriod;
  label: string;
  caption: string;
}[] = [
  { key: 'today', label: 'Hari Ini', caption: 'Omzet hari ini' },
  { key: 'week', label: 'Minggu Ini', caption: 'Akumulasi 7 hari berjalan' },
  { key: 'month', label: 'Bulan Ini', caption: 'Akumulasi bulan berjalan' },
];

/**
 * Simulasi omzet bertambah karena ada pesanan baru yang dibayar.
 * Fase backend akan menggantinya dengan data dorongan realtime (WebSocket).
 */
export function randomRevenueTick(): number {
  // Kelipatan 5.000 antara 15.000–65.000 — menyerupai nilai satu pesanan.
  return 15_000 + Math.floor(Math.random() * 11) * 5_000;
}

// ── Menu terlaris ────────────────────────────────────────────────────────────

/** Ambil data menu (nama & foto) dari katalog tiruan berdasarkan id. */
function itemRef(id: string): { name: string; imageUrl: string } {
  const found = mockMenuItems.find((m) => m.id === id);
  return { name: found?.name ?? id, imageUrl: found?.imageUrl ?? '' };
}

export const mockTopMenuItems: TopMenuItem[] = [
  { menuItemId: 'item-kopisusu', soldCount: 128, ...itemRef('item-kopisusu') },
  { menuItemId: 'item-nasigoreng', soldCount: 96, ...itemRef('item-nasigoreng') },
  { menuItemId: 'item-latte', soldCount: 84, ...itemRef('item-latte') },
  { menuItemId: 'item-frenchfries', soldCount: 71, ...itemRef('item-frenchfries') },
  { menuItemId: 'item-matcha', soldCount: 63, ...itemRef('item-matcha') },
];

/**
 * Simulasi satu porsi terjual: menambah `soldCount` sebuah item secara acak,
 * dengan bobot lebih besar untuk item yang sudah populer.
 * Mengembalikan daftar baru (terurut menurun) dan id item yang bertambah.
 */
export function sellOneItem(items: TopMenuItem[]): {
  items: TopMenuItem[];
  soldId: string;
} {
  const total = items.reduce((sum, i) => sum + i.soldCount, 0);
  let threshold = Math.random() * total;
  let soldId = items[0].menuItemId;
  for (const item of items) {
    threshold -= item.soldCount;
    if (threshold <= 0) {
      soldId = item.menuItemId;
      break;
    }
  }

  const next = items
    .map((i) =>
      i.menuItemId === soldId ? { ...i, soldCount: i.soldCount + 1 } : i,
    )
    .sort((a, b) => b.soldCount - a.soldCount);

  return { items: next, soldId };
}
