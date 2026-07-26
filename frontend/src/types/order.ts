// Tipe domain pesanan & pembayaran. Bentuknya mengikuti respons backend
// (`OrderDTO` di `backend/src/dto/order.dto.ts`) PERSIS, supaya data dari API
// bisa dipakai apa adanya tanpa lapisan penerjemah yang gampang basi.

export type OrderStatus =
  | 'MENUNGGU_PEMBAYARAN'
  | 'DIPROSES_DAPUR'
  | 'SELESAI';

export type KitchenStatus = 'WAITING' | 'COOKING' | 'READY';

// QRIS/GOPAY/CARD = bayar di meja (online); CASH/EDC = bayar di kasir.
export type PaymentMethodCode = 'QRIS' | 'GOPAY' | 'CARD' | 'CASH' | 'EDC';

// Metode manual jalur pembayaran baru — dikonfirmasi kasir.
export type ManualMethodCode = 'TUNAI' | 'QRIS_STATIS' | 'TRANSFER' | 'EDC';

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
  id: string;
  orderId: string;
  method: PaymentMethodCode;
  status: PaymentStatus;
  amount: number;
  /** ID transaksi dari gateway; null bila belum/tidak diterbitkan. */
  transactionId: string | null;
  createdAt: string;
}

/** Status pembayaran domain baru (lintas jalur manual & Midtrans). */
export type StatusPembayaran = 'MENUNGGU' | 'LUNAS' | 'GAGAL';

export interface Order {
  id: string;
  cafeId: string;
  tableId: string;
  /**
   * Nama meja. Hanya dikirim endpoint kasir & dapur — layar merekalah yang
   * memanggil tamu dengan nama meja. Endpoint lain tidak menyertakannya.
   */
  tableName?: string;
  status: OrderStatus;
  items: OrderItem[];
  totalAmount: number;
  /** null selama pesanan belum dibayar. */
  payment: Payment | null;
  // ── Pembayaran dua jalur ──
  /** MENUNGGU | LUNAS | GAGAL — mengikuti backend (bisa null pada data lama). */
  statusPembayaran: StatusPembayaran | string | null;
  /** Metode aktual: kode manual (TUNAI/…) atau label Midtrans (GoPay/…). */
  metodePembayaran: string | null;
  nominalDibayar: number | null;
  /** `order_id` Midtrans; null bila bukan jalur Midtrans. */
  midtransOrderId: string | null;
  createdAt: string;
  updatedAt: string;
}
