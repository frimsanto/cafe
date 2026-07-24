import { ApiError } from '../lib/ApiError';

// Validasi & normalisasi body untuk fitur Manajemen Meja & QR.

const MAX_TABLE_NAME = 60;
const MIN_TABLE_NAME = 2;

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw ApiError.badRequest('Body permintaan harus berupa objek JSON');
  }
  return value as Record<string, unknown>;
}

/**
 * Nama meja, mis. "Meja 12" atau "Bar 1". Nama inilah yang muncul di layar
 * dapur, halaman kasir, dan struk — jadi tidak boleh kosong atau terlalu
 * pendek sampai kehilangan makna.
 */
export function parseTableNameInput(body: unknown): { tableName: string } {
  const obj = asRecord(body);
  const value = obj.tableName;

  if (typeof value !== 'string' || value.trim() === '') {
    throw ApiError.badRequest('Field "tableName" wajib diisi');
  }

  const tableName = value.trim();
  if (tableName.length < MIN_TABLE_NAME) {
    throw ApiError.badRequest(`Nama meja minimal ${MIN_TABLE_NAME} karakter`);
  }
  if (tableName.length > MAX_TABLE_NAME) {
    throw ApiError.badRequest(`Nama meja maksimal ${MAX_TABLE_NAME} karakter`);
  }

  return { tableName };
}
