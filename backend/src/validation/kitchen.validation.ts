import type { KitchenStatus } from '@prisma/client';
import { ApiError } from '../lib/ApiError';
import { isKitchenStatus, type KitchenStatusPesanan } from '../lib/orderStatus';

const KITCHEN_STATUSES: KitchenStatus[] = ['WAITING', 'COOKING', 'READY'];

export interface UpdateKitchenStatusInput {
  status: KitchenStatus;
}

/** Validasi body untuk memperbarui status masak sebuah item. */
export function parseUpdateKitchenStatusInput(body: unknown): UpdateKitchenStatusInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw ApiError.badRequest('Body permintaan harus berupa objek JSON');
  }
  const status = (body as Record<string, unknown>).status;
  if (typeof status !== 'string' || !KITCHEN_STATUSES.includes(status as KitchenStatus)) {
    throw ApiError.badRequest(
      `Field "status" harus salah satu dari: ${KITCHEN_STATUSES.join(', ')}`,
    );
  }
  return { status: status as KitchenStatus };
}

// ── Status tingkat PESANAN (tiket) ───────────────────────────────────────────

/**
 * Tahap tiket yang boleh diminta lewat API dapur.
 *
 * `NOT_SENT` dan `COMPLETED` sengaja TIDAK ada di sini: yang pertama hanya
 * ditulis sistem saat pesanan lahir, dan yang kedua milik kasir (endpoint
 * `.../cashier/orders/:id/selesai`). Membuka keduanya di sini berarti Layar
 * Dapur bisa menarik tiket keluar dari antrean atau menutup pesanan tanpa ada
 * yang memastikan makanannya sampai ke tamu.
 */
const TAHAP_DAPUR: KitchenStatusPesanan[] = ['QUEUED', 'PREPARING', 'READY'];

export interface UpdateOrderKitchenStatusInput {
  status: KitchenStatusPesanan;
}

export function parseUpdateOrderKitchenStatusInput(
  body: unknown,
): UpdateOrderKitchenStatusInput {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw ApiError.badRequest('Body permintaan harus berupa objek JSON');
  }
  const status = (body as Record<string, unknown>).status;
  if (!isKitchenStatus(status) || !TAHAP_DAPUR.includes(status)) {
    throw ApiError.badRequest(
      `Field "status" harus salah satu dari: ${TAHAP_DAPUR.join(', ')}`,
    );
  }
  return { status };
}
