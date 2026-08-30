import type { PaymentMethod } from '@prisma/client';
import type { StatusPembayaran } from './paymentStatus';

// Sumber kebenaran metode & status pembayaran domain BARU (berbasis string),
// dipakai bersama jalur manual & Midtrans. Dipisah agar route, service, dan
// pembuat struk memakai peta yang sama — tidak ada dua definisi yang bisa
// melenceng.

// ── Metode manual ────────────────────────────────────────────────────────────

/** Metode manual yang boleh dikonfirmasi kasir. */
export const MANUAL_METHODS = ['TUNAI', 'QRIS_STATIS', 'TRANSFER', 'EDC'] as const;
export type ManualMethod = (typeof MANUAL_METHODS)[number];

export function isManualMethod(value: unknown): value is ManualMethod {
  return typeof value === 'string' && (MANUAL_METHODS as readonly string[]).includes(value);
}

/**
 * Apakah sebuah metode BOLEH ditawarkan di checkout mandiri pelanggan.
 *
 * Ini aturan domain, bukan preferensi yang bisa disetel pemilik: Tunai dan EDC
 * menuntut kasir yang hadir memegang uang atau mesinnya. Menawarkannya di HP
 * tamu hanya melahirkan pesanan yang menyatakan dirinya sudah dibayar padahal
 * tidak ada siapa pun yang menerima apa pun. Validasi menolak permintaan yang
 * mencoba menyalakannya, dan pengecekan diulang di service — bukan cuma di UI.
 */
export const BOLEH_DI_CHECKOUT: Record<ManualMethod, boolean> = {
  TUNAI: false,
  QRIS_STATIS: true,
  TRANSFER: true,
  EDC: false,
};

/**
 * Metode yang uangnya BELUM tentu diterima saat pelanggan menekan "bayar".
 *
 * Pesanan lewat metode ini masuk sebagai AWAITING_VERIFICATION dan menunggu
 * kasir. Tunai & EDC tidak ada di sini karena keduanya memang hanya bisa
 * dikonfirmasi kasir sejak awal.
 */
export const PERLU_VERIFIKASI: Record<ManualMethod, boolean> = {
  TUNAI: true,
  QRIS_STATIS: true,
  TRANSFER: true,
  EDC: true,
};

/**
 * Label manusiawi untuk kode metode. Mencakup kode manual (jalur baru) DAN nilai
 * enum lama (jalur pelanggan/kasir lama menyimpan nilai enum di
 * `metode_pembayaran`), agar struk & UI menampilkan nama yang enak dibaca.
 */
export const METODE_LABEL: Record<string, string> = {
  // Kode manual (jalur baru).
  TUNAI: 'Tunai',
  QRIS_STATIS: 'QRIS Statis',
  TRANSFER: 'Transfer Bank',
  EDC: 'Kartu (EDC)',
  // Nilai enum PaymentMethod (jalur lama).
  CASH: 'Tunai',
  QRIS: 'QRIS',
  GOPAY: 'GoPay',
  CARD: 'Kartu Kredit/Debit',
  // Kode jalur DOKU Checkout (gateway global platform).
  DOKU: 'DOKU Checkout',
  DOKU_QRIS: 'DOKU QRIS',
  DOKU_VA: 'DOKU Virtual Account',
};

/**
 * Ubah kode metode/label apa pun menjadi label tampilan. Kode manual yang dikenal
 * dipetakan; nilai lain (mis. label Midtrans "GoPay") dikembalikan apa adanya.
 */
export function labelMetode(metode: string | null | undefined): string {
  if (!metode) return '-';
  return METODE_LABEL[metode] ?? metode;
}

// ── Jembatan ke enum `PaymentMethod` lama ────────────────────────────────────
//
// Baris `payments` (enum) tetap dibuat agar gerbang rilis dapur & laporan omzet
// bekerja seperti semula. Enum tidak punya nilai untuk semua metode baru, jadi
// pemetaan bersifat BEST-EFFORT — metode akurat selalu tersimpan di
// `orders.metode_pembayaran` (string), yang dipakai struk & UI.

const MANUAL_TO_ENUM: Record<ManualMethod, PaymentMethod> = {
  TUNAI: 'CASH',
  EDC: 'EDC',
  QRIS_STATIS: 'QRIS',
  TRANSFER: 'QRIS',
};

export function manualMethodToEnum(method: ManualMethod): PaymentMethod {
  return MANUAL_TO_ENUM[method];
}

// ── Pemetaan payload Midtrans ────────────────────────────────────────────────

