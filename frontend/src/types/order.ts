// Tipe domain pesanan & pembayaran — mengikuti skema `orders`, `order_items`,
// dan `payments` pada PRD. Dipakai lintas fitur (checkout, KDS, struk, dasbor).

export type OrderStatus =
  | 'MENUNGGU_PEMBAYARAN'
  | 'DIPROSES_DAPUR'
  | 'SELESAI';

export type KitchenStatus = 'WAITING' | 'COOKING' | 'READY';

// QRIS/GOPAY/CARD = bayar di meja (online); CASH/EDC = bayar di kasir.
export type PaymentMethodCode = 'QRIS' | 'GOPAY' | 'CARD' | 'CASH' | 'EDC';

export type PaymentStatus = 'PENDING' | 'SUCCESS' | 'FAILED';

/** Baris pesanan — snapshot menu item saat dipesan (harga & nama ikut disimpan). */
export interface OrderItem {
  id: string;
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  notes: string;
  kitchenStatus: KitchenStatus;
}

export interface Payment {
  method: PaymentMethodCode;
  status: PaymentStatus;
  /** ID transaksi dari gateway (mock pada fase frontend). */
  transactionId: string;
}

export interface Order {
  id: string;
  cafeId: string;
  tableId: string;
  tableName: string;
  status: OrderStatus;
  items: OrderItem[];
  totalAmount: number;
  payment: Payment;
  createdAt: string;
}
