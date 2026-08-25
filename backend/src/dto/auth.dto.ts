import type { Cafe, User } from '@prisma/client';
import type { AuthRole } from '../types/auth';

/** Profil pengguna yang aman dikirim ke klien — TANPA `passwordHash`. */
export interface AuthUserDTO {
  id: string;
  name: string;
  email: string;
  role: AuthRole;
  cafeId: string;
  cafeName: string;
}

export interface AuthSessionDTO {
  /** Token akses berumur pendek untuk header `Authorization`. */
  token: string;
  /** Token berumur panjang; hanya dipakai untuk menukar token akses baru. */
  refreshToken: string;
  user: AuthUserDTO;
}

/**
 * Balasan `POST /api/auth/refresh`. Refresh token TIDAK ikut diperbarui —
 * yang lama tetap berlaku sampai kedaluwarsa, jadi masa sesi punya batas atas
 * yang pasti dan tidak bergeser setiap kali token akses diperbarui.
 */
export interface AuthRefreshDTO {
  token: string;
  user: AuthUserDTO;
}

export function toAuthUserDTO(user: User, cafe: Pick<Cafe, 'name'>): AuthUserDTO {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    cafeId: user.cafeId,
    cafeName: cafe.name,
  };
}
