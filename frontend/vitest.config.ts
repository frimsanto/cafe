import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

/**
 * Uji frontend.
 *
 * Yang diuji adalah PERILAKU yang ditemui pengguna: tombol simpan hanya
 * menyala ketika ada yang berubah, sakelar yang tidak boleh dinyalakan memang
 * mati, dan mengaktifkan Production menuntut konfirmasi. Bukan bentuk markup —
 * kelas Tailwind boleh berganti kapan saja tanpa satu uji pun ikut merah.
 *
 * Semua panggilan API di-mock; tidak ada permintaan jaringan yang keluar.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
    clearMocks: true,
  },
});
