import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ApiError } from '../lib/ApiError';

/** Handler 404 untuk route yang tidak dikenal. */
export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: 'Endpoint tidak ditemukan' });
}

/** Error handler terpusat — menerjemahkan error menjadi respons JSON. */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
) {
  if (err instanceof ApiError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  // Body JSON tidak valid (dilempar oleh express.json / body-parser).
  if (
    err &&
    typeof err === 'object' &&
    'type' in err &&
    (err as { type?: string }).type === 'entity.parse.failed'
  ) {
    res.status(400).json({ error: 'Body JSON tidak valid' });
    return;
  }

  // Data tidak ditemukan pada operasi Prisma (mis. update/delete).
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') {
    res.status(404).json({ error: 'Data tidak ditemukan' });
    return;
  }

  // Pelanggaran unique constraint yang belum ditangani service (mis. nama
  // kategori/item kembar) — 409, bukan 500.
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    res.status(409).json({ error: 'Data dengan nilai tersebut sudah ada' });
    return;
  }

  // Input tidak valid untuk query Prisma (mis. UUID salah format).
  if (err instanceof Prisma.PrismaClientValidationError) {
    res.status(400).json({ error: 'Permintaan tidak valid' });
    return;
  }

  console.error('[cafeos-backend] Unhandled error:', err);
  res.status(500).json({ error: 'Terjadi kesalahan pada server' });
}
