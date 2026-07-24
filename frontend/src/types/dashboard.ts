// Tipe data dasbor pemilik — ringkasan omzet & aktivitas kafe.
// Bentuknya disiapkan agar mudah diganti respons API (fase backend).

/** Periode yang bisa dipilih pemilik pada metrik omzet. */
export type RevenuePeriod = 'today' | 'week' | 'month';

export interface RevenueSummary {
  /** Total omzet hari ini (Rupiah). */
  today: number;
  /** Omzet kemarin — pembanding untuk tren harian. */
  yesterday: number;
  /** Akumulasi omzet minggu berjalan. */
  thisWeek: number;
  /** Akumulasi omzet bulan berjalan. */
  thisMonth: number;
}

export interface OrderStats {
  /** Jumlah pesanan hari ini. */
  ordersToday: number;
  /** Jumlah pesanan kemarin — pembanding tren. */
  ordersYesterday: number;
  /** Pesanan yang masih diproses dapur saat ini. */
  activeOrders: number;
}

/** Widget yang bisa ditampilkan/disembunyikan pemilik di dasbor. */
export type DashboardWidgetKey =
  | 'revenue'
  | 'ordersToday'
  | 'activeOrders'
  | 'revenueTrend'
  | 'topMenu';

/** Preferensi tampilan dasbor (disimpan di localStorage). */
export type DashboardPreferences = Record<DashboardWidgetKey, boolean>;

/** Satu baris peringkat menu terlaris. */
export interface TopMenuItem {
  menuItemId: string;
  name: string;
  imageUrl: string;
  /** Jumlah porsi terjual pada periode berjalan. */
  soldCount: number;
}

export interface DashboardSummary {
  revenue: RevenueSummary;
  orders: OrderStats;
  /** Waktu data terakhir diperbarui (ISO). */
  updatedAt: string;
}
