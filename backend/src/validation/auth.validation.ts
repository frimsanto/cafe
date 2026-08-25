import { ApiError } from '../lib/ApiError';

const MAX_TEXT = 200;

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw ApiError.badRequest('Body permintaan harus berupa objek JSON');
  }
  return value as Record<string, unknown>;
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw ApiError.badRequest(`Field "${field}" wajib diisi`);
  }
  const trimmed = value.trim();
  if (trimmed.length > MAX_TEXT) {
    throw ApiError.badRequest(`Field "${field}" terlalu panjang (maks ${MAX_TEXT})`);
  }
  return trimmed;
}

export interface LoginInput {
  email: string;
  password: string;
}

/**
 * Validasi body login. Sengaja TIDAK memeriksa panjang kata sandi di sini —
 * aturan panjang hanya berlaku saat mendaftar; saat login, kredensial salah
 * apa pun bentuknya dijawab dengan pesan generik yang sama.
 */
export function parseLoginInput(body: unknown): LoginInput {
  const obj = asRecord(body);
  const email = requiredText(obj.email, 'email').toLowerCase();
  const password = obj.password;
  if (typeof password !== 'string' || password === '') {
    throw ApiError.badRequest('Field "password" wajib diisi');
  }
  return { email, password };
}

export interface RefreshInput {
  refreshToken: string;
}

/**
 * Validasi body permintaan perpanjangan sesi. Isi tokennya tidak diperiksa di
 * sini — verifikasi tanda tangan & masa berlaku adalah tugas `authService`.
 */
export function parseRefreshInput(body: unknown): RefreshInput {
  const obj = asRecord(body);
  const refreshToken = obj.refreshToken;
  if (typeof refreshToken !== 'string' || refreshToken.trim() === '') {
    throw ApiError.badRequest('Field "refreshToken" wajib diisi');
  }
  return { refreshToken: refreshToken.trim() };
}

// CATATAN: `parseRegisterInput` sudah DIHAPUS bersama `authService.register`.
// Body formulir pendaftaran kini divalidasi `pendaftaran.validation.ts` dan
// berakhir di tabel `tenant_registrations`, bukan di `users`.
