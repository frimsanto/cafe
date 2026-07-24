import { ApiError } from '../lib/ApiError';

// Validasi & normalisasi body untuk fitur Manajemen Menu (item & kategori).

export interface CreateMenuItemInput {
  categoryId: string;
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  isAvailable: boolean;
}

/** Perubahan sebagian — hanya field yang dikirim yang ikut diperbarui. */
export type UpdateMenuItemInput = Partial<CreateMenuItemInput>;

export interface CategoryNameInput {
  name: string;
}

const MAX_NAME = 120;
const MAX_DESCRIPTION = 300;
const MAX_IMAGE_URL = 2048;
/** Batas aman terhadap kolom Decimal(12,2) di database. */
const MAX_PRICE = 9_999_999_999;

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw ApiError.badRequest('Body permintaan harus berupa objek JSON');
  }
  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw ApiError.badRequest(`Field "${field}" wajib diisi`);
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    throw ApiError.badRequest(`Field "${field}" maksimal ${max} karakter`);
  }
  return trimmed;
}

function optionalString(value: unknown, field: string, max: number): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') {
    throw ApiError.badRequest(`Field "${field}" harus berupa teks`);
  }
  return value.trim().slice(0, max);
}

/**
 * Harga dalam Rupiah. Diterima bilangan dengan maksimal 2 angka desimal supaya
 * cocok dengan kolom `Decimal(12,2)`; nol atau negatif ditolak karena item
 * gratis bukan kasus yang didukung menu.
 */
function parsePrice(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw ApiError.badRequest('Field "price" harus berupa angka');
  }
  if (value <= 0) {
    throw ApiError.badRequest('Field "price" harus lebih dari 0');
  }
  if (value > MAX_PRICE) {
    throw ApiError.badRequest('Field "price" terlalu besar');
  }
  if (Math.round(value * 100) !== value * 100) {
    throw ApiError.badRequest('Field "price" maksimal 2 angka desimal');
  }
  return value;
}

function parseBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw ApiError.badRequest(`Field "${field}" harus true atau false`);
  }
  return value;
}

/** Body untuk membuat item menu baru. */
export function parseCreateMenuItemInput(body: unknown): CreateMenuItemInput {
  const obj = asRecord(body);

  return {
    categoryId: nonEmptyString(obj.categoryId, 'categoryId', 64),
    name: nonEmptyString(obj.name, 'name', MAX_NAME),
    description: optionalString(obj.description, 'description', MAX_DESCRIPTION),
    price: parsePrice(obj.price),
    imageUrl: optionalString(obj.imageUrl, 'imageUrl', MAX_IMAGE_URL),
    isAvailable:
      obj.isAvailable === undefined
        ? true
        : parseBoolean(obj.isAvailable, 'isAvailable'),
  };
}

/**
 * Body untuk mengubah item menu. Semua field opsional, tetapi body kosong
 * ditolak supaya permintaan yang tidak melakukan apa pun tidak lolos diam-diam.
 */
export function parseUpdateMenuItemInput(body: unknown): UpdateMenuItemInput {
  const obj = asRecord(body);
  const input: UpdateMenuItemInput = {};

  if (obj.categoryId !== undefined) {
    input.categoryId = nonEmptyString(obj.categoryId, 'categoryId', 64);
  }
  if (obj.name !== undefined) {
    input.name = nonEmptyString(obj.name, 'name', MAX_NAME);
  }
  if (obj.description !== undefined) {
    input.description = optionalString(obj.description, 'description', MAX_DESCRIPTION);
  }
  if (obj.price !== undefined) {
    input.price = parsePrice(obj.price);
  }
  if (obj.imageUrl !== undefined) {
    input.imageUrl = optionalString(obj.imageUrl, 'imageUrl', MAX_IMAGE_URL);
  }
  if (obj.isAvailable !== undefined) {
    input.isAvailable = parseBoolean(obj.isAvailable, 'isAvailable');
  }

  if (Object.keys(input).length === 0) {
    throw ApiError.badRequest('Tidak ada field yang diubah');
  }

  return input;
}

/**
 * Body untuk menyembunyikan/menampilkan item. Nilainya wajib eksplisit (bukan
 * "toggle") supaya dua perangkat yang menekan tombol bersamaan tidak saling
 * membalikkan status.
 */
export function parseAvailabilityInput(body: unknown): { isAvailable: boolean } {
  const obj = asRecord(body);
  if (obj.isAvailable === undefined) {
    throw ApiError.badRequest('Field "isAvailable" wajib diisi');
  }
  return { isAvailable: parseBoolean(obj.isAvailable, 'isAvailable') };
}

/** Body untuk memindahkan item ke kategori lain. */
export function parseMoveItemInput(body: unknown): { categoryId: string } {
  const obj = asRecord(body);
  return { categoryId: nonEmptyString(obj.categoryId, 'categoryId', 64) };
}

const MAX_CATEGORIES = 200;

/**
 * Body pengurutan kategori: daftar id kategori dari urutan pertama ke terakhir.
 *
 * Klien mengirim urutan LENGKAP, bukan "pindahkan satu langkah" — dengan begitu
 * hasil akhirnya tidak bergantung pada urutan sampainya beberapa permintaan.
 */
export function parseCategoryOrderInput(body: unknown): { categoryIds: string[] } {
  const obj = asRecord(body);

  if (!Array.isArray(obj.categoryIds) || obj.categoryIds.length === 0) {
    throw ApiError.badRequest('Field "categoryIds" harus berisi minimal satu id');
  }
  if (obj.categoryIds.length > MAX_CATEGORIES) {
    throw ApiError.badRequest(`Terlalu banyak kategori (maksimal ${MAX_CATEGORIES})`);
  }

  const categoryIds = obj.categoryIds.map((value, index) =>
    nonEmptyString(value, `categoryIds[${index}]`, 64),
  );

  if (new Set(categoryIds).size !== categoryIds.length) {
    throw ApiError.badRequest('Ada id kategori yang kembar di "categoryIds"');
  }

  return { categoryIds };
}

/**
 * Body kategori (tambah & ubah nama). `orderPosition` sengaja tidak diterima
 * di sini: urutan hanya boleh diubah lewat endpoint pengurutan khusus supaya
 * posisinya tidak pernah bentrok/berlubang.
 */
export function parseCategoryNameInput(body: unknown): CategoryNameInput {
  const obj = asRecord(body);
  return { name: nonEmptyString(obj.name, 'name', MAX_NAME) };
}
