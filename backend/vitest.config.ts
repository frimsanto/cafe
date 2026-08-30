import { defineConfig } from 'vitest/config';

/**
 * Uji backend.
 *
 * TIDAK ADA satu pun uji yang menyambung ke server database. Itu keputusan
 * sadar: CafeOS dipasang di satu VPS dengan satu PostgreSQL, dan rangkaian uji
 * yang menuntut koneksi akan berakhir dijalankan terhadap database sungguhan —
 * cepat atau lambat oleh seseorang yang tidak menyadarinya.
 *
 * Aturannya ditegakkan dua cara, sesuai apa yang sedang diuji:
 *
 *   1. **Uji aturan** — `lib/prisma` di-mock per berkas (`vi.mock`). Yang diuji
 *      adalah ATURAN: siapa boleh menyentuh apa, apa yang membuat sebuah
 *      pembayaran dianggap lunas, notifikasi mana yang ditolak. Itulah yang
 *      mahal kalau salah — bukan apakah Prisma bisa menulis baris.
 *
 *   2. **Uji migrasi** (`src/test/migrasiStafShift.test.ts`) — dijalankan di
 *      atas PGlite: PostgreSQL yang dikompilasi ke WebAssembly, hidup di dalam
 *      proses ini. Tidak ada server yang dihubungi, tidak ada `DATABASE_URL`
 *      yang dibaca, tidak ada port yang dibuka; databasenya lahir kosong di
 *      memori dan mati bersama berkas ujinya.
 *
 *      Jadi aturan "tanpa database" tidak dilanggar — justru ditegakkan. Yang
 *      didapat sebagai gantinya: foreign key, CHECK constraint, dan partial
 *      unique index diuji oleh mesin yang sama dengan yang kelak menjalankannya
 *      di produksi, bukan dibaca sekilas lalu diharapkan benar.
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
