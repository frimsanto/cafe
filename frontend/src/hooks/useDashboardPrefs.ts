import { useCallback, useEffect, useState } from 'react';
import type { DashboardPreferences, DashboardWidgetKey } from '../types/dashboard';
import {
  DASHBOARD_PREFS_STORAGE_KEY,
  DEFAULT_PREFS,
  loadDashboardPrefs,
  saveDashboardPrefs,
} from '../lib/dashboardPrefs';
import { dashboardApi } from '../api/dashboard';

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
 * Preferensi tampilan dasbor, tersimpan di server per pengguna sehingga ikut
 * berpindah saat pemilik membuka dasbor dari perangkat lain.
 *
 * localStorage tetap dipakai sebagai singgahan: nilainya dipakai untuk render
 * pertama supaya dasbor tidak berkedip menunggu jaringan, lalu ditimpa begitu
 * jawaban server tiba. Kegagalan menyimpan ke server sengaja tidak
 * dimunculkan sebagai error — ini preferensi tampilan, bukan data usaha, dan
 * salinan lokalnya sudah tersimpan.
 */
export function useDashboardPrefs(cafeId: string): UseDashboardPrefs {
  const [prefs, setPrefs] = useState<DashboardPreferences>(loadDashboardPrefs);

  // Muat preferensi milik pengguna dari server.
  useEffect(() => {
    if (!cafeId) return;
    let cancelled = false;

    dashboardApi
      .getPreferences(cafeId)
      .then((remote) => {
        if (cancelled) return;
        // Server hanya menyimpan kunci yang pernah diubah; gabungkan di atas
        // default agar widget baru tetap punya nilai.
        const merged = { ...DEFAULT_PREFS, ...remote };
        setPrefs(merged);
        saveDashboardPrefs(merged);
      })
      .catch(() => {
        /* biarkan memakai salinan lokal — dasbor tetap bisa dipakai */
      });

    return () => {
      cancelled = true;
    };
  }, [cafeId]);

  // Sinkronisasi antar-tab pada perangkat yang sama.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== DASHBOARD_PREFS_STORAGE_KEY) return;
      setPrefs(loadDashboardPrefs());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const persist = useCallback(
    (next: DashboardPreferences) => {
      saveDashboardPrefs(next);
      if (cafeId) {
        void dashboardApi.savePreferences(cafeId, next).catch(() => {
          /* tersimpan lokal; sinkronisasi menyusul saat online */
        });
      }
    },
    [cafeId],
  );

  const setWidget = useCallback(
    (key: DashboardWidgetKey, value: boolean) => {
      setPrefs((prev) => {
        const next = { ...prev, [key]: value };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const reset = useCallback(() => {
    const next = { ...DEFAULT_PREFS };
    persist(next);
    setPrefs(next);
  }, [persist]);

  const values = Object.values(prefs);

  return {
    prefs,
    visibleCount: values.filter(Boolean).length,
    totalCount: values.length,
    setWidget,
    reset,
  };
}
