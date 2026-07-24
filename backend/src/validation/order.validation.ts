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

/** Validasi & normalisasi body untuk membuat pesanan baru. */
export function parseCreateOrderInput(body: unknown): CreateOrderInput {
  const obj = asRecord(body);
  const tableId = nonEmptyString(obj.tableId, 'tableId');

  if (!Array.isArray(obj.items) || obj.items.length === 0) {
    throw ApiError.badRequest('Pesanan harus memuat minimal satu item');
  }
  if (obj.items.length > MAX_LINES) {
    throw ApiError.badRequest(`Terlalu banyak item (maksimal ${MAX_LINES})`);
  }

  const items = obj.items.map((raw, index): CreateOrderItemInput => {
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

  return { tableId, items };
}
