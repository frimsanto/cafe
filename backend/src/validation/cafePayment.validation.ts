import { ApiError } from '../lib/ApiError';
import { MANUAL_METHODS, type ManualMethod } from '../lib/paymentMethods';

// Validasi body konfigurasi pembayaran kafe (PUT /api/cafe/payment-config).

export interface PaymentConfigInput {
  metodeDiterima: ManualMethod[];
  /** Kredensial rahasia — hanya dikirim saat diubah; kosong = jangan sentuh. */
  serverKey?: string;
  clientKey?: string;
  isProduction?: boolean;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw ApiError.badRequest('Body permintaan harus berupa objek JSON');
  }
  return value as Record<string, unknown>;
}

/**
 * Validasi konfigurasi pembayaran. `metodeDiterima` wajib berupa subset metode
 * manual yang dikenal (duplikat dibersihkan). Kredensial Midtrans opsional.
 */
export function parsePaymentConfigInput(body: unknown): PaymentConfigInput {
  const obj = asRecord(body);

  const rawMethods = obj.metodeDiterima;
  if (!Array.isArray(rawMethods)) {
    throw ApiError.badRequest('Field "metodeDiterima" harus berupa array');
  }
  const metodeDiterima: ManualMethod[] = [];
  for (const item of rawMethods) {
    if (typeof item !== 'string' || !(MANUAL_METHODS as readonly string[]).includes(item)) {
      throw ApiError.badRequest(
        `Metode "${String(item)}" tidak dikenal. Pilihan: ${MANUAL_METHODS.join(', ')}`,
      );
    }
    if (!metodeDiterima.includes(item as ManualMethod)) {
      metodeDiterima.push(item as ManualMethod);
    }
  }
  if (metodeDiterima.length === 0) {
    throw ApiError.badRequest('Pilih minimal satu metode pembayaran manual');
  }

  const result: PaymentConfigInput = { metodeDiterima };

  if (obj.serverKey !== undefined && obj.serverKey !== null) {
    if (typeof obj.serverKey !== 'string') {
      throw ApiError.badRequest('Field "serverKey" harus berupa teks');
    }
    const trimmed = obj.serverKey.trim();
    if (trimmed !== '') result.serverKey = trimmed;
  }

  if (obj.clientKey !== undefined && obj.clientKey !== null) {
    if (typeof obj.clientKey !== 'string') {
      throw ApiError.badRequest('Field "clientKey" harus berupa teks');
    }
    result.clientKey = obj.clientKey.trim();
  }

  if (obj.isProduction !== undefined) {
    if (typeof obj.isProduction !== 'boolean') {
      throw ApiError.badRequest('Field "isProduction" harus berupa boolean');
    }
    result.isProduction = obj.isProduction;
  }

  return result;
}
