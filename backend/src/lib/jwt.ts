import jwt from 'jsonwebtoken';
import type { AuthPayload, AuthRole } from '../types/auth';
import { AUTH_ROLES } from '../types/auth';

const SECRET = process.env.JWT_SECRET ?? '';
const EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '12h';

/** Token hanya bisa dipakai bila secret dikonfigurasi. */
export const jwtEnabled = SECRET.length > 0;

/**
 * Terbitkan token akses. Dipakai endpoint login (fase Autentikasi);
 * disediakan di sini agar penerbitan & verifikasi memakai kontrak yang sama.
 */
export function signAccessToken(payload: AuthPayload): string {
  if (!jwtEnabled) throw new Error('JWT_SECRET belum dikonfigurasi');
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRES_IN } as jwt.SignOptions);
}

/** Verifikasi token; mengembalikan null bila tidak valid/kedaluwarsa. */
export function verifyAccessToken(token: string): AuthPayload | null {
  if (!jwtEnabled) return null;
  try {
    const decoded = jwt.verify(token, SECRET);
    if (typeof decoded !== 'object' || decoded === null) return null;

    const { userId, cafeId, role } = decoded as Record<string, unknown>;
    if (
      typeof userId !== 'string' ||
      typeof cafeId !== 'string' ||
      typeof role !== 'string' ||
      !AUTH_ROLES.includes(role as AuthRole)
    ) {
      return null;
    }
    return { userId, cafeId, role: role as AuthRole };
  } catch {
    return null;
  }
}
