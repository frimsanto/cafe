import type { ManualMethodCode, PaymentMethodCode } from '../types/order';

export interface PaymentMethodOption {
  code: PaymentMethodCode;
  name: string;
  description: string;
  /** Emoji ikon sederhana (tanpa dependency ikon eksternal). */
  icon: string;
}

/** Opsi metode manual (jalur pembayaran baru) — dikonfirmasi kasir. */
export interface ManualMethodOption {
  code: ManualMethodCode;
  name: string;
  description: string;
  icon: string;
}

// Katalog metode manual yang bisa diaktifkan kafe. Urutan di sini = urutan tampil
// di pengaturan & modal kasir.
export const manualMethods: ManualMethodOption[] = [
  {
    code: 'TUNAI',
    name: 'Tunai',
    description: 'Uang diterima langsung di kasir',
    icon: '💵',
  },
  {
    code: 'QRIS_STATIS',
    name: 'QRIS Statis',
    description: 'Scan QR tetap yang terpasang di kasir',
    icon: '📱',
  },
  {
    code: 'TRANSFER',
    name: 'Transfer Bank',
    description: 'Transfer ke rekening kafe',
    icon: '🏦',
  },
  {
    code: 'EDC',
    name: 'Kartu (EDC)',
    description: 'Gesek/tap di mesin EDC kasir',
    icon: '💳',
  },
];

/** Label tampilan dari kode/label metode apa pun (manual maupun Midtrans). */
export function labelMetode(metode: string | null | undefined): string {
  if (!metode) return '-';
  const manual = manualMethods.find((m) => m.code === metode);
  if (manual) return manual.name;
  const online = [...paymentMethods, ...cashierPaymentMethods].find((m) => m.code === metode);
  return online?.name ?? metode;
}

// Metode pembayaran di meja (online). Fase frontend: hanya simulasi — belum
// terhubung ke gateway (InterActive QRIS belum aktif).
export const paymentMethods: PaymentMethodOption[] = [
  {
    code: 'QRIS',
    name: 'QRIS',
    description: 'Scan dengan aplikasi bank / e-wallet apa pun',
    icon: '📷',
  },
  {
    code: 'GOPAY',
    name: 'GoPay',
    description: 'Bayar pakai saldo GoPay',
    icon: '💚',
  },
  {
    code: 'CARD',
    name: 'Kartu Kredit / Debit',
    description: 'Visa, Mastercard, JCB',
    icon: '💳',
  },
];

// Metode pembayaran di kasir (offline) — dikonfirmasi manual oleh kasir.
export const cashierPaymentMethods: PaymentMethodOption[] = [
  {
    code: 'CASH',
    name: 'Tunai',
    description: 'Uang diterima langsung di kasir',
    icon: '💵',
  },
  {
    code: 'EDC',
    name: 'Kartu (EDC)',
    description: 'Gesek/tap di mesin EDC kasir',
    icon: '💳',
  },
];
