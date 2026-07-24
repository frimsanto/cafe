import type { KitchenStatus, PaymentMethodCode } from '../types/order';
import type {
  CashierOrderDTO,
  OrderDTO,
  OrderWithTableDTO,
  PublicTableDTO,
} from '../types/api';
import { apiFetch } from '../lib/apiClient';

// Endpoint pesanan, kasir, dapur, dan struk. Semuanya berbagi bentuk `Order`
// yang sama (`OrderDTO` di backend), jadi dikumpulkan dalam satu modul.

const cafeBase = (cafeId: string) => `/api/cafes/${encodeURIComponent(cafeId)}`;
const id = encodeURIComponent;

/** Satu baris pesanan yang dikirim pelanggan saat checkout. */
export interface NewOrderItem {
  menuItemId: string;
  quantity: number;
  notes: string;
}

export const ordersApi = {
  /**
   * Terjemahkan hasil pindai QR menjadi meja + kafe. PUBLIK — pemindainya
   * pelanggan yang memang tidak punya akun.
   */
  resolveTableByQr(qrCode: string): Promise<PublicTableDTO> {
    return apiFetch<PublicTableDTO>(`/api/tables/by-qr/${id(qrCode)}`);
  },

  /** Buat pesanan baru (status awal: menunggu pembayaran). */
  create(
    cafeId: string,
    tableId: string,
    items: NewOrderItem[],
  ): Promise<OrderDTO> {
    return apiFetch<OrderDTO>(`${cafeBase(cafeId)}/orders`, {
      method: 'POST',
      body: JSON.stringify({ tableId, items }),
    });
  },

  /** Bayar pesanan dari sisi pelanggan (QRIS / e-wallet). */
  pay(cafeId: string, orderId: string, method: PaymentMethodCode): Promise<OrderDTO> {
    return apiFetch<OrderDTO>(`${cafeBase(cafeId)}/orders/${id(orderId)}/pay`, {
      method: 'POST',
      body: JSON.stringify({ method }),
    });
  },
};

export const cashierApi = {
  /** Antrean pesanan yang menunggu konfirmasi pembayaran di kasir. */
  listPendingOrders(cafeId: string): Promise<CashierOrderDTO[]> {
    return apiFetch<CashierOrderDTO[]>(`${cafeBase(cafeId)}/cashier/orders`);
  },

  /** Konfirmasi pembayaran tunai/EDC; pesanan lanjut ke dapur. */
  confirmPayment(
    cafeId: string,
    orderId: string,
    method: PaymentMethodCode,
  ): Promise<CashierOrderDTO> {
    return apiFetch<CashierOrderDTO>(`${cafeBase(cafeId)}/cashier/orders/${id(orderId)}/pay`, {
      method: 'POST',
      body: JSON.stringify({ method }),
    });
  },
};

export const kitchenApi = {
  /** Pesanan aktif untuk Layar Dapur (sudah membawa `tableName`). */
  listActiveOrders(cafeId: string): Promise<OrderWithTableDTO[]> {
    return apiFetch<OrderWithTableDTO[]>(`${cafeBase(cafeId)}/kitchen/orders`);
  },

  /** Ubah status masak satu item; balasannya pesanan versi terbaru. */
  updateItemStatus(
    cafeId: string,
    itemId: string,
    status: KitchenStatus,
  ): Promise<OrderWithTableDTO> {
    return apiFetch<OrderWithTableDTO>(`${cafeBase(cafeId)}/kitchen/items/${id(itemId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },
};
