import { ApiError } from '../lib/ApiError';
import { isManualMethod, MANUAL_METHODS, type ManualMethod } from '../lib/paymentMethods';
import {
  isFulfillmentType,
  isOrderSource,
  type FulfillmentType,
  type OrderSource,
} from '../lib/orderStatus';
import { isStatusPembayaran, type StatusPembayaran } from '../lib/paymentStatus';
import { parseItems, type CreateOrderItemInput } from './order.validation';

// Validasi body & query layar kasir (POS).
//
// SATU aturan yang menentukan bentuk berkas ini: TIDAK ADA HARGA yang diterima
// dari klien. Yang dikirim layar kasir hanyalah id menu, jumlah, dan berapa
// uang yang ia terima dari tamu; tagihannya dihitung ulang dari database.
// Karena itu tidak akan pernah ada field `totalAmount` atau `subtotal` di sini
// — kalau suatu saat muncul, itu bug, bukan fitur.

const MAX_NOMINAL = 9_999_999_999;
const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw ApiError.badRequest('Body permintaan harus berupa objek JSON');
  }
  return value as Record<string, unknown>;
}

function uuidOpsional(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !POLA_UUID.test(value.trim())) {
    throw ApiError.badRequest(`Field "${field}" bukan id yang valid`);
  }
  return value.trim();
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

// ── Pesanan baru dari layar kasir ────────────────────────────────────────────

export interface PembayaranKasirInput {
  metode: ManualMethod;
  /** Uang yang DITERIMA kasir. Untuk tunai bisa lebih besar dari tagihan. */
  nominal: number;
  catatanKasir: string | null;
  referensi: string | null;
}

export interface BuatPesananKasirInput {
  fulfillmentType: FulfillmentType;
  /** Wajib untuk DINE_IN, harus kosong untuk TAKEAWAY. */
  tableId: string | null;
  customerName: string | null;
  catatan: string | null;
  items: CreateOrderItemInput[];
  pembayaran: PembayaranKasirInput;
  /**
   * Kunci anti-kirim-ganda yang dibuat layar kasir sekali per keranjang.
   *
   * Diwajibkan, bukan opsional: tombol "Bayar & Kirim ke Dapur" ditekan dua
   * kali (atau jaringan lambat lalu kasir mengulang) adalah kejadian
   * sehari-hari, dan tanpa kunci ini akibatnya adalah dua tagihan untuk satu
   * tamu. Membuatnya opsional berarti klien yang lupa mengirimnya kehilangan
   * perlindungan itu tanpa ada yang menyadarinya.
   */
  idempotencyKey: string;
}

function parsePembayaran(value: unknown): PembayaranKasirInput {
  const obj = asRecord(value);

  if (!isManualMethod(obj.metode)) {
    throw ApiError.badRequest(
      `Field "pembayaran.metode" harus salah satu dari: ${MANUAL_METHODS.join(', ')}`,
    );
  }

  const nominal = obj.nominal;
  if (typeof nominal !== 'number' || !Number.isFinite(nominal) || nominal <= 0) {
    throw ApiError.badRequest('Field "pembayaran.nominal" harus angka lebih dari 0');
  }
  if (nominal > MAX_NOMINAL) {
    throw ApiError.badRequest('Field "pembayaran.nominal" terlalu besar');
  }
  if (Math.round(nominal * 100) !== nominal * 100) {
    throw ApiError.badRequest('Field "pembayaran.nominal" maksimal 2 angka desimal');
  }

  return {
    metode: obj.metode,
    nominal,
    catatanKasir: teksOpsional(obj.catatanKasir, 'pembayaran.catatanKasir', 500),
    referensi: teksOpsional(obj.referensi, 'pembayaran.referensi', 100),
  };
}

