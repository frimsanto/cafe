import { API_BASE_URL } from './apiConfig';
import { ApiError } from './apiClient';

/**
 * Klien HTTP untuk jalur terminal POS.
 *
 * Terpisah dari `apiClient` karena AUTENTIKASINYA BERBEDA, bukan karena
 * kerapian. `apiFetch` menempelkan `Authorization: Bearer <token>` dari
 * localStorage dan memperbarui token yang kedaluwarsa; jalur POS tidak punya
 * token untuk ditempelkan — identitasnya ada di cookie HttpOnly yang tidak
 * pernah bisa dibaca JavaScript.
 *
 * Konsekuensinya dua, dan keduanya harus benar:
 *
 *   1. `credentials: 'include'` WAJIB. Tanpa itu peramban tidak menyertakan
 *      cookie sama sekali pada permintaan lintas-origin (dev: 5173 → 4000),
 *      dan setiap panggilan berakhir 401 dengan gejala yang menyesatkan.
 *   2. TIDAK ADA percobaan memperbarui token saat 401. Sesi POS yang berakhir
 *      berarti petugasnya harus memasukkan PIN lagi — itu keputusan yang
 *      disengaja (lihat `lib/cookie.ts`), bukan kegagalan yang perlu
 *      disembunyikan dengan perpanjangan diam-diam.
 */

/** Keadaan yang membedakan "belum pasang terminal" dari "sesi habis". */
export type PosGagal = 'PERANGKAT' | 'SESI' | 'LAIN';

/** Galat jalur POS, membawa keadaan yang menentukan layar mana yang muncul. */
export class PosError extends ApiError {
  constructor(
    message: string,
    status: number,
    readonly keadaan: PosGagal,
  ) {
    super(message, status);
    this.name = 'PosError';
  }
}

/**
 * Tebak apa yang sebenarnya hilang dari sebuah 401.
 *
 * Backend memakai dua pesan berbeda — satu menyebut perangkat, satu menyebut
 * petugas — dan perbedaan itu menentukan layar mana yang harus muncul:
 * pemasangan terminal, atau layar pergantian petugas. Menyamakan keduanya akan
 * membuat kasir yang sesinya habis diminta memasang ulang terminal.
 */
function keadaanDari(status: number, pesan: string): PosGagal {
  if (status !== 401) return 'LAIN';
  return /perangkat|terdaftar|dicabut/i.test(pesan) ? 'PERANGKAT' : 'SESI';
}

interface OpsiPos extends Omit<RequestInit, 'body'> {
  /** Body JSON — dirakit di sini supaya header-nya tidak pernah lupa dipasang. */
  json?: unknown;
  /** Body multipart (unggah foto). Content-Type dibiarkan diisi peramban. */
  form?: FormData;
}

export async function posFetch<T>(path: string, opsi: OpsiPos = {}): Promise<T> {
  const { json, form, headers, ...sisa } = opsi;

  const h = new Headers(headers);
  if (json !== undefined) h.set('Content-Type', 'application/json');
  // `FormData` TIDAK boleh diberi Content-Type manual: peramban yang menyusun
  // boundary-nya, dan menimpanya membuat multipart-nya tidak bisa dibaca server.

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...sisa,
      headers: h,
      body: form ?? (json !== undefined ? JSON.stringify(json) : undefined),
      // Inilah yang membuat cookie perangkat & sesi ikut terkirim.
      credentials: 'include',
    });
  } catch {
    throw new PosError(
      'Tidak bisa menghubungi server. Periksa koneksi terminal ini.',
      0,
      'LAIN',
    );
  }

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const body = isJson ? await response.json() : null;

  if (!response.ok) {
    const pesan =
      (body && typeof body.error === 'string' && body.error) ||
      `Permintaan gagal (${response.status})`;
    throw new PosError(pesan, response.status, keadaanDari(response.status, pesan));
  }

  return (body?.data ?? body) as T;
}
