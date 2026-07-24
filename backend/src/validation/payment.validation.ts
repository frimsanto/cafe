import type { PaymentMethod, PaymentStatus } from '@prisma/client';
import { ApiError } from '../lib/ApiError';

// Metode pembayaran di meja (online). CASH/EDC menyusul pada fase kasir.
const AT_TABLE_METHODS: PaymentMethod[] = ['QRIS', 'GOPAY', 'CARD'];
const WEBHOOK_STATUSES: PaymentStatus[] = ['SUCCESS', 'FAILED', 'PENDING'];

export interface PayInput {
  method: PaymentMethod;
}

export interface WebhookInput {
  orderId: string;
  status: PaymentStatus;
  transactionId?: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw ApiError.badRequest('Body permintaan harus berupa objek JSON');
  }
  return value as Record<string, unknown>;
}

/** Validasi body untuk memulai pembayaran di meja. */
export function parsePayInput(body: unknown): PayInput {
  const obj = asRecord(body);
  const method = obj.method;
  if (typeof method !== 'string' || !AT_TABLE_METHODS.includes(method as PaymentMethod)) {
    throw ApiError.badRequest(
      `Metode pembayaran harus salah satu dari: ${AT_TABLE_METHODS.join(', ')}`,
    );
  }
  return { method: method as PaymentMethod };
}

/**
 * Validasi payload callback gateway (bentuk ternormalisasi).
 *
 * NOTE: format asli InterActive QRIS akan berbeda — pemetaan status + verifikasi
 * signature dilakukan saat gateway benar-benar diintegrasikan.
 */
export function parseWebhookInput(body: unknown): WebhookInput {
  const obj = asRecord(body);

  const orderId = obj.orderId;
  if (typeof orderId !== 'string' || orderId.trim() === '') {
    throw ApiError.badRequest('Field "orderId" wajib diisi');
  }

  const status = obj.status;
  if (typeof status !== 'string' || !WEBHOOK_STATUSES.includes(status as PaymentStatus)) {
    throw ApiError.badRequest(
      `Field "status" harus salah satu dari: ${WEBHOOK_STATUSES.join(', ')}`,
    );
  }

  const transactionId =
    typeof obj.transactionId === 'string' ? obj.transactionId : undefined;

  return { orderId: orderId.trim(), status: status as PaymentStatus, transactionId };
}
