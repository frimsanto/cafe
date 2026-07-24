import { ApiError } from '../lib/ApiError';
import { MIN_PASSWORD_LENGTH } from '../lib/password';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_TEXT = 200;

export interface RegisterInput {
  cafeName: string;
  address: string | null;
  ownerName: string;
  email: string;
  password: string;
}

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

/** Validasi body pendaftaran kafe baru. */
export function parseRegisterInput(body: unknown): RegisterInput {
  const obj = asRecord(body);

  const cafeName = requiredText(obj.cafeName, 'cafeName');
  const ownerName = requiredText(obj.ownerName, 'ownerName');
  const email = requiredText(obj.email, 'email').toLowerCase();
  if (!EMAIL_RE.test(email)) {
    throw ApiError.badRequest('Format email tidak valid');
  }

  const password = obj.password;
  if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH) {
    throw ApiError.badRequest(
      `Kata sandi minimal ${MIN_PASSWORD_LENGTH} karakter`,
    );
  }

  let address: string | null = null;
  if (obj.address !== undefined && obj.address !== null && obj.address !== '') {
    address = requiredText(obj.address, 'address');
  }

  return { cafeName, address, ownerName, email, password };
}
