import 'dotenv/config';
import { createApp } from './app';
import { enkripsiSiap } from './lib/enkripsi';
import { prisma } from './lib/prisma';
import { realtime } from './realtime/realtime';
import { daftarOriginDiizinkan, siapkanDirektoriFoto } from './lib/konfigurasi';

const PORT = Number(process.env.PORT ?? 4000);

/**
 * Peringatkan SEKALI di awal bila kredensial pembayaran tidak akan bisa dibaca.
 *
 * Tanpa ini, ketiadaan ENCRYPTION_KEY baru ketahuan saat seorang pemilik kafe
 * menekan "Tes Koneksi" dan mendapat pesan yang seolah menyalahkan kuncinya.
 * Dicatat di log boot, tempat pengelola server sungguh melihatnya.
 *
 * Prosesnya TIDAK dimatikan: kafe yang belum memakai Midtrans tetap harus bisa
 * menagih tunai. Yang berkaitan dengan kredensiallah yang gagal — masing-masing
 * dengan pesannya sendiri.
 *
 * Kalau baris ini muncul padahal `.env` sudah berisi ENCRYPTION_KEY, yang
 * belum membacanya adalah PROSESNYA: PM2 menyimpan environment saat aplikasi
 * pertama di-start. Setelah `.env` berubah, `pm2 restart <app> --update-env`
 * (atau `pm2 delete` lalu `pm2 start`) yang membuatnya terbawa; `pm2 restart`
 * biasa memakai ulang environment lama.
 */
function periksaKonfigurasiKredensial(): void {
  if (enkripsiSiap()) return;
  console.error(
    '[cafeos-backend] ENCRYPTION_KEY belum diset (atau bukan 64 karakter hex). ' +
      'Kredensial pembayaran tersimpan TIDAK bisa dibaca dan yang baru TIDAK bisa disimpan. ' +
      'Isi ENCRYPTION_KEY di .env lalu: pm2 restart cafeos-backend --update-env',
  );
}

/**
 * Siapkan penyimpanan foto absensi SEBELUM server menerima permintaan.
 *
 * Berbeda dari peringatan kredensial di atas, yang ini MEMATIKAN proses bila
 * gagal di produksi. Alasannya berbeda pula: kafe tanpa Midtrans tetap bisa
 * berjualan tunai, jadi kredensial yang tidak terbaca hanya melumpuhkan satu
 * fitur. Direktori foto yang salah bukan fitur yang mati — ia fitur yang
 * BERJALAN ke tempat yang keliru, menumpuk wajah karyawan di dalam worktree
 * atau di direktori yang ikut tersaji sebagai berkas statis. Kegagalan yang
 * terlihat saat boot jauh lebih murah daripada penemuan itu sebulan kemudian.
 */
function siapkanPenyimpanan(): void {
  try {
    const { direktori, dariEnv } = siapkanDirektoriFoto();
    console.log(`[cafeos-backend] foto absensi disimpan di ${direktori}`);
    if (!dariEnv) {
      console.warn(
        '[cafeos-backend] ATTENDANCE_PHOTO_DIR belum diset — memakai folder bawaan ' +
          'pengembangan. Di produksi variabel ini WAJIB dan harus menunjuk ke luar ' +
          'folder aplikasi.',
      );
    }
  } catch (err) {
    console.error(
      `[cafeos-backend] penyimpanan foto absensi tidak siap: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    if (process.env.NODE_ENV === 'production') process.exit(1);
  }
}

siapkanPenyimpanan();

const app = createApp();

const server = app.listen(PORT, () => {
  console.log(`[cafeos-backend] listening on http://localhost:${PORT}`);
  console.log(`[cafeos-backend] WebSocket realtime on ws://localhost:${PORT}/ws`);
  periksaKonfigurasiKredensial();

  // Daftar origin dicetak saat boot — "kasir tidak bisa masuk" paling sering
  // berujung pada satu origin yang lupa didaftarkan, dan mencarinya tanpa
  // daftar ini berarti menebak-nebak.
  console.log(
    `[cafeos-backend] origin ber-cookie yang diizinkan: ${
      daftarOriginDiizinkan().join(', ') || '(kosong — setel CORS_ORIGINS/PUBLIC_APP_URL)'
    }`,
  );
});

// Pasang WebSocket realtime pada HTTP server yang sama.
realtime.init(server);

// Matikan koneksi dengan rapi saat proses dihentikan (PM2 restart / SIGTERM).
async function shutdown(signal: string) {
  console.log(`[cafeos-backend] ${signal} received, shutting down…`);
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
