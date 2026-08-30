import { defineConfig } from 'vitest/config';

/**
 * Uji backend.
 *
 * SEMUANYA berjalan TANPA database. Itu keputusan sadar: CafeOS dipasang di
 * satu VPS dengan satu PostgreSQL, dan rangkaian uji yang menuntut koneksi akan
 * berakhir dijalankan terhadap database sungguhan — cepat atau lambat oleh
 * seseorang yang tidak menyadarinya.
 *
 * Karena itu `lib/prisma` di-mock per berkas uji (`vi.mock`), dan yang diuji
 * adalah ATURAN: siapa boleh menyentuh apa, apa yang membuat sebuah pembayaran
 * dianggap lunas, dan notifikasi mana yang ditolak. Aturan itulah yang mahal
 * kalau salah — bukan apakah Prisma bisa menulis baris.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // `restoreMocks` mengembalikan spy ke aslinya setelah tiap uji, sehingga
    // satu berkas tidak bisa mewariskan mock yang bocor ke berkas berikutnya.
    restoreMocks: true,
    clearMocks: true,
  },
});
