import { API_BASE_URL } from './apiConfig';

/**
 * Kunci penyimpanan token akses. Fase frontend masih memakai autentikasi
 * tiruan (belum ada token), jadi nilainya biasanya kosong — begitu integrasi
 * login ke API dikerjakan, cukup isi kunci yang sama.
 */
export const AUTH_TOKEN_KEY = 'cafeos-auth-token';

/** Kesalahan dari API, lengkap dengan kode status HTTP-nya. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Ubah kegagalan apa pun menjadi kalimat yang bisa dipahami pengguna.
 *
 * Kegagalan jaringan (`fetch` melempar TypeError) dibedakan dari penolakan
 * server, dan status yang sering muncul diberi saran tindakan — pesan "Failed
 * to fetch" mentah tidak membantu siapa pun.
 */
export function describeApiError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    switch (error.status) {
      case 401:
        return 'Sesi kamu sudah berakhir. Masuk ulang untuk melanjutkan.';
      case 403:
        return 'Kamu tidak punya hak akses untuk tindakan ini.';
      case 404:
        return 'Datanya sudah tidak ada — mungkin sudah dihapus dari perangkat lain.';
      case 409:
        return error.message || 'Data bentrok dengan yang sudah ada.';
      default:
        return error.message || fallback;
    }
  }

  // `fetch` melempar TypeError saat server tak terjangkau / jaringan mati.
  if (error instanceof TypeError) {
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    return offline
      ? 'Perangkat sedang offline. Periksa koneksi internetmu.'
      : 'Server tidak bisa dihubungi. Pastikan backend berjalan lalu coba lagi.';
  }

  return error instanceof Error && error.message ? error.message : fallback;
}

export function readAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

/** Simpan JWT hasil login. Dipanggil hanya oleh `AuthProvider`. */
export function writeAuthToken(token: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(AUTH_TOKEN_KEY, token);
  } catch {
    /* storage tidak tersedia — token hanya bertahan di memori proses ini */
  }
}

/** Hapus JWT (logout atau token kedaluwarsa). */
export function clearAuthToken(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {
    /* abaikan */
  }
}

/**
 * Penanganan token kedaluwarsa. Backend tidak punya endpoint `/auth/me`, jadi
 * satu-satunya cara tahu sebuah token sudah tidak sah adalah ketika API
 * membalas 401. `AuthProvider` mendaftarkan callback di sini supaya sesi
 * langsung dibersihkan dan pengguna diarahkan ke halaman masuk — tanpa itu,
 * layar akan menampilkan error berulang dengan sesi yang sudah mati.
 */
type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  onUnauthorized = handler;
}

/**
 * Pemanggil API backend: menempelkan base URL + token, lalu membongkar
 * amplop respons `{ data }` / `{ error }` yang dipakai seluruh endpoint.
 *
 * Melempar `ApiError` untuk respons non-2xx; kegagalan jaringan tetap
 * dilempar apa adanya supaya pemanggil bisa membedakan "server menolak" dari
 * "server tidak bisa dihubungi".
 */
export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = readAuthToken();

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });

  const isJson = response.headers
    .get('content-type')
    ?.includes('application/json');
  const body = isJson ? await response.json() : null;

  if (!response.ok) {
    // 401 hanya berarti "sesi mati" bila kita memang mengirim token. Login
    // dengan kata sandi salah juga membalas 401, dan itu tidak boleh memicu
    // pembersihan sesi (belum ada sesi yang perlu dibersihkan).
    if (response.status === 401 && token) {
      clearAuthToken();
      onUnauthorized?.();
    }

    const message =
      (body && typeof body.error === 'string' && body.error) ||
      `Permintaan gagal (${response.status})`;
    throw new ApiError(message, response.status);
  }

  return (body?.data ?? body) as T;
}
