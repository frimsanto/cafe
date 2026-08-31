import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { prisma } from './lib/prisma';
import { apiRouter } from './routes';
import { errorHandler, notFoundHandler } from './middleware/error';
import { daftarOriginDiizinkan } from './lib/konfigurasi';

/**
 * Membuat instance aplikasi Express.
 *
 * Endpoint domain (menu, pesanan, pembayaran) dipasang di bawah `/api`.
 */
export function createApp() {
  const app = express();

  // CORS dengan `credentials`, supaya cookie HttpOnly milik terminal POS ikut
  // terkirim (lihat `lib/cookie.ts`).
  //
  // Origin-nya DAFTAR EKSPLISIT, bukan pantulan. `origin: true` memantulkan
  // siapa pun yang bertanya, dan digabung dengan `credentials: true` artinya
  // setiap situs boleh memanggil API ini dengan cookie pengguna terbawa —
  // menyandarkan seluruh pertahanan pada `SameSite=Strict` saja.
  //
  // Permintaan tanpa `Origin` tetap diterima: itu bukan lintas-situs dari
  // peramban melainkan webhook gateway, health check, dan `curl` — yang tidak
  // pernah membawa cookie siapa pun. Menolaknya akan mematikan notifikasi
  // pembayaran.
  const originDiizinkan = daftarOriginDiizinkan();
  app.use(
    cors({
      origin(origin, cb) {
        if (!origin || originDiizinkan.includes(origin)) {
          cb(null, true);
          return;
        }
        // `false`, bukan Error: origin yang tidak diizinkan cukup tidak
        // mendapat header CORS (peramban yang menolaknya), alih-alih membuat
        // seluruh permintaan berakhir 500 di log kami.
        cb(null, false);
      },
      credentials: true,
    }),
  );
  // Simpan body MENTAH di samping hasil parse. Webhook DOKU menandatangani
  // digest SHA-256 atas byte yang dikirimnya; menyusun ulang JSON dari objek
  // hasil parse menghasilkan byte berbeda (spasi/urutan kunci) dan akan membuat
  // notifikasi yang sah ikut tertolak.
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        (req as Request & { rawBody?: string }).rawBody = buf.toString('utf8');
      },
    }),
  );

  // Liveness — server hidup.
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', service: 'cafeos-backend' });
  });

  // Readiness — koneksi database sehat.
  app.get('/health/db', async (_req: Request, res: Response) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ok', database: 'connected' });
    } catch {
      res.status(503).json({ status: 'error', database: 'unreachable' });
    }
  });

  app.use('/api', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
