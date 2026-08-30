import type { StatusPembayaran } from '../types/order';

// Cerminan `backend/src/lib/paymentStatus.ts`. Keduanya harus tetap sinkron —
// server yang memutuskan, layar hanya menerjemahkan.
//
// Alasan berkas ini ada di frontend sama sekali: status pembayaran muncul di
// EMPAT layar (kasir, checkout, status pesanan, riwayat) dan sebelumnya
// masing-masing punya peta labelnya sendiri. Peta yang tercecer selalu
// berakhir sama — satu layar menampilkan "Menunggu" untuk keadaan yang oleh
// layar lain sudah disebut "Gagal".

/** Kosakata lama yang mungkin masih datang dari server/PWA versi sebelumnya. */
const ALIAS_LAMA: Record<string, StatusPembayaran> = {
  MENUNGGU: 'UNPAID',
  LUNAS: 'PAID',
  GAGAL: 'FAILED',
};

const SEMUA: StatusPembayaran[] = [
  'UNPAID',
  'AWAITING_VERIFICATION',
  'PAID',
  'FAILED',
  'EXPIRED',
  'CANCELLED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
];

/** Ubah nilai apa pun menjadi status kanonik; tak dikenal → `UNPAID`. */
export function normalisasiStatus(
  value: string | null | undefined,
): StatusPembayaran {
  if (!value) return 'UNPAID';
  if ((SEMUA as string[]).includes(value)) return value as StatusPembayaran;
  return ALIAS_LAMA[value.toUpperCase()] ?? 'UNPAID';
}

export const STATUS_LABEL: Record<StatusPembayaran, string> = {
  UNPAID: 'Belum Dibayar',
  AWAITING_VERIFICATION: 'Menunggu Verifikasi',
  PAID: 'Lunas',
  FAILED: 'Gagal',
  EXPIRED: 'Kedaluwarsa',
  CANCELLED: 'Dibatalkan',
  REFUNDED: 'Dikembalikan',
  PARTIALLY_REFUNDED: 'Dikembalikan Sebagian',
};

export function labelStatus(value: string | null | undefined): string {
  return STATUS_LABEL[normalisasiStatus(value)];
}

/** Nada warna badge — hanya tampilan, bukan perilaku. */
export type NadaStatus = 'netral' | 'menunggu' | 'sukses' | 'gagal';

const NADA: Record<StatusPembayaran, NadaStatus> = {
  UNPAID: 'netral',
  AWAITING_VERIFICATION: 'menunggu',
  PAID: 'sukses',
  FAILED: 'gagal',
  EXPIRED: 'gagal',
  CANCELLED: 'gagal',
  REFUNDED: 'menunggu',
  PARTIALLY_REFUNDED: 'menunggu',
};

export function nadaStatus(value: string | null | undefined): NadaStatus {
  return NADA[normalisasiStatus(value)];
}

/** Uang kafe sudah diterima penuh. */
export function statusLunas(value: string | null | undefined): boolean {
  return normalisasiStatus(value) === 'PAID';
}

/**
 * Status akhir — polling boleh berhenti di sini.
 *
 * `AWAITING_VERIFICATION` sengaja TIDAK final: yang ditunggu adalah kasir
 * menekan tombol, dan halaman tamu harus terus memeriksa sampai itu terjadi.
 */
export function statusFinal(value: string | null | undefined): boolean {
  const status = normalisasiStatus(value);
  return status !== 'UNPAID' && status !== 'AWAITING_VERIFICATION';
}
