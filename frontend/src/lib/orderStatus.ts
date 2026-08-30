import type {
  FulfillmentType,
  KitchenStage,
  Order,
  OrderSource,
  StatusPesanan,
} from '../types/order';
import { nomorAntrian } from './orderCode';
import type { NadaBadge } from '../components/payment/StatusBadge';

// Cerminan `backend/src/lib/orderStatus.ts`. Keduanya harus tetap sinkron —
// server yang memutuskan, layar hanya menerjemahkan.
//
// Alasan berkas ini ada: sejak layar kasir menjadi POS, LIMA keadaan berbeda
// muncul bersamaan di satu kartu (pesanan, pembayaran, dapur, jenis, sumber).
// Tanpa satu tempat yang memetakannya, tiap komponen akan menulis peta
// labelnya sendiri — dan cepat atau lambat dua layar akan menyebut keadaan
// yang sama dengan dua nama.

// ── Status pesanan ───────────────────────────────────────────────────────────

const STATUS_PESANAN_LABEL: Record<StatusPesanan, string> = {
  AWAITING_PAYMENT: 'Menunggu Pembayaran',
  AWAITING_CASHIER: 'Perlu Konfirmasi',
  CONFIRMED: 'Dikonfirmasi',
  COMPLETED: 'Selesai',
  CANCELLED: 'Dibatalkan',
};

const STATUS_PESANAN_NADA: Record<StatusPesanan, NadaBadge> = {
  AWAITING_PAYMENT: 'abu',
  AWAITING_CASHIER: 'kuning',
  CONFIRMED: 'hijau',
  COMPLETED: 'hijau',
  CANCELLED: 'merah',
};

/**
 * Status pesanan sebuah baris — dari server bila ada, kalau tidak diturunkan
 * dari kosakata lama.
 *
 * Turunan lokal ini yang menjaga layar tetap benar saat backend belum
 * diperbarui: `statusPesanan` baru dikirim server versi POS.
 */
export function statusPesanan(order: Order): StatusPesanan {
  if (order.statusPesanan) return order.statusPesanan;
  if (order.status === 'DIBATALKAN') return 'CANCELLED';
  if (order.status === 'SELESAI') return 'COMPLETED';
  if (order.status === 'DIPROSES_DAPUR') return 'CONFIRMED';
  return order.statusPembayaran === 'AWAITING_VERIFICATION'
    ? 'AWAITING_CASHIER'
    : 'AWAITING_PAYMENT';
}

export function labelStatusPesanan(order: Order): string {
  return STATUS_PESANAN_LABEL[statusPesanan(order)];
}

export function nadaStatusPesanan(order: Order): NadaBadge {
  return STATUS_PESANAN_NADA[statusPesanan(order)];
}

// ── Tahap dapur ──────────────────────────────────────────────────────────────

const STAGE_LABEL: Record<KitchenStage, string> = {
  NOT_SENT: 'Belum ke Dapur',
  QUEUED: 'Antre di Dapur',
  PREPARING: 'Sedang Diproses',
  READY: 'Siap Disajikan',
  COMPLETED: 'Sudah Diserahkan',
};

const STAGE_NADA: Record<KitchenStage, NadaBadge> = {
  NOT_SENT: 'abu',
  QUEUED: 'kuning',
  PREPARING: 'kuning',
  READY: 'hijau',
  COMPLETED: 'hijau',
};

/**
 * Tahap dapur sebuah pesanan.
 *
 * Bila server belum mengirimnya, diturunkan dari status lama DITAMBAH status
 * masak per item — pesanan yang separuh itemnya sudah dimasak memang sedang
 * diproses, dan menyebutnya "antre" akan menyesatkan kasir.
 */
export function tahapDapur(order: Order): KitchenStage {
  if (order.kitchenStatus) return order.kitchenStatus;
  if (order.status === 'SELESAI') return 'COMPLETED';
  if (order.status !== 'DIPROSES_DAPUR') return 'NOT_SENT';
  if (order.items.length === 0) return 'QUEUED';
  if (order.items.every((i) => i.kitchenStatus === 'READY')) return 'READY';
  if (order.items.some((i) => i.kitchenStatus !== 'WAITING')) return 'PREPARING';
  return 'QUEUED';
}

export function labelTahapDapur(order: Order): string {
  return STAGE_LABEL[tahapDapur(order)];
}

export function nadaTahapDapur(order: Order): NadaBadge {
  return STAGE_NADA[tahapDapur(order)];
}

// ── Jenis & sumber ───────────────────────────────────────────────────────────

const FULFILLMENT_LABEL: Record<FulfillmentType, string> = {
  DINE_IN: 'Makan di Tempat',
  TAKEAWAY: 'Bawa Pulang',
};

const SOURCE_LABEL: Record<OrderSource, string> = {
  TABLE_QR: 'QR Meja',
  CASHIER: 'Kasir',
};

export function jenisPesanan(order: Order): FulfillmentType {
  // Pesanan tanpa meja hanya mungkin bawa pulang; itu penanda yang lebih tua
  // daripada kolom `fulfillmentType` dan tetap benar untuk data lama.
  return order.fulfillmentType ?? (order.tableId ? 'DINE_IN' : 'TAKEAWAY');
}

export function labelJenis(order: Order): string {
  return FULFILLMENT_LABEL[jenisPesanan(order)];
}

export function sumberPesanan(order: Order): OrderSource {
  return order.orderSource ?? 'TABLE_QR';
}

export function labelSumber(order: Order): string {
  return SOURCE_LABEL[sumberPesanan(order)];
}

/**
 * Ke mana pesanan ini ditujukan — nama meja, atau nomor antrian bila dibawa
 * pulang.
 *
 * Satu fungsi, dipakai kartu kasir, tiket dapur, dan struk. Sebelum ada
 * takeaway, semua tempat menulis `order.tableName` langsung; sekarang nilainya
 * bisa null, dan menampilkan kosong akan membuat tiket tanpa identitas sama
 * sekali di layar chef.
 */
export function labelTujuan(order: Order): string {
  if (order.tableName) return order.tableName;
  return `Bawa Pulang ${nomorAntrian(order.queueNumber)}`;
}

/** Kode pesanan pendek untuk ditampilkan — 8 karakter terakhir id-nya. */
export function kodePesanan(order: Pick<Order, 'id'>): string {
  return `#${order.id.slice(-8).toUpperCase()}`;
}
