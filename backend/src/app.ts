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

  app.use(cors());
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
