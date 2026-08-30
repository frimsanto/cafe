import { ApiError } from '../lib/ApiError';
import { MANUAL_METHODS, isManualMethod, type ManualMethod } from '../lib/paymentMethods';

// Validasi body untuk jalur pembayaran (/api/pembayaran/*).

const MAX_NOMINAL = 9_999_999_999;
/** Panjang UUID v4 dalam bentuk berteks. */
const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw ApiError.badRequest('Body permintaan harus berupa objek JSON');
  }
  return value as Record<string, unknown>;
}

/**
 * `orderId` selalu id pesanan CafeOS, jadi bentuknya wajib UUID.
 *
 * Memeriksanya di sini, bukan menyerahkannya ke Prisma, membuat kiriman ngawur
 * dijawab 400 berbahasa Indonesia alih-alih 500 dari galat query — dan
 * menghentikannya sebelum menyentuh database sama sekali.
 *
 * Diekspor karena `orderId` tidak selalu datang dari body: sebagian endpoint
 * publik menerimanya sebagai parameter URL, dan di sanalah pemeriksaan ini
 * dulu terlewat.
 */
export function requireOrderId(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw ApiError.badRequest('Field "orderId" wajib diisi');
  }
  const bersih = value.trim();
  if (!POLA_UUID.test(bersih)) {
    throw ApiError.badRequest('Field "orderId" bukan id pesanan yang valid');
  }
  return bersih;
}

/** Teks opsional yang di-trim & dipotong; string kosong menjadi null. */
function teksOpsional(value: unknown, field: string, maks: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') {
    throw ApiError.badRequest(`Field "${field}" harus berupa teks`);
  }
  const bersih = value.trim();
  return bersih === '' ? null : bersih.slice(0, maks);
}

function requireMetode(value: unknown): ManualMethod {
  if (!isManualMethod(value)) {
    throw ApiError.badRequest(
      `Field "metode" harus salah satu dari: ${MANUAL_METHODS.join(', ')}`,
    );
  }
  return value;
}

// ── Konfirmasi kasir ─────────────────────────────────────────────────────────

export interface ManualPaymentInput {
  orderId: string;
  metode: ManualMethod;
  nominal: number;
  catatanKasir: string | null;
  /** Nomor referensi/approval (transfer, EDC). */
  referensi: string | null;
}

/** Body konfirmasi pembayaran manual oleh kasir. */
export function parseManualPaymentInput(body: unknown): ManualPaymentInput {
  const obj = asRecord(body);

  const orderId = requireOrderId(obj.orderId);
  const metode = requireMetode(obj.metode);

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

  return {
    orderId,
    metode,
    nominal,
    catatanKasir: teksOpsional(obj.catatanKasir, 'catatanKasir', 500),
    referensi: teksOpsional(obj.referensi, 'referensi', 100),
  };
}

// ── Pengajuan pembayaran manual oleh pelanggan ───────────────────────────────

export interface PermintaanManualInput {
  orderId: string;
  metode: ManualMethod;
  referensi: string | null;
  buktiUrl: string | null;
  buktiPublicId: string | null;
}

/**
 * Body pengajuan pembayaran manual dari checkout pelanggan.
 *
 * TIDAK ada `nominal` di sini, dan itu disengaja: yang menentukan berapa yang
 * harus dibayar adalah tagihan di server, bukan angka yang dikirim HP tamu.
 *
 * `buktiUrl` hanya diterima bila berupa URL https hasil unggahan CafeOS —
 * menerima URL bebas akan mengubah kolom ini menjadi tempat menitipkan tautan
 * ke mana saja, yang kemudian dibuka kasir dengan sekali klik.
 */
export function parsePermintaanManualInput(body: unknown): PermintaanManualInput {
  const obj = asRecord(body);

  const buktiUrl = teksOpsional(obj.buktiUrl, 'buktiUrl', 500);
  if (buktiUrl && !/^https:\/\/res\.cloudinary\.com\//i.test(buktiUrl)) {
    throw ApiError.badRequest('Bukti pembayaran harus berupa unggahan dari CafeOS.');
  }

  return {
    orderId: requireOrderId(obj.orderId),
    metode: requireMetode(obj.metode),
    referensi: teksOpsional(obj.referensi, 'referensi', 100),
    buktiUrl,
    buktiPublicId: teksOpsional(obj.buktiPublicId, 'buktiPublicId', 300),
  };
}

// ── Penolakan oleh kasir ─────────────────────────────────────────────────────

export interface TolakPembayaranInput {
  orderId: string;
  alasan: string;
}

/**
 * Body penolakan pembayaran manual.
 *
 * Alasan WAJIB dan minimal 3 karakter. Penolakan tanpa alasan adalah penolakan
 * yang tidak bisa dipertanggungjawabkan besok — dan tamu yang pesanannya
 * ditolak berhak membaca kenapa.
 */
export function parseTolakPembayaranInput(body: unknown): TolakPembayaranInput {
  const obj = asRecord(body);
  const alasan = teksOpsional(obj.alasan, 'alasan', 500);
  if (!alasan || alasan.length < 3) {
    throw ApiError.badRequest('Alasan penolakan wajib diisi (minimal 3 karakter)');
  }
  return { orderId: requireOrderId(obj.orderId), alasan };
}

// ── Gateway ──────────────────────────────────────────────────────────────────

/** Body untuk membuat transaksi Midtrans. */
export function parseMidtransBuatInput(body: unknown): { orderId: string } {
  const obj = asRecord(body);
  return { orderId: requireOrderId(obj.orderId) };
}

/** Body untuk membuat pembayaran DOKU Checkout. */
export function parseDokuBuatInput(body: unknown): { orderId: string } {
  const obj = asRecord(body);
  return { orderId: requireOrderId(obj.orderId) };
}
