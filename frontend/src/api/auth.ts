import type { AuthUser } from '../types/auth';
import { apiFetch } from '../lib/apiClient';

// Endpoint autentikasi (publik — belum punya token saat dipanggil).
//
//   POST /api/auth/register  { cafeName, address, ownerName, email, password }
//   POST /api/auth/login     { email, password }
//
// Keduanya membalas `{ token, user }`: JWT untuk header Authorization pada
// permintaan berikutnya, dan profil pengguna termasuk `cafeId` — dasar isolasi
// tenant di seluruh aplikasi.

/** Sesi hasil login/daftar. Bentuknya sama dengan `AuthSessionDTO` di backend. */
export interface AuthSession {
  token: string;
  user: AuthUser;
}

export interface RegisterPayload {
  cafeName: string;
  address: string;
  ownerName: string;
  email: string;
  password: string;
}

export const authApi = {
  login(email: string, password: string): Promise<AuthSession> {
    return apiFetch<AuthSession>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  register(input: RegisterPayload): Promise<AuthSession> {
    return apiFetch<AuthSession>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },
};
