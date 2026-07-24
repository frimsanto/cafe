import { useCallback, useMemo, useState } from 'react';
import type { Order, PaymentMethodCode } from '../types/order';
import { mockCashierOrders } from '../data/mockCashierOrders';
import { releaseToKitchen } from '../order/kitchenQueue';

export interface CashierOrders {
  /** Pesanan yang menunggu pembayaran, terlama di urutan pertama (FIFO). */
  pending: Order[];
  /** Jumlah rupiah seluruh pesanan yang masih menunggu. */
  totalPending: number;
  /**
   * Tandai satu pesanan lunas: pesanan keluar dari antrean kasir, pembayarannya
   * tercatat SUCCESS, dan pesanan dirilis ke Layar Dapur. Mengembalikan pesanan
   * versi terbayar (untuk struk & notifikasi), atau `null` bila id tak ditemukan.
   */
  markPaid: (orderId: string, method: PaymentMethodCode) => Order | null;
}

/**
 * Antrean pembayaran kasir untuk kafe yang sedang masuk.
 *
 * Fase frontend: sumbernya data tiruan `mockCashierOrders`. Fase backend akan
 * menggantinya dengan GET pesanan berstatus MENUNGGU_PEMBAYARAN + WebSocket.
 */
export function useCashierOrders(cafeId: string): CashierOrders {
  const [orders, setOrders] = useState<Order[]>(() =>
    // Isolasi tenant: hanya pesanan kafe pengguna yang tampil.
    mockCashierOrders.filter((order) => order.cafeId === cafeId),
  );

  const pending = useMemo(
    () =>
      [...orders].sort(
        (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
      ),
    [orders],
  );

  const totalPending = pending.reduce((sum, order) => sum + order.totalAmount, 0);

  const markPaid = useCallback(
    (orderId: string, method: PaymentMethodCode): Order | null => {
      const found = orders.find((order) => order.id === orderId);
      if (!found) return null;

      const paid: Order = {
        ...found,
        // Pesanan baru boleh masuk dapur setelah pembayaran dikonfirmasi.
        status: 'DIPROSES_DAPUR',
        payment: {
          method,
          status: 'SUCCESS',
          transactionId: `TRX-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        },
      };

      setOrders((prev) => prev.filter((order) => order.id !== orderId));
      // Pembayaran dikonfirmasi → pesanan baru boleh tampil di Layar Dapur.
      releaseToKitchen(paid);
      return paid;
    },
    [orders],
  );

  return { pending, totalPending, markPaid };
}
