// Kosakata TUNGGAL status PESANAN, DAPUR, jenis pemenuhan, dan sumber pesanan.
//
// Sengaja terpisah dari `paymentStatus.ts`: uang dan makanan berjalan di rel
// yang berbeda. Sebuah pesanan bisa sudah lunas tapi belum masuk dapur (baru
// saja dibayar), atau sudah siap disajikan tapi tagihannya belum ditutup
// (bayar di kasir sesudah makan). Memaksa keduanya ke satu kolom — seperti
// `orders.status` yang lama — membuat salah satu selalu berbohong.
//
// Nilai `kitchenStatus`, `fulfillmentType`, dan `orderSource` disimpan di kolom
// TEKS, mengikuti alasan yang sama dengan `orders.status_pembayaran`: menambah
// nilai baru tidak boleh menuntut migrasi tipe yang mengunci tabel pesanan saat
// kafe sedang ramai. Validasinya ada di sini, dan SETIAP pembacaan melewati
// fungsi normalisasi agar baris lama tetap terbaca benar.

import type { KitchenStatus, OrderStatus } from '@prisma/client';

// ── Status pesanan ───────────────────────────────────────────────────────────

/**
 * Status pesanan kanonik — TURUNAN, bukan kolom.
 *
 * Diturunkan dari `orders.status` (enum lama) + `orders.status_pembayaran`,
 * sehingga tidak ada kolom kelima yang harus dijaga tetap sinkron. Bentuk
 * turunan ini yang dikirim ke klien; enum lamanya tetap ditulis apa adanya
 * supaya kode/laporan lama tidak patah.
 */
export const STATUS_PESANAN = [
  /** Dibuat, tagihannya belum dibayar & belum diajukan ke kasir. */
  'AWAITING_PAYMENT',
  /** Tamu mengaku sudah bayar / memilih bayar di kasir — menunggu kasir. */
  'AWAITING_CASHIER',
  /** Lunas & dirilis ke dapur. */
  'CONFIRMED',
  /** Sudah diserahkan ke tamu. */
  'COMPLETED',
  /** Dibatalkan kasir/pemilik dengan alasan tertulis. */
  'CANCELLED',
] as const;

export type StatusPesanan = (typeof STATUS_PESANAN)[number];

export const STATUS_PESANAN_LABEL: Record<StatusPesanan, string> = {
  AWAITING_PAYMENT: 'Menunggu Pembayaran',
  AWAITING_CASHIER: 'Perlu Konfirmasi Kasir',
  CONFIRMED: 'Dikonfirmasi',
  COMPLETED: 'Selesai',
  CANCELLED: 'Dibatalkan',
};

/**
 * Turunkan status pesanan kanonik dari kolom-kolom yang benar-benar disimpan.
 *
 * `statusPembayaran` ikut menentukan karena "menunggu pembayaran" dan "tamu
 * sudah mengaku bayar, kasir belum memeriksa" adalah dua keadaan yang berbeda
 * bagi kasir — yang pertama menunggu tamu, yang kedua menunggu dirinya.
 */
export function turunkanStatusPesanan(order: {
  status: OrderStatus;
  statusPembayaran: string | null;
}): StatusPesanan {
  switch (order.status) {
    case 'DIBATALKAN':
      return 'CANCELLED';
    case 'SELESAI':
      return 'COMPLETED';
    case 'DIPROSES_DAPUR':
      return 'CONFIRMED';
    default:
      return order.statusPembayaran === 'AWAITING_VERIFICATION'
        ? 'AWAITING_CASHIER'
        : 'AWAITING_PAYMENT';
  }
}

// ── Status dapur (tingkat PESANAN) ───────────────────────────────────────────

/**
 * Perjalanan satu tiket di dapur.
 *
 * Berbeda dari `OrderItem.kitchenStatus` (WAITING/COOKING/READY) yang mengikuti
 * satu baris menu. Yang di sini mengikuti TIKETNYA: kapan ia masuk antrean,
 * kapan chef mulai, kapan siap, dan kapan kasir menyerahkannya ke tamu.
 * Keduanya dipelihara bersama — lihat `kitchen.service`.
 */
export const KITCHEN_STATUS = [
  /** Belum dibayar/dikonfirmasi — dapur belum boleh melihatnya. */
  'NOT_SENT',
  'QUEUED',
  'PREPARING',
  'READY',
  /** Sudah diserahkan ke tamu (ditekan kasir). */
  'COMPLETED',
] as const;

export type KitchenStatusPesanan = (typeof KITCHEN_STATUS)[number];

