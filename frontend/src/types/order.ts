// Tipe domain pesanan & pembayaran. Bentuknya mengikuti respons backend
// (`OrderDTO` di `backend/src/dto/order.dto.ts`) PERSIS, supaya data dari API
// bisa dipakai apa adanya tanpa lapisan penerjemah yang gampang basi.

export type OrderStatus =
  | 'MENUNGGU_PEMBAYARAN'
  | 'DIPROSES_DAPUR'
  | 'SELESAI'
  | 'DIBATALKAN';

/** Status masak satu BARIS menu (dipakai Layar Dapur per item). */
export type KitchenStatus = 'WAITING' | 'COOKING' | 'READY';

/**
 * Status pesanan kanonik — turunan yang dikirim server, bukan kolom.
 * Cerminan `backend/src/lib/orderStatus.ts`.
 */
export type StatusPesanan =
  | 'AWAITING_PAYMENT'
  | 'AWAITING_CASHIER'
  | 'CONFIRMED'
  | 'COMPLETED'
  | 'CANCELLED';

/**
 * Tahap satu TIKET di dapur — berbeda dari `KitchenStatus` yang mengikuti satu
 * baris menu. Yang ini mengikuti perjalanan pesanannya: masuk antrean, mulai
 * dimasak, siap, lalu diserahkan kasir ke tamu.
 */
export type KitchenStage =
  | 'NOT_SENT'
  | 'QUEUED'
  | 'PREPARING'
  | 'READY'
  | 'COMPLETED';

export type FulfillmentType = 'DINE_IN' | 'TAKEAWAY';

export type OrderSource = 'TABLE_QR' | 'CASHIER';

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

/**
 * Status PEMBAYARAN — terpisah dari status pesanan/dapur (`OrderStatus`).
 *
 * Cerminan `backend/src/lib/paymentStatus.ts`; keduanya harus tetap sinkron.
 * Kosakata lama (MENUNGGU/LUNAS/GAGAL) sudah dipetakan migrasi database, tapi
 * `normalisasiStatus()` di `lib/paymentStatus.ts` tetap menerimanya supaya
 * layar tidak kosong saat membaca respons server versi lama.
 */
export type StatusPembayaran =
  | 'UNPAID'
  | 'AWAITING_VERIFICATION'
  | 'PAID'
  | 'FAILED'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'REFUNDED'
  | 'PARTIALLY_REFUNDED';

/**
 * Ringkasan pembayaran manual sebuah pesanan — metode, uang yang diterima, dan
 * kembaliannya. Kembalian dihitung SERVER dari nominal tersimpan, bukan di
 * layar; struk dan laporan harus menunjukkan angka yang sama.
 */
export interface PembayaranManualRingkas {
  metode: string;
  nominal: number;
  kembalian: number;
  /** KASIR | CHECKOUT — dari mana pengajuannya datang. */
  sumber: string;
  /** MENUNGGU | DITERIMA | DITOLAK */
  statusVerifikasi: string;
  catatanKasir: string | null;
  referensi: string | null;
  buktiUrl: string | null;
  alasanPenolakan: string | null;
  diverifikasiPada: string | null;
}

/** Staf yang namanya melekat pada sebuah keputusan. */
export interface StafRingkas {
  id: string;
  name: string;
}

export interface Order {
  id: string;
  cafeId: string;
  /** NULL pada pesanan bawa pulang — tidak ada meja yang bisa disebut. */
  tableId: string | null;
  /**
   * Nama meja. Hanya dikirim endpoint kasir & dapur — layar merekalah yang
   * memanggil tamu dengan nama meja. Endpoint lain tidak menyertakannya, dan
   * pesanan bawa pulang mengirimkannya sebagai null (klien menampilkan nomor
   * antriannya). Lihat `labelTujuan()` di `lib/orderStatus.ts`.
   */
  tableName?: string | null;
  /** Status kasar (kosakata lama). Dipertahankan agar layar lama tidak patah. */
  status: OrderStatus;
  /** Status pesanan kanonik — dipakai layar kasir. */
  statusPesanan?: StatusPesanan;
  /** Tahap tiket di dapur. */
  kitchenStatus?: KitchenStage;
  fulfillmentType?: FulfillmentType;
  orderSource?: OrderSource;
  customerName?: string | null;
  /** Catatan untuk SELURUH pesanan; catatan per item ada di `items[].notes`. */
  catatan?: string | null;
  /**
   * Nomor antrian harian yang dipanggil ke tamu (1–999), ditampilkan `A-001`.
   * Null pada pesanan lama yang dibuat sebelum server menyimpannya.
   */
  queueNumber: number | null;
  items: OrderItem[];
  totalAmount: number;
  /** null selama pesanan belum dibayar. */
  payment: Payment | null;
  // ── Pembayaran dua jalur ──
  /** Mengikuti backend; bisa null pada pesanan lama sebelum kolomnya ada. */
  statusPembayaran: StatusPembayaran | string | null;
  /** Metode aktual: kode manual (TUNAI/…) atau label Midtrans (GoPay/…). */
  metodePembayaran: string | null;
  nominalDibayar: number | null;
  /** `order_id` Midtrans; null bila bukan jalur Midtrans. */
  midtransOrderId: string | null;
  /** Ringkasan pembayaran manual, bila pesanan ini melewatinya. */
  pembayaranManual?: PembayaranManualRingkas | null;
  /** Kasir yang membuat pesanan ini di layar kasir. */
  kasir?: StafRingkas | null;
  /** Staf yang membatalkannya. */
  pembatal?: StafRingkas | null;
  // ── Garis waktu (semua opsional: server lama belum mengirimnya) ──
  paidAt?: string | null;
  confirmedAt?: string | null;
  kitchenQueuedAt?: string | null;
  kitchenStartedAt?: string | null;
  kitchenReadyAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  alasanPembatalan?: string | null;
  createdAt: string;
  updatedAt: string;
}
