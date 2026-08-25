import { ApiError } from '../lib/ApiError';

// Validasi body formulir pendaftaran publik (POST /api/public/daftar).
//
// Nama field-nya snake_case mengikuti kontrak formulir publik, berbeda dari
// endpoint internal lain yang camelCase — dipetakan ke properti camelCase di
// bawah ini supaya sisa backend tetap seragam.

const MAX_TEKS = 200;
const MAX_PESAN = 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Angka, spasi, tanda plus, strip, dan kurung — bentuk nomor telepon lazim. */
const NO_HP_RE = /^[0-9+\-() ]{8,20}$/;

export interface PendaftaranPublikInput {
  namaBisnis: string;
  namaPemilik: string;
  email: string;
  noHp: string;
  pesan: string | null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw ApiError.badRequest('Body permintaan harus berupa objek JSON');
  }
  return value as Record<string, unknown>;
}

function teksWajib(value: unknown, field: string, maks = MAX_TEKS): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw ApiError.badRequest(`Field "${field}" wajib diisi`);
  }
  const rapi = value.trim();
  if (rapi.length > maks) {
    throw ApiError.badRequest(`Field "${field}" terlalu panjang (maks ${maks})`);
  }
  return rapi;
}

/** Validasi body pendaftaran publik — TIDAK ada kata sandi di sini. */
export function parsePendaftaranPublikInput(body: unknown): PendaftaranPublikInput {
  const obj = asRecord(body);

  const namaBisnis = teksWajib(obj.nama_cafe, 'nama_cafe');
  const namaPemilik = teksWajib(obj.nama_pemilik, 'nama_pemilik');

  const email = teksWajib(obj.email, 'email').toLowerCase();
  if (!EMAIL_RE.test(email)) {
    throw ApiError.badRequest('Format email tidak valid');
  }

  // Spasi di dalam nomor dibuang supaya "0851 7339 1208" dan "085173391208"
  // tersimpan sebagai nomor yang sama — admin menghubunginya lewat WhatsApp.
  const noHp = teksWajib(obj.no_hp, 'no_hp').replace(/\s+/g, '');
  if (!NO_HP_RE.test(noHp)) {
    throw ApiError.badRequest('Format nomor HP tidak valid');
  }

  let pesan: string | null = null;
  if (obj.pesan !== undefined && obj.pesan !== null && obj.pesan !== '') {
    pesan = teksWajib(obj.pesan, 'pesan', MAX_PESAN);
  }

  return { namaBisnis, namaPemilik, email, noHp, pesan };
}
