import { ApiError } from '../lib/ApiError';

export interface CreateOrderItemInput {
  menuItemId: string;
  quantity: number;
  notes: string;
}

export interface CreateOrderInput {
  tableId: string;
  items: CreateOrderItemInput[];
}

/** Body untuk menambah item ke pesanan yang sudah ada — tanpa `tableId`:
    mejanya sudah melekat pada pesanan itu dan tidak boleh berpindah. */
export interface AddOrderItemsInput {
  items: CreateOrderItemInput[];
}

const MAX_QTY = 99;
const MAX_LINES = 100;
const MAX_NOTES = 500;

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw ApiError.badRequest('Body permintaan harus berupa objek JSON');
  }
  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw ApiError.badRequest(`Field "${field}" wajib diisi`);
  }
  return value.trim();
}

/**
 * Validasi & normalisasi daftar item — aturan yang sama persis dipakai saat
 * membuat pesanan baru MAUPUN saat menambah item ke pesanan yang sudah ada.
 *
 * Sengaja satu fungsi: kalau batas jumlah/catatan hanya diperketat di salah
 * satu jalur, jalur yang lain menjadi pintu belakang untuk data yang ditolak
 * di pintu depan. Layar kasir (POS) memakainya lewat
 * `cashier.validation.ts` — keranjang yang disusun kasir tunduk pada batas
 * yang sama persis dengan keranjang yang disusun tamu.
 */
export function parseItems(value: unknown): CreateOrderItemInput[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw ApiError.badRequest('Pesanan harus memuat minimal satu item');
  }
  if (value.length > MAX_LINES) {
    throw ApiError.badRequest(`Terlalu banyak item (maksimal ${MAX_LINES})`);
  }

  return value.map((raw, index): CreateOrderItemInput => {
    const item = asRecord(raw);
    const menuItemId = nonEmptyString(item.menuItemId, `items[${index}].menuItemId`);

    const quantity = item.quantity;
    if (
      typeof quantity !== 'number' ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > MAX_QTY
    ) {
      throw ApiError.badRequest(
        `items[${index}].quantity harus bilangan bulat 1–${MAX_QTY}`,
      );
    }

    let notes = '';
    if (item.notes !== undefined && item.notes !== null) {
      if (typeof item.notes !== 'string') {
        throw ApiError.badRequest(`items[${index}].notes harus berupa teks`);
      }
      notes = item.notes.trim().slice(0, MAX_NOTES);
    }

    return { menuItemId, quantity, notes };
  });
}

/** Validasi & normalisasi body untuk membuat pesanan baru. */
export function parseCreateOrderInput(body: unknown): CreateOrderInput {
  const obj = asRecord(body);
  return {
    tableId: nonEmptyString(obj.tableId, 'tableId'),
    items: parseItems(obj.items),
  };
}

/** Validasi & normalisasi body untuk menambah item ke pesanan yang ada. */
export function parseAddOrderItemsInput(body: unknown): AddOrderItemsInput {
  return { items: parseItems(asRecord(body).items) };
}
