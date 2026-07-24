import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ApiError } from '../lib/ApiError';
import { verifyAccessToken } from '../lib/jwt';
import { prisma } from '../lib/prisma';
import { toAuthUserDTO } from '../dto/auth.dto';
import type { AuthRole } from '../types/auth';

/** Ambil token dari header `Authorization: Bearer <token>`. */
function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

/** Wajib membawa token yang valid; menempelkan `req.auth`. */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = bearerToken(req);
  if (!token) {
    next(new ApiError(401, 'Token akses tidak ditemukan'));
    return;
  }
  const payload = verifyAccessToken(token);
  if (!payload) {
    next(new ApiError(401, 'Token akses tidak valid atau kedaluwarsa'));
    return;
  }
  req.auth = payload;
  next();
}

/** Batasi akses ke peran tertentu (dipakai setelah `requireAuth`). */
export function requireRole(...roles: AuthRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) {
      next(new ApiError(401, 'Belum terautentikasi'));
      return;
    }
    if (!roles.includes(req.auth.role)) {
      next(new ApiError(403, 'Peranmu tidak berhak mengakses sumber daya ini'));
      return;
    }
    next();
  };
}

/**
 * Penegakan isolasi multi-tenant: `:cafeId` pada URL harus sama dengan kafe
 * pada token. Mencegah pengguna satu kafe membaca data kafe lain meski
 * menebak-nebak id di URL.
 */
export function requireSameCafe(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) {
    next(new ApiError(401, 'Belum terautentikasi'));
    return;
  }
  if (req.params.cafeId !== req.auth.cafeId) {
    next(new ApiError(403, 'Kamu tidak memiliki akses ke data kafe ini'));
    return;
  }
  next();
}

/**
 * Muat pengguna asli dari database dan suntikkan ke `req.user`.
 *
 * Token bersifat stateless, jadi klaim di dalamnya bisa "basi": pengguna sudah
 * dinonaktifkan, dipindah kafe, atau perannya diubah setelah token terbit.
 * Middleware ini menolak sesi semacam itu sehingga otorisasi selalu memakai
 * kondisi terkini. Dipasang SETELAH pemeriksaan peran/tenant agar permintaan
 * yang jelas ditolak tidak perlu menyentuh database.
 */
export async function attachUser(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) {
    next(new ApiError(401, 'Belum terautentikasi'));
    return;
  }
  try {
    const user = await prisma.user.findFirst({
      where: { id: req.auth.userId, deletedAt: null },
      include: { cafe: { select: { name: true } } },
    });

    if (!user || user.cafeId !== req.auth.cafeId || user.role !== req.auth.role) {
      next(new ApiError(401, 'Sesi tidak berlaku lagi, silakan masuk kembali'));
      return;
    }

    req.user = toAuthUserDTO(user, user.cafe);
    next();
  } catch (err) {
    next(err);
  }
}

/** Wajib token valid + pengguna aktif di database. */
export const requireUser: RequestHandler[] = [requireAuth, attachUser];
