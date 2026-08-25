import type { AuthUser } from '../types/auth';
import { apiFetch } from '../lib/apiClient';

// Endpoint autentikasi (publik — belum punya token saat dipanggil).
//
//   POST /api/auth/login     { email, password }
//   POST /api/auth/refresh   { refreshToken }
//
// Login membalas `{ token, refreshToken, user }`: JWT untuk header
// Authorization pada permintaan berikutnya, token perpanjangan sesi, dan profil
// pengguna termasuk `cafeId` — dasar isolasi tenant di seluruh aplikasi.
//
// Perpanjangan otomatis saat token akses kedaluwarsa ditangani `apiClient`, jadi
// `/auth/refresh` di sini tidak dipanggil layar mana pun secara langsung.
//
// `POST /api/auth/register` sudah ditutup backend (410) dan pembungkusnya
// dihapus dari berkas ini: pendaftaran kini lewat `api/pendaftaran.ts`, yang
// mengirim permintaan untuk disetujui admin dan TIDAK menerbitkan sesi.

/** Sesi hasil login. Bentuknya sama dengan `AuthSessionDTO` di backend. */
export interface AuthSession {
  token: string;
  refreshToken: string;
  user: AuthUser;
}

export const authApi = {
  login(email: string, password: string): Promise<AuthSession> {
    return apiFetch<AuthSession>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },
};