/**
 * Terjemahkan `transaction_status` (+ `fraud_status`) Midtrans ke status domain.
 *
 * Setiap status Midtrans dipetakan EKSPLISIT — tidak ada lagi `default` yang
 * diam-diam berarti "belum dibayar". Itu penting untuk `refund`/`partial_refund`:
 * sebelumnya keduanya jatuh ke default dan mengembalikan pesanan yang sudah
 * lunas ke status menunggu, seolah tamunya belum pernah membayar.
 *
 * `capture` yang masih `challenge` sengaja BUKAN lunas — Midtrans belum
 * memutuskan, jadi uangnya belum boleh dianggap masuk.
 */
export function mapMidtransStatus(
  transactionStatus: string | undefined,
  fraudStatus?: string,
): StatusPembayaran {
  switch (transactionStatus) {
    case 'capture':
      return fraudStatus === 'challenge' ? 'UNPAID' : 'PAID';
    case 'settlement':
      return 'PAID';
    case 'pending':
      return 'UNPAID';
    case 'deny':
    case 'failure':
      return 'FAILED';
    case 'cancel':
      return 'CANCELLED';
    case 'expire':
      return 'EXPIRED';
    case 'refund':
      return 'REFUNDED';
    case 'partial_refund':
      return 'PARTIALLY_REFUNDED';
    default:
      return 'UNPAID';
  }
}

/** Label metode manusiawi dari `payment_type` Midtrans (untuk disimpan & ditampilkan). */
export function labelMidtransPaymentType(
  paymentType: string | undefined,
  vaNumbers?: Array<{ bank?: string }>,
): string {
  switch (paymentType) {
    case 'qris':
      return 'QRIS';
    case 'gopay':
      return 'GoPay';
    case 'shopeepay':
      return 'ShopeePay';
    case 'credit_card':
      return 'Kartu Kredit';
    case 'echannel':
      return 'Mandiri Bill';
    case 'cstore':
      return 'Gerai Retail';
    case 'bank_transfer': {
      const bank = vaNumbers?.[0]?.bank;
      return bank ? `${bank.toUpperCase()} Virtual Account` : 'Virtual Account';
    }
    default:
      return paymentType ?? 'Midtrans';
  }
}

/** Pemetaan best-effort `payment_type` Midtrans ke enum `PaymentMethod` lama. */
export function midtransPaymentTypeToEnum(paymentType: string | undefined): PaymentMethod {
  switch (paymentType) {
    case 'credit_card':
      return 'CARD';
    case 'gopay':
    case 'shopeepay':
      return 'GOPAY';
    case 'qris':
      return 'QRIS';
    default:
      // bank_transfer / echannel / cstore / dll — dianggap kanal QRIS/cashless.
      return 'QRIS';
  }
}

// ── Pemetaan payload DOKU ────────────────────────────────────────────────────

/**
 * Terjemahkan status transaksi DOKU ke status domain. DOKU hanya memberi tahu
 * hasil akhir lewat notifikasi, jadi apa pun yang belum jelas dianggap UNPAID
 * (bukan FAILED) supaya pesanan tidak ditandai gagal karena status tak dikenal.
 */
export function mapDokuStatus(transactionStatus: string | undefined): StatusPembayaran {
  switch (transactionStatus?.toUpperCase()) {
    case 'SUCCESS':
    case 'SETTLEMENT':
    case 'PAID':
      return 'PAID';
    case 'PENDING':
    case 'PROCESSING':
      return 'UNPAID';
    case 'FAILED':
      return 'FAILED';
    case 'EXPIRED':
      return 'EXPIRED';
    case 'CANCELLED':
    case 'CANCELED':
      return 'CANCELLED';
    case 'REFUNDED':
      return 'REFUNDED';
    default:
      return 'UNPAID';
  }
}

/**
 * Kode metode dari `channel.id` DOKU (mis. `VIRTUAL_ACCOUNT_BCA`, `EMONEY_OVO`).
 * Hasilnya disimpan di `orders.metode_pembayaran` dan diterjemahkan
 * `labelMetode` saat ditampilkan. Kanal yang tidak dikenal jatuh ke `DOKU`.
 */
export function dokuChannelToKode(channelId: string | undefined): string {
  const kanal = channelId?.toUpperCase() ?? '';
  if (kanal.includes('QRIS')) return 'DOKU_QRIS';
  if (kanal.includes('VIRTUAL_ACCOUNT')) return 'DOKU_VA';
  return 'DOKU';
}

/**
 * Pemetaan best-effort kanal DOKU ke enum `PaymentMethod` lama. Enum tidak punya
 * nilai khusus DOKU — seluruh kanalnya cashless, jadi QRIS dipakai sebagai wakil
 * (metode akurat tetap tersimpan sebagai string di `orders.metode_pembayaran`).
 */
export function dokuChannelToEnum(channelId: string | undefined): PaymentMethod {
  const kanal = channelId?.toUpperCase() ?? '';
  if (kanal.includes('CREDIT_CARD')) return 'CARD';
  if (kanal.includes('EMONEY_OVO') || kanal.includes('EMONEY_SHOPEE')) return 'GOPAY';
  return 'QRIS';
}
