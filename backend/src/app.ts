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
  app.use(express.json());

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
