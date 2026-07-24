// Tipe data dasbor pemilik — ringkasan omzet & aktivitas kafe.
// Bentuknya disiapkan agar mudah diganti respons API (fase backend).

/** Periode yang bisa dipilih pemilik pada metrik omzet. */
export type RevenuePeriod = 'today' | 'week' | 'month';

/** Label pemilih periode. Konfigurasi tampilan, bukan data — selalu statis. */
export const REVENUE_PERIODS: {
  key: RevenuePeriod;
  label: string;
  caption: string;
}[] = [
  { key: 'today', label: 'Hari Ini', caption: 'Omzet hari ini' },
  { key: 'week', label: 'Minggu Ini', caption: 'Akumulasi 7 hari berjalan' },
  { key: 'month', label: 'Bulan Ini', caption: 'Akumulasi bulan berjalan' },
];

/** Keterangan pembanding yang ditampilkan di samping angka pertumbuhan. */
export const PERIOD_COMPARISON_LABEL: Record<RevenuePeriod, string> = {
  today: 'vs kemarin',
  week: 'vs minggu lalu',
  month: 'vs bulan lalu',
};

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
