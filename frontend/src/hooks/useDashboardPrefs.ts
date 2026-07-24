import { useCallback, useEffect, useState } from 'react';
import type { DashboardPreferences, DashboardWidgetKey } from '../types/dashboard';
import {
  DASHBOARD_PREFS_STORAGE_KEY,
  DEFAULT_PREFS,
  loadDashboardPrefs,
  saveDashboardPrefs,
} from '../lib/dashboardPrefs';

interface UseDashboardPrefs {
  prefs: DashboardPreferences;
  /** Jumlah widget yang sedang tampil. */
  visibleCount: number;
  /** Total widget yang tersedia. */
  totalCount: number;
  setWidget: (key: DashboardWidgetKey, value: boolean) => void;
  reset: () => void;
}

/**
 * Preferensi tampilan dasbor: memuat dari localStorage, menyimpan setiap
 * perubahan, dan ikut ter-update bila preferensi diubah dari tab lain
 * (event `storage`) sehingga dasbor konsisten di semua tab yang terbuka.
 */
export function useDashboardPrefs(): UseDashboardPrefs {
  const [prefs, setPrefs] = useState<DashboardPreferences>(loadDashboardPrefs);

  // Sinkronisasi antar-tab.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== DASHBOARD_PREFS_STORAGE_KEY) return;
      setPrefs(loadDashboardPrefs());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setWidget = useCallback((key: DashboardWidgetKey, value: boolean) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: value };
      saveDashboardPrefs(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    const next = { ...DEFAULT_PREFS };
    saveDashboardPrefs(next);
    setPrefs(next);
  }, []);

  const values = Object.values(prefs);

  return {
    prefs,
    visibleCount: values.filter(Boolean).length,
    totalCount: values.length,
    setWidget,
    reset,
  };
}
