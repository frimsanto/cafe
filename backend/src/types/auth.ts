/**
 * Peran pengguna. Saat tabel `users` dibuat (fase Autentikasi & Multi-Tenant),
 * nilai ini akan disejajarkan dengan enum Role di Prisma.
 */
export type AuthRole = 'OWNER' | 'KASIR' | 'DAPUR';

/** Isi token yang dibawa setiap permintaan terlindungi. */
export interface AuthPayload {
  userId: string;
  /** Tenant pemilik sesi — dasar isolasi data antar kafe. */
  cafeId: string;
  role: AuthRole;
}

export const AUTH_ROLES: AuthRole[] = ['OWNER', 'KASIR', 'DAPUR'];
