import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { prisma } from './lib/prisma';
import { apiRouter } from './routes';
import { errorHandler, notFoundHandler } from './middleware/error';

/**
 * Membuat instance aplikasi Express.
 *
 * Endpoint domain (menu, pesanan, pembayaran) dipasang di bawah `/api`.
 */
export function createApp() {
  const app = express();

  // CORS dengan `credentials`, supaya cookie HttpOnly milik terminal POS ikut
  // terkirim (lihat `lib/cookie.ts`). `origin: true` MEMANTULKAN origin
  // pemanggil alih-alih `*` — keduanya tidak boleh digabung dengan credentials.
  //
  // Yang menjaga terhadap CSRF di sini BUKAN daftar origin ini, melainkan
  // `SameSite: 'strict'` pada cookienya: browser tidak akan pernah menyertakan
  // cookie POS pada permintaan yang berasal dari situs lain, apa pun yang
  // dikatakan header CORS. Itu penting karena origin frontend CafeOS berbeda
  // antara produksi, pengembangan, dan tiap perangkat yang dipakai menguji —
  // daftar yang harus dijaga tetap akurat akan menjadi sumber kegagalan
  // tersendiri, dengan gejala yang menyesatkan.
  //
  // Endpoint publik pelanggan (menu QR, status pesanan) tidak membawa cookie
  // apa pun, jadi perilakunya tidak berubah oleh perubahan ini.
  app.use(cors({ origin: true, credentials: true }));
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
