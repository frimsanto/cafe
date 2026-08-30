import type { KodeMetode } from '../types/api';
import type { ManualMethodCode } from '../types/order';
import type { PaymentIconName } from '../components/payment/PaymentIcon';

/** Katalog tampilan satu metode manual. */
export interface ManualMethodOption {
  code: ManualMethodCode;
  name: string;
  /** Satu kalimat, ditulis untuk pemilik kafe — bukan untuk programmer. */
  description: string;
  /** Nama ikon garis (`components/payment/PaymentIcon`). Bukan emoji. */
  icon: PaymentIconName;
  /** Penjelasan yang dibaca TAMU saat memilih metode ini di checkout. */
  petunjukTamu: string;
}

// Urutan di sini = urutan tampil di pengaturan, modal kasir, dan checkout.
//
// Tidak ada katalog "metode online": metode Midtrans (QRIS dinamis, GoPay, VA,
// kartu) dipilih pelanggan di dalam popup Snap milik Midtrans, jadi aplikasi
// tidak perlu — dan tidak boleh — menebaknya lebih dulu.
export const manualMethods: ManualMethodOption[] = [
  {
    code: 'TUNAI',
    name: 'Tunai',
    description: 'Uang diterima langsung di kasir',
    icon: 'tunai',
    petunjukTamu: 'Bayar dengan uang tunai di kasir.',
  },
  {
    code: 'QRIS_STATIS',
    name: 'QRIS Statis',
    description: 'Scan QR tetap milik kafe, lalu dicek kasir',
    icon: 'qris',
    petunjukTamu: 'Pindai QR berikut, lalu tunjukkan bukti bayarnya ke kasir.',
  },
  {
    code: 'TRANSFER',
    name: 'Transfer Bank',
    description: 'Transfer ke rekening kafe, lalu dicek kasir',
    icon: 'transfer',
    petunjukTamu: 'Transfer ke rekening berikut, lalu tunjukkan buktinya ke kasir.',
  },
  {
    code: 'EDC',
    name: 'Kartu Debit/Kredit (EDC)',
    description: 'Gesek atau tap di mesin EDC kasir',
    icon: 'edc',
    petunjukTamu: 'Bayar dengan kartu di mesin EDC kasir.',
  },
];

/** Cari katalog sebuah kode; `undefined` bila kodenya bukan metode manual. */
export function metodeInfo(code: string): ManualMethodOption | undefined {
  return manualMethods.find((m) => m.code === code);
}

/**
 * Label metode untuk kode yang BUKAN metode manual: nilai enum `PaymentMethod`
 * lama yang masih tersimpan di pesanan terdahulu, dan kode jalur DOKU.
 * Cerminan `METODE_LABEL` di `backend/src/lib/paymentMethods.ts`.
 */
const ENUM_LABEL: Record<string, string> = {
  CASH: 'Tunai',
  QRIS: 'QRIS',
  GOPAY: 'GoPay',
  CARD: 'Kartu Kredit/Debit',
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
  return metodeInfo(metode)?.name ?? ENUM_LABEL[metode] ?? metode;
}

/** Ikon untuk kode metode apa pun — jalur online jatuh ke ikon bola dunia. */
export function ikonMetode(metode: string | null | undefined): PaymentIconName {
  if (!metode) return 'online';
  return metodeInfo(metode)?.icon ?? 'online';
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
  if (metodeInfo(metode)) return 'manual';
  if (metode === 'CASH' || metode === 'EDC') return 'manual';
  return 'online';
}

/**
 * Kalimat pendek "apa yang terjadi setelah tamu memilih metode ini".
 *
 * Dipakai di halaman pengaturan supaya pemilik kafe paham konsekuensinya tanpa
 * harus membaca dokumentasi: metode yang butuh verifikasi TIDAK melunasi
 * pesanan dengan sendirinya.
 */
export function akibatMetode(code: KodeMetode, wajibVerifikasi: boolean): string {
  if (code === 'TUNAI') return 'Lunas setelah kasir menerima uangnya.';
  if (code === 'EDC') return 'Lunas setelah kasir mengonfirmasi struk EDC.';
  return wajibVerifikasi
    ? 'Pesanan menunggu verifikasi kasir sebelum dianggap lunas.'
    : 'Lunas setelah kasir mengonfirmasi.';
}
