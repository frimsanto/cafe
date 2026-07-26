import type { PaymentMethod } from '@prisma/client';

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

/** Status domain kita, lintas jalur pembayaran. */
export type StatusPembayaran = 'MENUNGGU' | 'LUNAS' | 'GAGAL';

/**
 * Terjemahkan `transaction_status` (+ `fraud_status`) Midtrans ke status domain.
 * `capture` yang masih `challenge` diperlakukan sebagai MENUNGGU (belum pasti).
 */
export function mapMidtransStatus(
  transactionStatus: string | undefined,
  fraudStatus?: string,
): StatusPembayaran {
  switch (transactionStatus) {
    case 'capture':
      return fraudStatus === 'challenge' ? 'MENUNGGU' : 'LUNAS';
    case 'settlement':
      return 'LUNAS';
    case 'pending':
      return 'MENUNGGU';
    case 'deny':
    case 'cancel':
    case 'expire':
    case 'failure':
      return 'GAGAL';
    default:
      return 'MENUNGGU';
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
