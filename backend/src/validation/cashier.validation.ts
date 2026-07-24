import { ApiError } from '../lib/ApiError';
import type { PaymentMethod } from '@prisma/client';

// Validasi body konfirmasi pembayaran di kasir.

/** Metode yang sah untuk pembayaran DI KASIR (bukan pembayaran di meja). */
export const CASHIER_METHODS = ['CASH', 'EDC'] as const;
export type CashierMethod = (typeof CASHIER_METHODS)[number];

export interface ConfirmPaymentInput {
  method: CashierMethod;
  /** Uang tunai yang diterima kasir; hanya relevan untuk metode CASH. */
  cashReceived: number | null;
}

const MAX_CASH = 9_999_999_999;

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw ApiError.badRequest('Body permintaan harus berupa objek JSON');
  }
  return value as Record<string, unknown>;
}

/**
 * Body konfirmasi pembayaran kasir.
 *
 * Metode online (QRIS/GOPAY/CARD) sengaja ditolak di sini: pembayaran itu
 * dikonfirmasi gateway lewat webhook, bukan diketik manual oleh kasir.
 */
export function parseConfirmPaymentInput(body: unknown): ConfirmPaymentInput {
  const obj = asRecord(body);

  const method = obj.method;
  if (
    typeof method !== 'string' ||
    !CASHIER_METHODS.includes(method as CashierMethod)
  ) {
    throw ApiError.badRequest(
      `Field "method" harus salah satu dari: ${CASHIER_METHODS.join(', ')}`,
    );
  }

  let cashReceived: number | null = null;
  if (obj.cashReceived !== undefined && obj.cashReceived !== null) {
    if (method !== 'CASH') {
      throw ApiError.badRequest('"cashReceived" hanya berlaku untuk metode CASH');
    }
    const value = obj.cashReceived;
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      throw ApiError.badRequest('Field "cashReceived" harus angka lebih dari 0');
    }
    if (value > MAX_CASH) {
      throw ApiError.badRequest('Field "cashReceived" terlalu besar');
    }
    if (Math.round(value * 100) !== value * 100) {
      throw ApiError.badRequest('Field "cashReceived" maksimal 2 angka desimal');
    }
    cashReceived = value;
  }

  return { method: method as CashierMethod & PaymentMethod, cashReceived };
}
