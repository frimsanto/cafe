// Kosakata TUNGGAL status pembayaran CafeOS.
//
// Status PEMBAYARAN (uang) sengaja dipisah dari status PESANAN/DAPUR
// (`OrderStatus`). Sebuah pesanan bisa saja sudah masuk dapur sementara
// uangnya belum diterima (bayar di kasir), dan sebaliknya.
//
// Nilainya disimpan di kolom TEKS `orders.status_pembayaran` — bukan enum
// PostgreSQL — supaya menambah status baru tidak menuntut migrasi tipe yang
// mengunci tabel. Konsekuensinya: validasi ada di sini, dan SETIAP pembacaan
// melewati `normalisasiStatus()` agar baris lama (kosakata Indonesia) tetap
// terbaca benar tanpa harus menunggu migrasi data selesai.

/** Status pembayaran kanonik. */
export const STATUS_PEMBAYARAN = [
  'UNPAID',
  'AWAITING_VERIFICATION',
  'PAID',
  'FAILED',
  'EXPIRED',
  'CANCELLED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
] as const;

export type StatusPembayaran = (typeof STATUS_PEMBAYARAN)[number];

/**
 * Kosakata LAMA → kanonik.
 *
 * Baris yang dibuat sebelum migrasi `20260830000000_pengaturan_pembayaran`
 * menyimpan MENUNGGU/LUNAS/GAGAL. Migrasi itu memperbaruinya, tapi peta ini
 * tetap dipertahankan: klien lama (PWA yang belum di-refresh) masih mengirim
 * kosakata lama pada filter riwayat, dan menolaknya akan mematikan layar yang
 * sedang dipakai kasir.
 */
const ALIAS_LAMA: Record<string, StatusPembayaran> = {
  MENUNGGU: 'UNPAID',
  LUNAS: 'PAID',
  GAGAL: 'FAILED',
};

export function isStatusPembayaran(value: unknown): value is StatusPembayaran {
  return (
    typeof value === 'string' && (STATUS_PEMBAYARAN as readonly string[]).includes(value)
  );
}

/**
 * Ubah nilai apa pun dari database/klien menjadi status kanonik.
 *
 * `null` (pesanan lama sebelum kolom ini ada) dan nilai tak dikenal jatuh ke
 * `UNPAID` — anggapan paling aman: belum ada uang yang diterima.
 */
export function normalisasiStatus(value: string | null | undefined): StatusPembayaran {
  if (!value) return 'UNPAID';
  if (isStatusPembayaran(value)) return value;
  return ALIAS_LAMA[value.toUpperCase()] ?? 'UNPAID';
}

/** Status akhir — tidak akan berubah lagi tanpa tindakan manusia. */
const FINAL = new Set<StatusPembayaran>([
  'PAID',
  'FAILED',
  'EXPIRED',
  'CANCELLED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
]);

export function statusFinal(status: StatusPembayaran): boolean {
  return FINAL.has(status);
}

/** True hanya untuk status yang berarti uang kafe SUDAH diterima penuh. */
export function statusLunas(status: StatusPembayaran): boolean {
  return status === 'PAID';
}

/** Label Indonesia untuk ditampilkan — dipakai struk & respons API. */
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

export function labelStatus(status: string | null | undefined): string {
  return STATUS_LABEL[normalisasiStatus(status)];
}
