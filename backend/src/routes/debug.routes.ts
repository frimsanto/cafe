import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { ApiError } from '../lib/ApiError';
import { requireAuth, requireRole, attachUser } from '../middleware/auth';
import { pushService } from '../services/push.service';
import { webPushEnabled } from '../lib/webpush';

export const debugRouter = Router();

/**
 * Token bypass opsional untuk menguji push langsung dari terminal VPS.
 *
 * Tanpa ini, menguji notifikasi selalu menuntut login staf lebih dulu — repot
 * justru pada saat yang paling dibutuhkan: saat push-nya sedang rusak dan kita
 * ingin tahu apakah rantainya sampai ke perangkat. Fiturnya mati total kecuali
 * `PUSH_DEBUG_TOKEN` benar-benar disetel di env, jadi server yang tidak
 * menyetelnya tidak punya pintu tambahan sama sekali.
 */
const debugToken = process.env.PUSH_DEBUG_TOKEN ?? '';

/**
 * Endpoint uji push: kirim notifikasi ke SEMUA perangkat yang berlangganan di
 * sebuah kafe.
 *
 * Dua jalan masuk, keduanya tertutup bagi publik:
 *   1. Staf yang login (OWNER/KASIR/DAPUR) — `cafeId` diambil dari TOKEN, bukan
 *      dari body. Kalau dibaca dari body, seorang staf bisa membunyikan ponsel
 *      tamu kafe lain hanya dengan menebak id-nya.
 *   2. Header `x-debug-token` yang cocok dengan `PUSH_DEBUG_TOKEN` — baru di
 *      jalur ini `cafeId` boleh datang dari body, karena pemegang token itu
 *      adalah operator server.
 *
 * Balasannya menyebut jumlah langganan yang dicoba beserta rinciannya, sehingga
 * "tidak ada notifikasi masuk" bisa langsung dipisahkan menjadi "tidak ada yang
 * berlangganan" versus "terkirim tapi tidak tampil di perangkat".
 */
debugRouter.post(
  '/debug/push-test',
  (req, res, next) => {
    // Jalur token operator melewati seluruh rantai autentikasi staf.
    if (debugToken && req.headers['x-debug-token'] === debugToken) {
      next();
      return;
    }
    // Rantai staf dijalankan berurutan secara manual — `Router.use` tidak bisa
    // dipasang bersyarat per-permintaan seperti ini.
    requireAuth(req, res, (err?: unknown) => {
      if (err) return next(err);
      requireRole('OWNER', 'KASIR', 'DAPUR')(req, res, (err2?: unknown) => {
        if (err2) return next(err2);
        void attachUser(req, res, next);
      });
    });
  },
  asyncHandler(async (req, res) => {
    const dariBody = (req.body as { cafeId?: unknown } | undefined)?.cafeId;
    // Token staf selalu menang atas body — lihat catatan keamanan di atas.
    const cafeId =
      req.auth?.cafeId ?? (typeof dariBody === 'string' ? dariBody.trim() : '');
    if (!cafeId) {
      throw ApiError.badRequest('Field "cafeId" wajib diisi');
    }

    const hasil = await pushService.kirimPushUji(cafeId);
    res.json({
      data: {
        cafeId,
        webPushEnabled,
        ...hasil,
        pesan:
          hasil.total === 0
            ? 'Tidak ada perangkat yang berlangganan di kafe ini — buka halaman status pesanan lalu tekan "Aktifkan" notifikasi.'
            : `Terkirim ke ${hasil.berhasil} dari ${hasil.total} perangkat.`,
      },
    });
  }),
);
