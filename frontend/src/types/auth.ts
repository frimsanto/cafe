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

/**
 * Halaman tujuan setelah login, sesuai peran pengguna.
 *
 * Setiap peran HARUS dipulangkan ke halaman yang memang boleh dibukanya.
 * Sebelumnya KASIR ikut dipulangkan ke `/dasbor`, sementara rute itu dijaga
 * `allow={['OWNER']}` — sehingga setiap kasir yang berhasil masuk langsung
 * mendarat di halaman 403, dan satu-satunya jalan ke layar kerjanya adalah
 * mengetik `/kasir` sendiri di bilah alamat.
 *
 * Daftar di bawah sengaja MENYEBUT setiap peran secara eksplisit dan tidak
 * memakai `default`: peran baru yang kelak ditambahkan akan menjadi galat
 * TypeScript di sini, bukan diam-diam dipulangkan ke halaman milik orang lain.
 */
const HALAMAN_UTAMA: Record<UserRole, string> = {
  OWNER: '/dasbor',
  KASIR: '/kasir',
  DAPUR: '/dapur',
};

export function landingPathFor(role: UserRole): string {
  return HALAMAN_UTAMA[role] ?? '/kasir';
}
