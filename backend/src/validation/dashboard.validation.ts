import { ApiError } from '../lib/ApiError';

const MAX_WIDGETS = 50;
const MAX_KEY_LENGTH = 64;

export type WidgetPreferences = Record<string, boolean>;

/**
 * Validasi body preferensi dasbor: peta `widget → tampil/sembunyi`.
 * Dibatasi jumlah & panjang kunci agar payload tidak disalahgunakan.
 */
export function parsePreferencesInput(body: unknown): WidgetPreferences {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw ApiError.badRequest('Body permintaan harus berupa objek JSON');
  }

  const widgets = (body as Record<string, unknown>).widgets;
  if (typeof widgets !== 'object' || widgets === null || Array.isArray(widgets)) {
    throw ApiError.badRequest('Field "widgets" harus berupa objek');
  }

  const entries = Object.entries(widgets as Record<string, unknown>);
  if (entries.length > MAX_WIDGETS) {
    throw ApiError.badRequest(`Terlalu banyak widget (maksimal ${MAX_WIDGETS})`);
  }

  const result: WidgetPreferences = {};
  for (const [key, value] of entries) {
    if (key.length === 0 || key.length > MAX_KEY_LENGTH) {
      throw ApiError.badRequest(
        `Nama widget tidak valid (maksimal ${MAX_KEY_LENGTH} karakter)`,
      );
    }
    if (typeof value !== 'boolean') {
      throw ApiError.badRequest(`Nilai widget "${key}" harus true atau false`);
    }
    result[key] = value;
  }

  return result;
}

/** Ubah kolom Json dari database menjadi peta boolean yang aman dipakai. */
export function toWidgetPreferences(value: unknown): WidgetPreferences {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const result: WidgetPreferences = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === 'boolean') result[key] = raw;
  }
  return result;
}
