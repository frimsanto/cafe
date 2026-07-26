import { useCallback, useEffect, useState } from 'react';
import type { PaymentConfigDTO } from '../types/api';
import { pembayaranApi } from '../api/pembayaran';
import { describeApiError } from '../lib/apiClient';

export interface PaymentConfigState {
  config: PaymentConfigDTO | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/**
 * Konfigurasi pembayaran kafe aktif (metode diterima + status Midtrans).
 * Diambil sekali; modal kasir memakainya untuk menampilkan tombol metode yang
 * benar-benar aktif. `cafeId` hanya dipakai sebagai pemicu muat ulang saat sesi
 * berganti — endpoint mengambil kafe dari token.
 */
export function usePaymentConfig(cafeId: string): PaymentConfigState {
  const [config, setConfig] = useState<PaymentConfigDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  useEffect(() => {
    if (!cafeId) return;
    let cancelled = false;
    setLoading(true);
    pembayaranApi
      .getConfig()
      .then((data) => {
        if (cancelled) return;
        setConfig(data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(describeApiError(err, 'Gagal memuat konfigurasi pembayaran.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cafeId, reloadKey]);

  return { config, loading, error, reload };
}
