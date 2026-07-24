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