export function parseBuatPesananKasirInput(body: unknown): BuatPesananKasirInput {
  const obj = asRecord(body);

  const fulfillmentType = obj.fulfillmentType;
  if (!isFulfillmentType(fulfillmentType)) {
    throw ApiError.badRequest('Field "fulfillmentType" harus DINE_IN atau TAKEAWAY');
  }

  const tableId = uuidOpsional(obj.tableId, 'tableId');
  if (fulfillmentType === 'DINE_IN' && !tableId) {
    throw ApiError.badRequest('Pesanan makan di tempat wajib memilih meja');
  }

  const idempotencyKey = teksOpsional(obj.idempotencyKey, 'idempotencyKey', 120);
  if (!idempotencyKey || idempotencyKey.length < 8) {
    throw ApiError.badRequest('Field "idempotencyKey" wajib diisi (minimal 8 karakter)');
  }

  return {
    fulfillmentType,
    // Meja yang terlanjur ikut terkirim pada pesanan bawa pulang DIBUANG, bukan
    // ditolak: layar kasir yang berpindah dari "makan di tempat" ke "bawa
    // pulang" tidak boleh gagal hanya karena pilihan lamanya masih tertinggal
    // di state. Yang penting mejanya tidak ikut tercatat.
    tableId: fulfillmentType === 'DINE_IN' ? tableId : null,
    customerName: teksOpsional(obj.customerName, 'customerName', 120),
    catatan: teksOpsional(obj.catatan, 'catatan', 500),
    items: parseItems(obj.items),
    pembayaran: parsePembayaran(obj.pembayaran),
    idempotencyKey,
  };
}

// ── Pembatalan ───────────────────────────────────────────────────────────────

export interface BatalPesananInput {
  alasan: string;
}

/**
 * Alasan WAJIB, minimal 3 karakter — sama seperti penolakan pembayaran.
 * Pembatalan tanpa alasan tidak bisa dijelaskan besok ketika ada yang bertanya
 * kenapa satu meja hilang dari laporan.
 */
export function parseBatalPesananInput(body: unknown): BatalPesananInput {
  const alasan = teksOpsional(asRecord(body).alasan, 'alasan', 500);
  if (!alasan || alasan.length < 3) {
    throw ApiError.badRequest('Alasan pembatalan wajib diisi (minimal 3 karakter)');
  }
  return { alasan };
}

// ── Penyaring daftar pesanan ─────────────────────────────────────────────────

/** Tab pada layar kasir. Nilainya ikut menjadi nama parameter query `tab`. */
export const TAB_KASIR = [
  'PERLU_KONFIRMASI',
  'SUDAH_DIBAYAR',
  'SEDANG_DIPROSES',
  'SELESAI',
  'SEMUA',
] as const;

export type TabKasir = (typeof TAB_KASIR)[number];

export interface FilterPesananKasir {
  tab: TabKasir;
  /** Kode pesanan, nomor antrian, nama meja, atau nama pelanggan. */
  q: string | null;
  fulfillmentType: FulfillmentType | null;
  orderSource: OrderSource | null;
  statusPembayaran: StatusPembayaran | null;
  limit: number;
}

const LIMIT_DEFAULT = 100;
const LIMIT_MAKS = 200;

export function parseFilterPesananKasir(query: unknown): FilterPesananKasir {
  const q = (query ?? {}) as Record<string, unknown>;

  const tabMentah = typeof q.tab === 'string' ? q.tab.toUpperCase() : 'PERLU_KONFIRMASI';
  if (!(TAB_KASIR as readonly string[]).includes(tabMentah)) {
    throw ApiError.badRequest(`Parameter "tab" tidak dikenal: ${String(q.tab)}`);
  }

  if (q.fulfillmentType !== undefined && !isFulfillmentType(q.fulfillmentType)) {
    throw ApiError.badRequest('Parameter "fulfillmentType" harus DINE_IN atau TAKEAWAY');
  }
  if (q.orderSource !== undefined && !isOrderSource(q.orderSource)) {
    throw ApiError.badRequest('Parameter "orderSource" harus TABLE_QR atau CASHIER');
  }
  if (q.statusPembayaran !== undefined && !isStatusPembayaran(q.statusPembayaran)) {
    throw ApiError.badRequest('Parameter "statusPembayaran" tidak dikenal');
  }

  let limit = LIMIT_DEFAULT;
  if (q.limit !== undefined) {
    const angka = Number(q.limit);
    if (!Number.isFinite(angka) || angka < 1) {
      throw ApiError.badRequest('Parameter "limit" harus angka positif');
    }
    limit = Math.min(Math.trunc(angka), LIMIT_MAKS);
  }

  return {
    tab: tabMentah as TabKasir,
    q: teksOpsional(q.q, 'q', 120),
    fulfillmentType: isFulfillmentType(q.fulfillmentType) ? q.fulfillmentType : null,
    orderSource: isOrderSource(q.orderSource) ? q.orderSource : null,
    statusPembayaran: isStatusPembayaran(q.statusPembayaran) ? q.statusPembayaran : null,
    limit,
  };
}
