import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

// Klien DOKU Checkout — jalur pembayaran GLOBAL milik platform.
//
// Berbeda dari Midtrans yang kredensialnya per kafe (tersimpan terenkripsi di
// database), DOKU memakai SATU kredensial milik platform yang dibaca dari
// environment. Konsekuensinya: tidak ada konfigurasi DOKU di dasbor pemilik —
// jalur ini hidup/mati untuk semua kafe sekaligus lewat `.env`.
//
// Semua permintaan ke DOKU ditandatangani HMAC-SHA256 sesuai spesifikasi resmi
// (https://developers.doku.com). String yang ditandatangani menyertakan digest
// SHA-256 dari body mentah, jadi body yang dikirim HARUS byte-identik dengan
// body yang dipakai menghitung digest — lihat `kirimJson` di bawah.

/** Batas waktu memanggil DOKU; jangan menggantung request pelanggan. */
const TIMEOUT_MS = 15_000;

/** Path Create Payment pada Checkout API — juga dipakai sebagai Request-Target. */
const PATH_CHECKOUT = '/checkout/v1/payment';

/** Masa berlaku tagihan DOKU dalam menit. */
const PAYMENT_DUE_MINUTES = 60;

interface KonfigurasiDoku {
  clientId: string;
  secretKey: string;
  isProduction: boolean;
  callbackUrl: string;
}

/**
 * Baca kredensial dari environment. Sengaja dibaca ulang tiap panggilan (bukan
 * konstanta modul) agar nilai yang dipakai selalu yang terpasang di proses saat
 * ini — memudahkan mengaktifkan DOKU tanpa menyusun ulang urutan impor.
 */
function bacaKonfigurasi(): KonfigurasiDoku {
  return {
    clientId: process.env.DOKU_CLIENT_ID?.trim() ?? '',
    secretKey: process.env.DOKU_SECRET_KEY?.trim() ?? '',
    isProduction: process.env.DOKU_IS_PRODUCTION?.trim().toLowerCase() === 'true',
    callbackUrl: process.env.DOKU_CALLBACK_URL?.trim() ?? '',
  };
}

/**
 * True bila kredensial DOKU lengkap. Ini satu-satunya informasi DOKU yang boleh
 * sampai ke frontend — Secret Key tidak pernah keluar dari proses ini.
 */
export function isDokuEnabled(): boolean {
  const konfigurasi = bacaKonfigurasi();
  return konfigurasi.clientId !== '' && konfigurasi.secretKey !== '';
}

/** Base URL sesuai mode (sandbox/production). */
function baseUrl(isProduction: boolean): string {
  return isProduction ? 'https://api.doku.com' : 'https://api-sandbox.doku.com';
}

