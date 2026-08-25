import type { AuthUser } from '../types/auth';
import { API_BASE_URL } from './apiConfig';

/**
 * Kunci penyimpanan sesi.
 *
 * Sesi terdiri dari dua token: token akses berumur pendek (~15 menit) yang
 * ditempelkan ke setiap permintaan, dan refresh token berumur panjang (~7 hari)
 * yang hanya dikirim ke `POST /api/auth/refresh` untuk menukar token akses
 * baru. Keduanya di localStorage, sama seperti sebelumnya — httpOnly cookie
 * lebih tahan XSS tapi butuh cookie lintas-origin (frontend :5173, backend
 * :4000) yang mengharuskan `SameSite=None; Secure`, dan itu tidak jalan di
 * `http://localhost` saat pengembangan.
 */
export const AUTH_TOKEN_KEY = 'cafeos-auth-token';
export const REFRESH_TOKEN_KEY = 'cafeos-refresh-token';

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

export function readRefreshToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(REFRESH_TOKEN_KEY);
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

/** Simpan pasangan token hasil login/pendaftaran. */
export function writeAuthSession(token: string, refreshToken: string): void {
  writeAuthToken(token);
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  } catch {
    /* abaikan */
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

/** Hapus seluruh sesi — token akses DAN refresh token. */
export function clearAuthSession(): void {
  clearAuthToken();
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  } catch {
    /* abaikan */
  }
}

/**
 * Penanganan sesi mati. Backend tidak punya endpoint `/auth/me`, jadi
 * satu-satunya cara tahu sebuah sesi sudah tidak sah adalah ketika API
 * membalas 401 dan perpanjangan token pun ditolak. `AuthProvider` mendaftarkan
 * callback di sini supaya sesi langsung dibersihkan dan pengguna diarahkan ke
 * halaman masuk — tanpa itu, layar akan menampilkan error berulang dengan sesi
 * yang sudah mati.
 */
type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  onUnauthorized = handler;
}

/**
 * Dipanggil setiap kali sesi berhasil diperpanjang, membawa profil terbaru dari
 * server. Peran pengguna bisa berubah selagi ia bekerja; `AuthProvider` memakai
 * ini untuk menyegarkan profil yang tersimpan agar penjaga rute memutuskan
 * berdasarkan peran yang sekarang, bukan peran saat login.
 */
type SessionRefreshedHandler = (user: AuthUser) => void;
let onSessionRefreshed: SessionRefreshedHandler | null = null;

export function setSessionRefreshedHandler(
  handler: SessionRefreshedHandler | null,
): void {
  onSessionRefreshed = handler;
}

/** Bersihkan sesi lalu beri tahu `AuthProvider` untuk mengalihkan ke `/login`. */
function endSession(): void {
  clearAuthSession();
  onUnauthorized?.();
}

/**
 * Hasil upaya perpanjangan sesi:
 * - `refreshed` — token akses baru sudah tersimpan, permintaan bisa diulang.
 * - `expired`   — server menolak refresh token; sesi memang harus diakhiri.
 * - `unavailable` — gagal menghubungi server. Sesi TIDAK dihapus: koneksi yang
 *   putus sesaat tidak boleh menendang pengguna keluar dari aplikasi.
 */
type RefreshOutcome = 'refreshed' | 'expired' | 'unavailable';

let pendingRefresh: Promise<RefreshOutcome> | null = null;

/**
 * Tukar refresh token dengan token akses baru.
 *
 * Sengaja memakai `fetch` mentah, bukan `apiFetch`: permintaan ini justru yang
 * menangani 401, jadi melewatkannya lewat `apiFetch` akan memicu rekursi tak
 * berujung saat refresh token ikut kedaluwarsa.
 */
async function requestTokenRefresh(): Promise<RefreshOutcome> {
  const refreshToken = readRefreshToken();
  // Sesi lama (sebelum fitur ini ada) hanya punya token akses — tidak ada yang
  // bisa diperpanjang, jadi perlakukan sebagai kedaluwarsa.
  if (!refreshToken) return 'expired';

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
  } catch {
    return 'unavailable';
  }

  // 5xx berarti backend sedang bermasalah, bukan sesinya yang tidak sah.
  if (response.status >= 500) return 'unavailable';
  if (!response.ok) return 'expired';

  try {
    const body = await response.json();
    const token = body?.data?.token;
    if (typeof token !== 'string' || token === '') return 'expired';

    writeAuthToken(token);
    if (body?.data?.user) onSessionRefreshed?.(body.data.user as AuthUser);
    return 'refreshed';
  } catch {
    return 'expired';
  }
}