export const KITCHEN_STATUS_LABEL: Record<KitchenStatusPesanan, string> = {
  NOT_SENT: 'Belum Dikirim',
  QUEUED: 'Antre di Dapur',
  PREPARING: 'Sedang Diproses',
  READY: 'Siap Disajikan',
  COMPLETED: 'Sudah Diserahkan',
};

export function isKitchenStatus(value: unknown): value is KitchenStatusPesanan {
  return (
    typeof value === 'string' && (KITCHEN_STATUS as readonly string[]).includes(value)
  );
}

/** Baris lama (sebelum kolom ini ada) dan nilai tak dikenal → `NOT_SENT`. */
export function normalisasiKitchenStatus(
  value: string | null | undefined,
): KitchenStatusPesanan {
  return isKitchenStatus(value) ? value : 'NOT_SENT';
}

/**
 * Transisi yang diizinkan. Dapur hanya boleh maju, tidak melompat, dan tidak
 * pernah menyentuh tiket yang belum dirilis.
 *
 * `READY → PREPARING` sengaja diizinkan: chef yang salah tekan "Siap" pada
 * layar sentuh harus bisa membatalkannya sendiri, dan itu jauh lebih sering
 * terjadi daripada penyalahgunaan.
 */
const TRANSISI: Record<KitchenStatusPesanan, KitchenStatusPesanan[]> = {
  NOT_SENT: ['QUEUED'],
  QUEUED: ['PREPARING', 'READY'],
  PREPARING: ['READY', 'QUEUED'],
  READY: ['COMPLETED', 'PREPARING'],
  COMPLETED: [],
};

export function bolehTransisiDapur(
  dari: KitchenStatusPesanan,
  ke: KitchenStatusPesanan,
): boolean {
  return dari === ke || TRANSISI[dari].includes(ke);
}

/**
 * Status masak per-ITEM yang menyertai sebuah status tiket.
 *
 * Dipakai saat chef menggerakkan seluruh tiket sekaligus ("Mulai Proses"),
 * supaya baris-baris item tidak tertinggal di WAITING dan layar per-item milik
 * dapur tidak bertentangan dengan kepala tiketnya.
 */
export function statusItemUntuk(status: KitchenStatusPesanan): KitchenStatus | null {
  switch (status) {
    case 'PREPARING':
      return 'COOKING';
    case 'READY':
    case 'COMPLETED':
      return 'READY';
    case 'QUEUED':
      return 'WAITING';
    default:
      return null;
  }
}

/**
 * Status tiket yang tersirat dari status seluruh itemnya.
 *
 * Dipakai arah sebaliknya: chef yang menandai item satu per satu tetap
 * menggerakkan kepala tiketnya tanpa harus menekan tombol tiket.
 */
export function statusDariItem(
  items: readonly { kitchenStatus: KitchenStatus }[],
): KitchenStatusPesanan | null {
  if (items.length === 0) return null;
  if (items.every((i) => i.kitchenStatus === 'READY')) return 'READY';
  if (items.some((i) => i.kitchenStatus !== 'WAITING')) return 'PREPARING';
  return 'QUEUED';
}

// ── Jenis pemenuhan ──────────────────────────────────────────────────────────

export const FULFILLMENT_TYPES = ['DINE_IN', 'TAKEAWAY'] as const;
export type FulfillmentType = (typeof FULFILLMENT_TYPES)[number];

export const FULFILLMENT_LABEL: Record<FulfillmentType, string> = {
  DINE_IN: 'Makan di Tempat',
  TAKEAWAY: 'Bawa Pulang',
};

export function isFulfillmentType(value: unknown): value is FulfillmentType {
  return (
    typeof value === 'string' &&
    (FULFILLMENT_TYPES as readonly string[]).includes(value)
  );
}

/** Pesanan lama selalu punya meja, jadi default yang jujur adalah dine-in. */
export function normalisasiFulfillment(
  value: string | null | undefined,
): FulfillmentType {
  return isFulfillmentType(value) ? value : 'DINE_IN';
}

// ── Sumber pesanan ───────────────────────────────────────────────────────────

export const ORDER_SOURCES = ['TABLE_QR', 'CASHIER'] as const;
export type OrderSource = (typeof ORDER_SOURCES)[number];

export const ORDER_SOURCE_LABEL: Record<OrderSource, string> = {
  TABLE_QR: 'QR Meja',
  CASHIER: 'Kasir',
};

export function isOrderSource(value: unknown): value is OrderSource {
  return (
    typeof value === 'string' && (ORDER_SOURCES as readonly string[]).includes(value)
  );
}

/** Sebelum layar kasir bisa membuat pesanan, satu-satunya sumber adalah QR. */
export function normalisasiOrderSource(value: string | null | undefined): OrderSource {
  return isOrderSource(value) ? value : 'TABLE_QR';
}
