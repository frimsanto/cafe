import { ApiError } from '../lib/ApiError';
import { isJenisKas, type JenisKas } from '../lib/shiftStatus';

/** Validasi body absensi, shift kasir, pergerakan kas, dan penggantian. */

const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Batas atas nominal uang yang diterima dari klien.
 *
 * Bukan sekadar penjaga kewarasan: nilai raksasa yang lolos akan masuk ke
 * aritmetika BigInt dan keluar di laporan sebagai angka yang membuat seluruh
 * grafik omzet tidak terbaca — dan memperbaikinya menuntut koreksi manual pada
 * shift yang sudah ditutup.
 */
const MAKS_RUPIAH = 999_999_999;

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw ApiError.badRequest('Body permintaan harus berupa objek JSON');
  }
  return value as Record<string, unknown>;
}

function teksOpsional(value: unknown, field: string, maks = 500): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw ApiError.badRequest(`Field "${field}" harus berupa teks`);
  }
  const bersih = value.trim();
  return bersih === '' ? null : bersih.slice(0, maks);
}

function teksWajib(value: unknown, field: string, maks = 500): string {
  const teks = teksOpsional(value, field, maks);
  if (teks === null) throw ApiError.badRequest(`Field "${field}" wajib diisi`);
  return teks;
}

function uuidOpsional(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !POLA_UUID.test(value.trim())) {
    throw ApiError.badRequest(`Field "${field}" bukan id yang valid`);
  }
  return value.trim();
}

export function uuidWajib(value: unknown, field: string): string {
  const id = uuidOpsional(value, field);
  if (id === null) throw ApiError.badRequest(`Field "${field}" wajib diisi`);
  return id;
}

/**
 * Rupiah dari klien: WAJIB bilangan bulat.
 *
 * Pecahan ditolak, bukan dibulatkan — pembulatan diam-diam di perbatasan adalah
 * asal-usul selisih kas yang tidak bisa dijelaskan siapa pun keesokan harinya.
 * Aturan yang sama ditegakkan lagi di `lib/rupiah.ts`; yang di sini memberi
 * pesan yang menyebut nama fieldnya.
 */
export function rupiahWajib(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw ApiError.badRequest(`Field "${field}" harus berupa angka`);
  }
  if (!Number.isInteger(value)) {
    throw ApiError.badRequest(`Field "${field}" harus bilangan bulat rupiah (tanpa sen)`);
  }
  if (value < 0) throw ApiError.badRequest(`Field "${field}" tidak boleh negatif`);
  if (value > MAKS_RUPIAH) {
    throw ApiError.badRequest(`Field "${field}" terlalu besar`);
  }
  return value;
}

/**
 * Waktu yang DIKLAIM perangkat saat memotret.
 *
 * Dipakai hanya sebagai keterangan pada foto ("Diunggah terlambat"), TIDAK
 * PERNAH sebagai jam kerja — itu selalu waktu server. Nilai yang tidak masuk
 * akal karena itu tidak berbahaya, cukup diabaikan.
 */
export function waktuTangkapOpsional(value: unknown): Date | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const waktu = new Date(value);
  if (Number.isNaN(waktu.getTime())) return null;
  // Waktu tangkap di MASA DEPAN berarti jam perangkatnya salah — diabaikan
  // supaya tidak menghasilkan "diunggah terlambat" bernilai negatif.
  if (waktu.getTime() > Date.now() + 60_000) return null;
  return waktu;
}

// ── Absensi ──────────────────────────────────────────────────────────────────

export interface AbsenInput {
  diambilPada: Date | null;
  alasanPengecualian: string | null;
  catatan: string | null;
  correlationId: string | null;
}

/**
 * Body absen (multipart, di samping berkas foto).
 *
 * Nilainya datang sebagai teks karena FormData tidak punya tipe lain — itulah
 * sebabnya parsing di sini tidak boleh mengandalkan `typeof value === 'number'`.
 */
