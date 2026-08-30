import { ApiError } from '../lib/ApiError';
import { parseJam } from '../lib/waktuKafe';

/** Validasi body jadwal kerja: template shift & penugasan staf. */

const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const POLA_TANGGAL = /^\d{4}-\d{2}-\d{2}$/;

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw ApiError.badRequest('Body permintaan harus berupa objek JSON');
  }
  return value as Record<string, unknown>;
}

function teksWajib(value: unknown, field: string, maks = 200): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw ApiError.badRequest(`Field "${field}" wajib diisi`);
  }
  return value.trim().slice(0, maks);
}

function teksOpsional(value: unknown, field: string, maks = 500): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw ApiError.badRequest(`Field "${field}" harus berupa teks`);
  }
  const bersih = value.trim();
  return bersih === '' ? null : bersih.slice(0, maks);
}

export function uuidWajib(value: unknown, field: string): string {
  const teks = teksWajib(value, field, 60);
  if (!POLA_UUID.test(teks)) {
    throw ApiError.badRequest(`Field "${field}" bukan id yang valid`);
  }
  return teks;
}

function uuidOpsional(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  return uuidWajib(value, field);
}

/**
 * Tanggal `YYYY-MM-DD`.
 *
 * Diperiksa bukan cuma polanya melainkan juga keabsahannya: `2026-02-31` cocok
 * dengan pola tapi bukan tanggal, dan `Date` akan diam-diam menggesernya ke
 * 3 Maret — jadwal yang tersimpan di hari yang tidak pernah diminta siapa pun.
 */
export function tanggalWajib(value: unknown, field: string): string {
  const teks = teksWajib(value, field, 10);
  if (!POLA_TANGGAL.test(teks)) {
    throw ApiError.badRequest(`Field "${field}" harus berformat YYYY-MM-DD`);
  }
  const [y, m, d] = teks.split('-').map(Number);
  const uji = new Date(Date.UTC(y, m - 1, d));
  if (
    uji.getUTCFullYear() !== y ||
    uji.getUTCMonth() !== m - 1 ||
    uji.getUTCDate() !== d
  ) {
    throw ApiError.badRequest(`Field "${field}" bukan tanggal yang ada`);
  }
  return teks;
}

/** Jam `HH:MM` → menit sejak tengah malam. */
function jamWajib(value: unknown, field: string): number {
  const teks = teksWajib(value, field, 5);
  const menit = parseJam(teks);
  if (menit === null) {
    throw ApiError.badRequest(`Field "${field}" harus berformat HH:MM (00:00-23:59)`);
  }
  return menit;
}

// ── Template shift ───────────────────────────────────────────────────────────

export interface TemplateShiftInput {
  nama: string;
  menitMulai: number;
  menitSelesai: number;
  lewatTengahMalam: boolean;
  toleransiTerlambatMenit: number;
  hariBerlaku: number[];
  aktif: boolean;
  urutan: number;
  catatan: string | null;
}

export function parseTemplateShift(body: unknown): TemplateShiftInput {
  const obj = asRecord(body);

  const menitMulai = jamWajib(obj.jamMulai, 'jamMulai');
  const menitSelesai = jamWajib(obj.jamSelesai, 'jamSelesai');

  /**
   * `lewatTengahMalam` DITURUNKAN, tidak dipercaya dari klien — kecuali untuk
   * satu kasus yang tidak bisa diturunkan.
   *
   * Bila jam selesai lebih kecil dari jam mulai (22:00 → 06:00), shift itu
   * PASTI melewati tengah malam; nilai `false` dari klien di situ hanya akan
   * menghasilkan shift berdurasi negatif. Bila keduanya SAMA (08:00 → 08:00),
   * barulah klien yang menentukan: itu bisa berarti shift 24 jam, bisa juga
   * berarti kesalahan pengetikan — dan hanya manusia yang tahu bedanya.
   */
  const lewatTengahMalam =
    menitSelesai < menitMulai ? true : menitSelesai === menitMulai
      ? obj.lewatTengahMalam === true
      : false;

  if (menitSelesai === menitMulai && !lewatTengahMalam) {
    throw ApiError.badRequest(
      'Jam mulai dan selesai sama. Tandai "melewati tengah malam" bila shiftnya 24 jam.',
    );
  }

  const toleransi = obj.toleransiTerlambatMenit;
  if (
    toleransi !== undefined &&
    (typeof toleransi !== 'number' || !Number.isInteger(toleransi) || toleransi < 0 || toleransi > 240)
  ) {
    throw ApiError.badRequest('Toleransi keterlambatan harus 0-240 menit');
  }

  return {
    nama: teksWajib(obj.nama, 'nama', 60),
    menitMulai,
    menitSelesai,
    lewatTengahMalam,
    toleransiTerlambatMenit: (toleransi as number | undefined) ?? 10,
    hariBerlaku: bacaHariBerlaku(obj.hariBerlaku),
    aktif: obj.aktif === undefined ? true : obj.aktif === true,
    urutan: typeof obj.urutan === 'number' && Number.isInteger(obj.urutan) ? obj.urutan : 0,
    catatan: teksOpsional(obj.catatan, 'catatan'),
  };
}

/** Hari berlaku sebagai ISO 1-7. Daftar kosong = berlaku setiap hari. */
function bacaHariBerlaku(value: unknown): number[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    throw ApiError.badRequest('Field "hariBerlaku" harus berupa daftar angka 1-7');
  }
  const hasil = new Set<number>();
  for (const item of value) {
    if (typeof item !== 'number' || !Number.isInteger(item) || item < 1 || item > 7) {
      throw ApiError.badRequest('Hari berlaku harus angka 1-7 (1 = Senin, 7 = Minggu)');
    }
    hasil.add(item);
  }
  // Diurutkan supaya perbandingan "berubah atau tidak" di sisi klien stabil.
  return [...hasil].sort((a, b) => a - b);
}

// ── Penugasan ────────────────────────────────────────────────────────────────

export interface JadwalBaruInput {
  templateId: string;
  userId: string;
  tanggal: string;
  deviceId: string | null;
  catatan: string | null;
}

export function parseJadwalBaru(body: unknown): JadwalBaruInput {
  const obj = asRecord(body);
  return {
    templateId: uuidWajib(obj.templateId, 'templateId'),
    userId: uuidWajib(obj.userId, 'userId'),
    tanggal: tanggalWajib(obj.tanggal, 'tanggal'),
    deviceId: uuidOpsional(obj.deviceId, 'deviceId'),
    catatan: teksOpsional(obj.catatan, 'catatan'),
  };
}

/** Rentang tanggal untuk kalender jadwal. */
export function parseRentangTanggal(query: Record<string, unknown>): {
  dari: string;
  sampai: string;
  userId?: string;
} {
  const dari = tanggalWajib(query.dari, 'dari');
  const sampai = tanggalWajib(query.sampai, 'sampai');
  if (sampai < dari) {
    throw ApiError.badRequest('Tanggal "sampai" mendahului "dari"');
  }
  // Rentang yang terlalu lebar akan menarik ribuan baris untuk digambar di satu
  // kalender — dibatasi di sini, bukan dibiarkan menjadi permintaan yang lambat.
  const hari =
    (new Date(`${sampai}T00:00:00Z`).getTime() -
      new Date(`${dari}T00:00:00Z`).getTime()) /
    86_400_000;
  if (hari > 92) {
    throw ApiError.badRequest('Rentang tanggal maksimal 92 hari');
  }

  const userId = query.userId === undefined ? undefined : uuidWajib(query.userId, 'userId');
  return { dari, sampai, ...(userId ? { userId } : {}) };
}
