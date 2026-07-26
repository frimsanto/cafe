import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ManualMethodCode } from '../types/order';
import type { CashierOrderDTO } from '../types/api';
import { cashierApi } from '../api/orders';
import { pembayaranApi } from '../api/pembayaran';
import { describeApiError } from '../lib/apiClient';
import { subscribeRealtime } from '../lib/realtime';

/** Fallback polling antrean (mis. status Midtrans berubah tanpa event WS). */
const POLL_MS = 5_000;

export interface CashierOrders {
  /** Pesanan yang menunggu pembayaran, terlama di urutan pertama (FIFO). */
  pending: CashierOrderDTO[];
  /** Jumlah rupiah seluruh pesanan yang masih menunggu. */
  totalPending: number;
  loading: boolean;
  error: string | null;
  reload: () => void;
  /**
   * Konfirmasi pembayaran manual lewat jalur pembayaran baru. Backend mencatat
   * bukti, memindahkan pesanan ke dapur, dan menyiarkannya. Mengembalikan
   * pesanan versi terbayar untuk struk & notifikasi.
   */
  markPaidManual: (
    orderId: string,
    metode: ManualMethodCode,
    nominal: number,
    catatan: string | null,
  ) => Promise<CashierOrderDTO>;
}

/**
 * Antrean pembayaran kasir untuk kafe yang sedang masuk.
 *
 * Isolasi tenant ditegakkan backend lewat token; daftar yang dikembalikan
 * sudah hanya berisi pesanan kafe pengguna. Antrean ikut diperbarui realtime
 * agar kasir kedua tidak menagih pesanan yang baru saja dibayar di kasir lain.
 */
export function useCashierOrders(cafeId: string): CashierOrders {
  const [orders, setOrders] = useState<CashierOrderDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  useEffect(() => {
    if (!cafeId) return;
    let cancelled = false;
    setLoading(true);

    cashierApi
      .listPendingOrders(cafeId)
      .then((data) => {
        if (cancelled) return;
        setOrders(data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setOrders([]);
        setError(describeApiError(err, 'Gagal memuat antrean kasir.'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [cafeId, reloadKey]);

  // Pesanan baru masuk antrean, atau pesanan dibayar dari perangkat lain.
  useEffect(() => {
    if (!cafeId) return;
    return subscribeRealtime(cafeId, (message) => {
      if (
        message.type === 'kitchen.order.created' ||
        message.type === 'table.status.changed'
      ) {
        reload();
      }
    });
  }, [cafeId, reload]);

  // Fallback polling: menangkap perubahan status pembayaran (mis. Midtrans GAGAL)
  // yang tidak memancarkan event WebSocket khusus.
  useEffect(() => {
    if (!cafeId) return;
    const id = setInterval(reload, POLL_MS);
    return () => clearInterval(id);
  }, [cafeId, reload]);

  const pending = useMemo(
    () =>
      [...orders].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt)),
    [orders],
  );

  const totalPending = pending.reduce((sum, order) => sum + order.totalAmount, 0);

  const markPaidManual = useCallback(
    async (
      orderId: string,
      metode: ManualMethodCode,
      nominal: number,
      catatan: string | null,
    ): Promise<CashierOrderDTO> => {
      const paid = await pembayaranApi.konfirmasiManual({
        orderId,
        metode,
        nominal,
        catatanKasir: catatan ?? undefined,
      });
      // Keluarkan dari antrean seketika; siaran realtime menyusul untuk
      // perangkat lain.
      setOrders((prev) => prev.filter((order) => order.id !== orderId));
      return paid;
    },
    [],
  );

  return { pending, totalPending, loading, error, reload, markPaidManual };
}
