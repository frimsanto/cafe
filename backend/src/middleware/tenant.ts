import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../lib/ApiError';
import { runWithTenant } from '../lib/tenantContext';

/**
 * Menjalankan sisa penanganan permintaan di dalam konteks tenant pengguna.
 *
 * Setelah middleware ini, seluruh query Prisma pada model ber-tenant otomatis
 * dibatasi `cafeId` milik pengguna (lihat `tenantExtension`). Pasang SETELAH
 * `requireAuth` karena sumber `cafeId` adalah token, bukan input klien.
 */
export function tenantScope(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) {
    next(new ApiError(401, 'Belum terautentikasi'));
    return;
  }
  runWithTenant(req.auth.cafeId, next);
}
