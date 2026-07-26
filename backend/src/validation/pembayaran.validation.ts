import { ApiError } from '../lib/ApiError';
import { MANUAL_METHODS, isManualMethod, type ManualMethod } from '../lib/paymentMethods';

// Validasi body untuk jalur pembayaran baru (/api/pembayaran/*).

const MAX_NOMINAL = 9_999_999_999;

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw ApiError.badRequest('Body permintaan harus berupa objek JSON');
  }
  return value as Record<string, unknown>;
}

function requireOrderId(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw ApiError.badRequest('Field "orderId" wajib diisi');
  }
  return value.trim();
}

export interface ManualPaymentInput {
  orderId: string;
  metode: ManualMethod;
  nominal: number;
  catatanKasir: string | null;
}

/** Body konfirmasi pembayaran manual oleh kasir. */
export function parseManualPaymentInput(body: unknown): ManualPaymentInput {
  const obj = asRecord(body);

  const orderId = requireOrderId(obj.orderId);

  if (!isManualMethod(obj.metode)) {
    throw ApiError.badRequest(
      `Field "metode" harus salah satu dari: ${MANUAL_METHODS.join(', ')}`,
    );
  }

  const nominal = obj.nominal;
  if (typeof nominal !== 'number' || !Number.isFinite(nominal) || nominal <= 0) {
    throw ApiError.badRequest('Field "nominal" harus angka lebih dari 0');
  }
  if (nominal > MAX_NOMINAL) {
    throw ApiError.badRequest('Field "nominal" terlalu besar');
  }
  if (Math.round(nominal * 100) !== nominal * 100) {
    throw ApiError.badRequest('Field "nominal" maksimal 2 angka desimal');
  }

  let catatanKasir: string | null = null;
  if (obj.catatanKasir !== undefined && obj.catatanKasir !== null) {
    if (typeof obj.catatanKasir !== 'string') {
      throw ApiError.badRequest('Field "catatanKasir" harus berupa teks');
    }
    const trimmed = obj.catatanKasir.trim();
    catatanKasir = trimmed === '' ? null : trimmed.slice(0, 500);
  }

  return { orderId, metode: obj.metode, nominal, catatanKasir };
}

/** Body untuk membuat transaksi Midtrans. */
export function parseMidtransBuatInput(body: unknown): { orderId: string } {
  const obj = asRecord(body);
  return { orderId: requireOrderId(obj.orderId) };
}
