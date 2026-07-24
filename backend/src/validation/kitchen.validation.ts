import type { KitchenStatus } from '@prisma/client';
import { ApiError } from '../lib/ApiError';

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
