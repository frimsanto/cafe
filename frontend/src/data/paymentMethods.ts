import type { PaymentMethodCode } from '../types/order';

export interface PaymentMethodOption {
  code: PaymentMethodCode;
  name: string;
  description: string;
  /** Emoji ikon sederhana (tanpa dependency ikon eksternal). */
  icon: string;
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
