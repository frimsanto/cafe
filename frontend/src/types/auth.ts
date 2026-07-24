// Tipe autentikasi & peran — selaras dengan tabel `users` pada PRD
// (role: OWNER | KASIR | DAPUR, terikat ke satu `cafeId` untuk multi-tenant).

export type UserRole = 'OWNER' | 'KASIR' | 'DAPUR';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  /** Kafe (tenant) tempat pengguna ini bekerja — dasar isolasi data. */
  cafeId: string;
  cafeName: string;
}

export const ROLE_LABEL: Record<UserRole, string> = {
  OWNER: 'Pemilik',
  KASIR: 'Kasir',
  DAPUR: 'Dapur',
};

/** Halaman tujuan setelah login, sesuai peran pengguna. */
export function landingPathFor(role: UserRole): string {
  switch (role) {
    case 'DAPUR':
      return '/dapur';
    case 'KASIR':
    case 'OWNER':
    default:
      return '/dasbor';
  }
}