export function parseAbsen(body: unknown): AbsenInput {
  const obj = asRecord(body ?? {});
  return {
    diambilPada: waktuTangkapOpsional(obj.diambilPada),
    alasanPengecualian: teksOpsional(obj.alasanPengecualian, 'alasanPengecualian', 300),
    catatan: teksOpsional(obj.catatan, 'catatan'),
    correlationId: teksOpsional(obj.correlationId, 'correlationId', 60),
  };
}

// ── Shift kasir ──────────────────────────────────────────────────────────────

export interface BukaShiftBody {
  modalAwal: number;
  scheduleId: string | null;
  catatan: string | null;
}

export function parseBukaShift(body: unknown): BukaShiftBody {
  const obj = asRecord(body);
  return {
    modalAwal: rupiahWajib(obj.modalAwal, 'modalAwal'),
    scheduleId: uuidOpsional(obj.scheduleId, 'scheduleId'),
    catatan: teksOpsional(obj.catatan, 'catatan'),
  };
}

export interface TutupShiftBody {
  kasAktual: number;
  catatan: string | null;
}

export function parseTutupShift(body: unknown): TutupShiftBody {
  const obj = asRecord(body);
  return {
    kasAktual: rupiahWajib(obj.kasAktual, 'kasAktual'),
    catatan: teksOpsional(obj.catatan, 'catatan'),
  };
}

// ── Pergerakan kas ───────────────────────────────────────────────────────────

export interface KasBody {
  jenis: JenisKas;
  nominal: number;
  alasan: string;
}

export function parseKas(body: unknown): KasBody {
  const obj = asRecord(body);
  if (!isJenisKas(obj.jenis)) {
    throw ApiError.badRequest('Field "jenis" harus MASUK atau KELUAR');
  }
  const nominal = rupiahWajib(obj.nominal, 'nominal');
  if (nominal === 0) {
    throw ApiError.badRequest('Nominal harus lebih dari nol');
  }
  return {
    jenis: obj.jenis,
    nominal,
    // Alasan WAJIB: uang yang berpindah tanpa alasan tertulis tidak bisa
    // dipertanggungjawabkan besok.
    alasan: teksWajib(obj.alasan, 'alasan', 300),
  };
}

// ── Koreksi pemilik ──────────────────────────────────────────────────────────

export interface KoreksiShiftBody {
  kasAktual?: number;
  modalAwal?: number;
  alasan: string;
}

export function parseKoreksiShift(body: unknown): KoreksiShiftBody {
  const obj = asRecord(body);
  const hasil: KoreksiShiftBody = {
    // Koreksi TANPA alasan tidak pernah diterima — itulah satu-satunya yang
    // membedakan koreksi dari penyuntingan diam-diam.
    alasan: teksWajib(obj.alasan, 'alasan', 300),
  };
  if (obj.kasAktual !== undefined) hasil.kasAktual = rupiahWajib(obj.kasAktual, 'kasAktual');
  if (obj.modalAwal !== undefined) hasil.modalAwal = rupiahWajib(obj.modalAwal, 'modalAwal');

  if (hasil.kasAktual === undefined && hasil.modalAwal === undefined) {
    throw ApiError.badRequest('Tidak ada nilai yang dikoreksi');
  }
  return hasil;
}

// ── Penggantian ──────────────────────────────────────────────────────────────

export interface AjukanPenggantiBody {
  scheduleId: string;
  alasan: string;
}

export function parseAjukanPengganti(body: unknown): AjukanPenggantiBody {
  const obj = asRecord(body);
  return {
    scheduleId: uuidWajib(obj.scheduleId, 'scheduleId'),
    alasan: teksWajib(obj.alasan, 'alasan', 300),
  };
}

export interface PutusanPenggantiBody {
  setuju: boolean;
  alasan: string | null;
}

export function parsePutusanPengganti(body: unknown): PutusanPenggantiBody {
  const obj = asRecord(body);
  if (typeof obj.setuju !== 'boolean') {
    throw ApiError.badRequest('Field "setuju" harus berupa true/false');
  }
  const alasan = teksOpsional(obj.alasan, 'alasan', 300);
  if (!obj.setuju && alasan === null) {
    throw ApiError.badRequest('Penolakan wajib disertai alasan');
  }
  return { setuju: obj.setuju, alasan };
}