/**
 * Perpanjang sesi, maksimal satu permintaan yang berjalan pada satu waktu.
 *
 * Satu layar bisa menembakkan banyak permintaan sekaligus (dasbor memuat
 * beberapa widget), dan tanpa penguncian ini semuanya akan memanggil
 * `/auth/refresh` bersamaan begitu token kedaluwarsa.
 */
function refreshSession(): Promise<RefreshOutcome> {
  pendingRefresh ??= requestTokenRefresh().finally(() => {
    pendingRefresh = null;
  });
  return pendingRefresh;
}

/** Endpoint autentikasi tidak boleh memicu perpanjangan sesi (lihat di bawah). */
function isAuthEndpoint(path: string): boolean {
  return path.startsWith('/api/auth/');
}

function buildRequest(path: string, init: RequestInit, token: string | null) {
  // Unggah berkas dikirim sebagai FormData. Content-Type-nya HARUS disusun
  // browser sendiri karena memuat `boundary` acak yang memisahkan tiap bagian —
  // memaksanya jadi `application/json` membuat server gagal mengurai berkasnya.
  const isFormData =
    typeof FormData !== 'undefined' && init.body instanceof FormData;

  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
}

/**
 * Kirim permintaan ber-autentikasi, dengan pemulihan otomatis saat token akses
 * kedaluwarsa: 401 → perpanjang sesi → ulangi permintaan yang gagal SEKALI.
 *
 * Semua pemanggilan API bertoken melewati fungsi ini, jadi tidak ada layar yang
 * perlu tahu-menahu soal masa berlaku token.
 */
async function requestWithAuth(
  path: string,
  init: RequestInit,
): Promise<Response> {
  const token = readAuthToken();
  const response = await buildRequest(path, init, token);

  // 401 hanya berarti "sesi mati" bila kita memang mengirim token. Login dengan
  // kata sandi salah juga membalas 401, dan itu tidak boleh memicu pembersihan
  // sesi (belum ada sesi yang perlu dibersihkan).
  if (response.status !== 401 || !token || isAuthEndpoint(path)) {
    return response;
  }

  const outcome = await refreshSession();
  if (outcome === 'expired') {
    endSession();
    return response;
  }
  if (outcome === 'unavailable') {
    return response;
  }

  // Token sudah diperbarui — ulangi dengan token yang baru.
  const retried = await buildRequest(path, init, readAuthToken());

  // Masih 401 dengan token segar: penolakannya bukan soal masa berlaku
  // (mis. pengguna sudah dinonaktifkan), jadi sesi memang harus berakhir.
  if (retried.status === 401) endSession();
  return retried;
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
  const response = await requestWithAuth(path, init);

  const isJson = response.headers
    .get('content-type')
    ?.includes('application/json');
  const body = isJson ? await response.json() : null;

  if (!response.ok) {
    const message =
      (body && typeof body.error === 'string' && body.error) ||
      `Permintaan gagal (${response.status})`;
    throw new ApiError(message, response.status);
  }

  return (body?.data ?? body) as T;
}

/**
 * Ambil berkas biner (QR meja, struk PDF) dari endpoint terlindungi.
 *
 * Berkas semacam ini tidak bisa dipasang lewat `<img src>` atau tautan biasa
 * karena butuh header Authorization. Diambil lewat jalur yang sama dengan
 * `apiFetch` supaya ikut mendapat perpanjangan token otomatis — sebelumnya
 * pemanggilnya memakai `fetch` mentah, sehingga token kedaluwarsa di sini
 * hanya memunculkan pesan gagal tanpa memulihkan sesi.
 */
export async function apiFetchBlob(
  path: string,
  fallbackMessage: string,
): Promise<Blob> {
  const response = await requestWithAuth(path, {});
  if (!response.ok) {
    throw new ApiError(fallbackMessage, response.status);
  }
  return response.blob();
}
