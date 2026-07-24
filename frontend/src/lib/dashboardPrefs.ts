import type { DashboardPreferences, DashboardWidgetKey } from '../types/dashboard';

/** Kunci localStorage — diekspor agar sinkronisasi antar-tab bisa memfilter event. */
export const DASHBOARD_PREFS_STORAGE_KEY = 'cafeos-dashboard-prefs';

/** Semua widget tampil secara bawaan. */
export const DEFAULT_PREFS: DashboardPreferences = {
  revenue: true,
  ordersToday: true,
  activeOrders: true,
  revenueTrend: true,
  topMenu: true,
};

/** Metadata widget untuk panel kustomisasi. */
export const WIDGET_OPTIONS: {
  key: DashboardWidgetKey;
  label: string;
  description: string;
  icon: string;
}[] = [
  {
    key: 'revenue',
    label: 'Omzet',
    description: 'Total pendapatan dengan pemilih periode',
    icon: '💰',
  },
  {
    key: 'ordersToday',
    label: 'Pesanan Hari Ini',
    description: 'Jumlah pesanan hari ini beserta trennya',
    icon: '🧾',
  },
  {
    key: 'activeOrders',
    label: 'Sedang Diproses',
    description: 'Pesanan yang sedang disiapkan dapur',
    icon: '🍳',
  },
  {
    key: 'revenueTrend',
    label: 'Tren Omzet',
    description: 'Grafik pergerakan omzet harian',
    icon: '📈',
  },
  {
    key: 'topMenu',
    label: 'Menu Terlaris',
    description: 'Peringkat menu paling sering dipesan',
    icon: '🏆',
  },
];

/**
 * Baca preferensi dari localStorage, digabung di atas nilai bawaan sehingga
 * widget baru tetap muncul walau preferensi lama sudah tersimpan.
 */
export function loadDashboardPrefs(): DashboardPreferences {
  if (typeof window === 'undefined') return { ...DEFAULT_PREFS };
  try {
    const raw = window.localStorage.getItem(DASHBOARD_PREFS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<DashboardPreferences>;
    return { ...DEFAULT_PREFS, ...parsed };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function saveDashboardPrefs(prefs: DashboardPreferences): void {
  try {
    window.localStorage.setItem(DASHBOARD_PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* storage tidak tersedia / penuh — abaikan */
  }
}
