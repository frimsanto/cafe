import type { ManualMethodCode } from '../types/order';

/** Opsi metode manual — dikonfirmasi kasir bila kafe belum menyetel Midtrans. */
export interface ManualMethodOption {
  code: ManualMethodCode;
  name: string;
  description: string;
  /** Emoji ikon sederhana (tanpa dependency ikon eksternal). */
  icon: string;
}

// Katalog metode manual yang bisa diaktifkan kafe. Urutan di sini = urutan tampil
// di pengaturan, modal kasir, dan modal fallback pelanggan.
//
// Tidak ada katalog "metode online" di sini: metode Midtrans (QRIS dinamis,
// GoPay, VA, kartu) dipilih pelanggan di dalam popup Snap milik Midtrans, jadi
// aplikasi tidak perlu — dan tidak boleh — menebaknya lebih dulu.
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

/**
 * Label metode untuk kode yang bukan metode manual: nilai enum `PaymentMethod`
 * lama yang masih tersimpan di baris `payments` pesanan terdahulu, dan kode
 * jalur DOKU. Cerminan `METODE_LABEL` di `backend/src/lib/paymentMethods.ts` —
 * keduanya harus tetap sinkron.
 */
const ENUM_LABEL: Record<string, string> = {
  CASH: 'Tunai',
  QRIS: 'QRIS',
  GOPAY: 'GoPay',
  CARD: 'Kartu Kredit/Debit',
  // Jalur DOKU Checkout — kanal spesifiknya baru diketahui dari notifikasi DOKU,
  // jadi `DOKU` polos (kanal belum/tak dikenal) juga perlu punya label sendiri.
  DOKU: 'DOKU Checkout',
  DOKU_QRIS: 'DOKU QRIS',
  DOKU_VA: 'DOKU Virtual Account',
};

/**
 * Label tampilan dari kode metode apa pun: kode manual, nilai enum lama, kode
 * DOKU, atau label Midtrans (mis. "BCA Virtual Account") yang memang sudah siap
 * dibaca.
 */
export function labelMetode(metode: string | null | undefined): string {
  if (!metode) return '-';
  const manual = manualMethods.find((m) => m.code === metode);
  if (manual) return manual.name;
  return ENUM_LABEL[metode] ?? metode;
}

/** Golongan metode — menentukan warna badge, bukan perilaku. */
export type MetodeTone = 'doku' | 'online' | 'manual';

/**
 * Golongkan sebuah kode metode untuk keperluan tampilan.
 *
 * DOKU dikenali dari substring, bukan daftar kode: backend memetakan kanal DOKU
 * ke `DOKU`, `DOKU_QRIS`, `DOKU_VA`, dan kanal baru bisa menyusul kapan saja —
 * yang penting semuanya tetap tampil sebagai DOKU, bukan jatuh ke "online".
 */
export function toneMetode(metode: string | null | undefined): MetodeTone {
  if (!metode) return 'manual';
  if (metode.toUpperCase().includes('DOKU')) return 'doku';
  if (manualMethods.some((m) => m.code === metode)) return 'manual';
  if (metode === 'CASH' || metode === 'EDC') return 'manual';
  return 'online';
}