/** Timestamp ISO 8601 tanpa milidetik — format yang diminta DOKU. */
function timestampDoku(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Digest DOKU: SHA-256 dari body mentah, dikodekan Base64. */
function digestBody(rawBody: string): string {
  return createHash('sha256').update(rawBody, 'utf8').digest('base64');
}

/**
 * Susun string yang ditandatangani. Urutan & pemisah `\n` sudah baku dari DOKU —
 * salah satu karakter meleset, signature ditolak.
 */
function stringToSign(params: {
  clientId: string;
  requestId: string;
  timestamp: string;
  requestTarget: string;
  digest: string;
}): string {
  return [
    `Client-Id:${params.clientId}`,
    `Request-Id:${params.requestId}`,
    `Request-Timestamp:${params.timestamp}`,
    `Request-Target:${params.requestTarget}`,
    `Digest:${params.digest}`,
  ].join('\n');
}

/** Tanda tangan mentah (Base64, tanpa awalan algoritma). */
function hitungSignature(payload: string, secretKey: string): string {
  return createHmac('sha256', secretKey).update(payload, 'utf8').digest('base64');
}

/**
 * Verifikasi signature notifikasi (webhook) DOKU.
 *
 * `rawBody` WAJIB body mentah apa adanya — bukan hasil `JSON.stringify` dari
 * objek yang sudah diparse, karena beda spasi/urutan kunci mengubah digest dan
 * membuat notifikasi sah ikut tertolak.
 *
 * Ini gerbang keamanan uang: tanpa verifikasi, siapa pun yang tahu URL webhook
 * bisa menyatakan pesanan orang lain LUNAS.
 */
export function verifikasiSignatureDoku(params: {
  headers: Record<string, string | string[] | undefined>;
  rawBody: string;
  requestTarget: string;
}): boolean {
  const { clientId, secretKey } = bacaKonfigurasi();
  if (!clientId || !secretKey) return false;

  const ambil = (nama: string): string => {
    const nilai = params.headers[nama.toLowerCase()];
    if (Array.isArray(nilai)) return nilai[0] ?? '';
    return typeof nilai === 'string' ? nilai : '';
  };

  const requestId = ambil('Request-Id');
  const timestamp = ambil('Request-Timestamp');
  // DOKU mengirim "HMAC-SHA256={base64}"; sebagian kanal mengirim base64 polos.
  const diterima = ambil('Signature').replace(/^HMAC-SHA256=/, '').trim();
  if (!requestId || !timestamp || !diterima) return false;

  const harapan = hitungSignature(
    stringToSign({
      clientId,
      requestId,
      timestamp,
      requestTarget: params.requestTarget,
      digest: digestBody(params.rawBody),
    }),
    secretKey,
  );

  // Bandingkan dalam waktu tetap agar tidak bocor lewat selisih waktu eksekusi.
  const a = Buffer.from(harapan);
  const b = Buffer.from(diterima);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Kirim permintaan JSON bertanda tangan ke DOKU. Body diserialisasi SEKALI lalu
 * dipakai untuk digest sekaligus dikirim — tidak boleh ada dua serialisasi
 * berbeda, karena digest-nya harus persis atas byte yang diterima DOKU.
 */
async function kirimJson(
  path: string,
  body: unknown,
  konfigurasi: KonfigurasiDoku,
): Promise<Record<string, unknown>> {
  const rawBody = JSON.stringify(body);
  const requestId = randomUUID();
  const timestamp = timestampDoku();

  const signature = hitungSignature(
    stringToSign({
      clientId: konfigurasi.clientId,
      requestId,
      timestamp,
      requestTarget: path,
      digest: digestBody(rawBody),
    }),
    konfigurasi.secretKey,
  );

  let response: Response;
  try {
    response = await fetch(`${baseUrl(konfigurasi.isProduction)}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Client-Id': konfigurasi.clientId,
        'Request-Id': requestId,
        'Request-Timestamp': timestamp,
        Signature: `HMAC-SHA256=${signature}`,
      },
      body: rawBody,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const pesan = err instanceof Error ? err.message : 'jaringan bermasalah';
    throw new Error(`tidak dapat menghubungi DOKU (${pesan})`);
  }

  const teks = await response.text();
  let data: Record<string, unknown> = {};
  if (teks.trim() !== '') {
    try {
      data = JSON.parse(teks) as Record<string, unknown>;
    } catch {
      throw new Error(`respons DOKU bukan JSON (HTTP ${response.status})`);
    }
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} — ${pesanGalat(data) ?? teks.slice(0, 200)}`);
  }
  return data;
}

/** Ambil pesan galat dari berbagai bentuk respons DOKU (dan `message` array-nya). */
function pesanGalat(data: Record<string, unknown>): string | null {
  const message = data.message ?? (data.error as Record<string, unknown> | undefined)?.message;
  if (typeof message === 'string') return message;
  if (Array.isArray(message)) return message.map(String).join(', ');

  const response = data.response as Record<string, unknown> | undefined;
  if (response && typeof response.message === 'string') return response.message;
  if (response && Array.isArray(response.message)) return response.message.map(String).join(', ');
  return null;
}

/**
 * Cari URL halaman pembayaran di dalam respons. DOKU menaruhnya di tempat yang
 * berbeda antar versi Checkout (`payment_url` di akar, atau `response.payment.url`),
 * jadi semua bentuk yang dikenal dicoba daripada mengikat diri ke satu saja.
 */
function ambilPaymentUrl(data: Record<string, unknown>): string | null {
  const response = data.response as Record<string, unknown> | undefined;
  const payment = (response?.payment ?? data.payment) as Record<string, unknown> | undefined;

  const kandidat = [data.payment_url, response?.payment_url, payment?.url, payment?.payment_url];
  for (const nilai of kandidat) {
    if (typeof nilai === 'string' && nilai.trim() !== '') return nilai.trim();
  }
  return null;
}

export interface DokuCheckoutParams {
  orderId: string;
  cafeId: string;
  grossAmount: number;
  items: Array<{ name: string; price: number; quantity: number }>;
}

export interface DokuCheckoutResult {
  paymentUrl: string;
  invoiceNumber: string;
}

/**
 * Buat halaman pembayaran DOKU Checkout untuk sebuah pesanan.
 *
 * `invoice_number` adalah kunci pencocokan kami saat notifikasi datang, jadi
 * bentuknya dibuat unik per percobaan bayar (berakhiran timestamp) — sama seperti
 * `midtransOrderId` pada jalur Midtrans.
 */
export async function buatDokuCheckout(
  params: DokuCheckoutParams,
): Promise<DokuCheckoutResult> {
  const konfigurasi = bacaKonfigurasi();
  if (!konfigurasi.clientId || !konfigurasi.secretKey) {
    throw new Error('DOKU belum dikonfigurasi (DOKU_CLIENT_ID / DOKU_SECRET_KEY kosong)');
  }

  const invoiceNumber = `CAFEOS-${params.cafeId.slice(0, 8)}-${params.orderId.slice(0, 8)}-${Date.now()}`;

  const body = {
    order: {
      invoice_number: invoiceNumber,
      amount: params.grossAmount,
      currency: 'IDR',
      line_items: params.items.map((item) => ({
        name: item.name.slice(0, 50),
        price: item.price,
        quantity: item.quantity,
      })),
      // Ke mana pelanggan dikembalikan setelah membayar. Dikosongkan bila belum
      // disetel — DOKU akan memakai pengaturan dasbor.
      ...(konfigurasi.callbackUrl ? { callback_url: konfigurasi.callbackUrl } : {}),
      auto_redirect: true,
    },
    payment: {
      payment_due_date: PAYMENT_DUE_MINUTES,
    },
    customer: {
      id: params.orderId,
      name: 'Pelanggan',
      email: 'customer@cafeos.id',
    },
  };

  const data = await kirimJson(PATH_CHECKOUT, body, konfigurasi);

  const paymentUrl = ambilPaymentUrl(data);
  if (!paymentUrl) {
    throw new Error(pesanGalat(data) ?? 'respons DOKU tidak memuat payment_url');
  }

  return { paymentUrl, invoiceNumber };
}
