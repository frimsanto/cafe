import type { MidtransMode } from '@prisma/client';
import { ApiError } from '../lib/ApiError';
import {
  BOLEH_DI_CHECKOUT,
  MANUAL_METHODS,
  isManualMethod,
  type ManualMethod,
} from '../lib/paymentMethods';

// Validasi body endpoint pengaturan pembayaran (/api/cafe/payment-settings/*).
//
// Mengikuti pola validasi manual yang sudah dipakai project ini (lihat
// `order.validation.ts`, `pembayaran.validation.ts`): fungsi `parse*` yang
// melempar `ApiError` 400 berbahasa Indonesia, tanpa dependensi baru.
//
// ATURAN YANG BERLAKU DI SELURUH BERKAS INI:
//   * Field yang tidak dikenal DIABAIKAN, tidak diteruskan ke Prisma — tidak
//     ada jalan bagi klien untuk menitipkan kolom yang tidak kami pilih.
//   * Teks selalu di-trim dan dipotong panjangnya; string kosong menjadi null.
//   * Semua yang ada di sini DIULANG di service untuk aturan yang menyangkut
//     uang (kanal checkout, kelengkapan konfigurasi) — validasi bentuk dan
//     aturan domain adalah dua lapis yang berbeda.

const MAKS_TEKS = 200;
const MAKS_INSTRUKSI = 1000;
/** Batas waktu pembayaran transfer: 5 menit s.d. 7 hari. */
const MIN_BATAS_MENIT = 5;
const MAKS_BATAS_MENIT = 60 * 24 * 7;

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw ApiError.badRequest('Body permintaan harus berupa objek JSON');
  }
  return value as Record<string, unknown>;
}

function bacaBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw ApiError.badRequest(`Field "${field}" harus berupa true/false`);
  }
  return value;
}

function bacaBooleanOpsional(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  return bacaBoolean(value, field);
}

/**
 * Teks opsional: `undefined` = jangan sentuh, `null`/`''` = kosongkan,
 * selain itu di-trim & dipotong.
 */
function bacaTeksOpsional(
  value: unknown,
  field: string,
  maks = MAKS_TEKS,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') {
    throw ApiError.badRequest(`Field "${field}" harus berupa teks`);
  }
  const bersih = value.trim();
  return bersih === '' ? null : bersih.slice(0, maks);
}

// ── Metode aktif (tombol Simpan Perubahan) ───────────────────────────────────

export interface MetodeAktifItem {
  metode: ManualMethod;
  aktif: boolean;
  tersediaDiKasir: boolean;
  tersediaDiCheckout: boolean;
  wajibVerifikasiKasir: boolean;
}

export interface MetodeAktifInput {
  metode: MetodeAktifItem[];
}

/**
 * Body PUT /payment-settings/metode.
 *
 * Menuntut KEEMPAT metode dikirim sekaligus, bukan hanya yang berubah: halaman
 * pengaturan menyimpan seluruh papan sakelar dalam satu tekan, dan menerima
 * kiriman sebagian membuat "tidak dikirim" ambigu antara "tidak berubah" dan
 * "dimatikan".
 */
export function parseMetodeAktifInput(body: unknown): MetodeAktifInput {
  const obj = asRecord(body);
  const daftar = obj.metode;
  if (!Array.isArray(daftar)) {
    throw ApiError.badRequest('Field "metode" harus berupa array');
  }

  const hasil: MetodeAktifItem[] = [];
  const terlihat = new Set<string>();

  for (const mentah of daftar) {
    const item = asRecord(mentah);
    if (!isManualMethod(item.metode)) {
      throw ApiError.badRequest(
        `Metode "${String(item.metode)}" tidak dikenal. Pilihan: ${MANUAL_METHODS.join(', ')}`,
      );
    }
    if (terlihat.has(item.metode)) {
      throw ApiError.badRequest(`Metode "${item.metode}" dikirim lebih dari sekali`);
    }
    terlihat.add(item.metode);

    const tersediaDiCheckout = bacaBoolean(item.tersediaDiCheckout, 'tersediaDiCheckout');
    if (tersediaDiCheckout && !BOLEH_DI_CHECKOUT[item.metode]) {
      throw ApiError.badRequest(
        `Metode "${item.metode}" hanya bisa dipakai di kasir, tidak di checkout pelanggan.`,
      );
    }

    hasil.push({
      metode: item.metode,
      aktif: bacaBoolean(item.aktif, 'aktif'),
      tersediaDiKasir: bacaBoolean(item.tersediaDiKasir, 'tersediaDiKasir'),
      tersediaDiCheckout,
      wajibVerifikasiKasir: bacaBoolean(item.wajibVerifikasiKasir, 'wajibVerifikasiKasir'),
    });
  }

  const kurang = MANUAL_METHODS.filter((m) => !terlihat.has(m));
  if (kurang.length > 0) {
    throw ApiError.badRequest(`Metode berikut belum dikirim: ${kurang.join(', ')}`);
  }

  return { metode: hasil };
}

// ── Konfigurasi rinci satu metode ────────────────────────────────────────────

export interface KonfigurasiMetodeInput {
  tersediaDiKasir?: boolean;
  tersediaDiCheckout?: boolean;
  wajibVerifikasiKasir?: boolean;
  instruksi?: string | null;
  batasWaktuMenit?: number | null;
  qrisImageUrl?: string | null;
  qrisImagePublicId?: string | null;
  qrisMerchantName?: string | null;
  qrisNmid?: string | null;
  bankNama?: string | null;
  bankNomorRekening?: string | null;
  bankAtasNama?: string | null;
  edcProvider?: string | null;
  edcTerminalLabel?: string | null;
}

/** Ambil kode metode dari URL dan pastikan ia dikenal. */
export function parseKodeMetode(nilai: string): ManualMethod {
  if (!isManualMethod(nilai)) {
    throw ApiError.badRequest(
      `Metode "${nilai}" tidak dikenal. Pilihan: ${MANUAL_METHODS.join(', ')}`,
    );
  }
  return nilai;
}

/**
 * Body PUT /payment-settings/metode/:metode.
 *
 * Field dibatasi per metode: mengirim nomor rekening pada konfigurasi EDC
 * ditolak, bukan diabaikan diam-diam. Salah kirim seperti itu selalu berarti
 * ada yang keliru di sisi pemanggil, dan lebih baik ketahuan sekarang.
 */
export function parseKonfigurasiMetodeInput(
  metode: ManualMethod,
  body: unknown,
): KonfigurasiMetodeInput {
  const obj = asRecord(body);

  const hasil: KonfigurasiMetodeInput = {
    tersediaDiKasir: bacaBooleanOpsional(obj.tersediaDiKasir, 'tersediaDiKasir'),
    tersediaDiCheckout: bacaBooleanOpsional(obj.tersediaDiCheckout, 'tersediaDiCheckout'),
    wajibVerifikasiKasir: bacaBooleanOpsional(
      obj.wajibVerifikasiKasir,
      'wajibVerifikasiKasir',
    ),
    instruksi: bacaTeksOpsional(obj.instruksi, 'instruksi', MAKS_INSTRUKSI),
  };

  if (hasil.tersediaDiCheckout && !BOLEH_DI_CHECKOUT[metode]) {
    throw ApiError.badRequest(
      `Metode "${metode}" hanya bisa dipakai di kasir, tidak di checkout pelanggan.`,
    );
  }
  // Menawarkan metode ini ke tamu berarti uangnya belum ada di tangan siapa
  // pun saat tombol ditekan. Mematikan verifikasi kasir untuk metode semacam
  // itu sama dengan menyatakan pesanan lunas tanpa ada yang menerima uangnya.
  if (hasil.tersediaDiCheckout && hasil.wajibVerifikasiKasir === false) {
    throw ApiError.badRequest(
      'Metode yang tampil di checkout pelanggan wajib diverifikasi kasir.',
    );
  }

  if (metode === 'QRIS_STATIS') {
    hasil.qrisImageUrl = bacaTeksOpsional(obj.qrisImageUrl, 'qrisImageUrl', 500);
    hasil.qrisImagePublicId = bacaTeksOpsional(obj.qrisImagePublicId, 'qrisImagePublicId', 300);
    hasil.qrisMerchantName = bacaTeksOpsional(obj.qrisMerchantName, 'qrisMerchantName');
    hasil.qrisNmid = bacaTeksOpsional(obj.qrisNmid, 'qrisNmid', 50);

    if (hasil.qrisImageUrl && !/^https:\/\//i.test(hasil.qrisImageUrl)) {
      throw ApiError.badRequest('Gambar QRIS harus berupa URL https dari unggahan CafeOS.');
    }
  }

  if (metode === 'TRANSFER') {
    hasil.bankNama = bacaTeksOpsional(obj.bankNama, 'bankNama', 100);
    hasil.bankNomorRekening = bacaTeksOpsional(obj.bankNomorRekening, 'bankNomorRekening', 50);
    hasil.bankAtasNama = bacaTeksOpsional(obj.bankAtasNama, 'bankAtasNama', 150);

    if (hasil.bankNomorRekening && !/^[0-9][0-9\s-]{4,49}$/.test(hasil.bankNomorRekening)) {
      throw ApiError.badRequest(
        'Nomor rekening hanya boleh berisi angka, spasi, atau tanda hubung (minimal 5 karakter).',
      );
    }

    if (obj.batasWaktuMenit !== undefined) {
      if (obj.batasWaktuMenit === null) {
        hasil.batasWaktuMenit = null;
      } else {
        const menit = obj.batasWaktuMenit;
        if (typeof menit !== 'number' || !Number.isInteger(menit)) {
          throw ApiError.badRequest('Field "batasWaktuMenit" harus berupa bilangan bulat');
        }
        if (menit < MIN_BATAS_MENIT || menit > MAKS_BATAS_MENIT) {
          throw ApiError.badRequest(
            `Batas waktu pembayaran harus antara ${MIN_BATAS_MENIT} menit dan 7 hari.`,
          );
        }
        hasil.batasWaktuMenit = menit;
      }
    }
  }

  if (metode === 'EDC') {
    hasil.edcProvider = bacaTeksOpsional(obj.edcProvider, 'edcProvider', 100);
    hasil.edcTerminalLabel = bacaTeksOpsional(obj.edcTerminalLabel, 'edcTerminalLabel', 100);
  }

  return hasil;
}

// ── Midtrans ─────────────────────────────────────────────────────────────────

export interface KredensialMidtransInput {
  clientKey?: string | null;
  /** Hanya dikirim saat diganti — tidak ada nilai lama untuk dibandingkan. */
  serverKey?: string;
  /**
   * Kejanggalan yang PATUT DIBERITAHUKAN tapi tidak menggagalkan penyimpanan
   * (mis. awalan `SB-` di slot Production). Bukan penilaian, cuma catatan.
   *
   * Opsional: `parseKredensialInput` selalu mengisinya, tapi pemanggil lain
   * (uji, skrip) tidak perlu memikirkan field yang cuma keterangan.
   */
  peringatan?: string[];
}

/** Ambil mode dari URL/body dan pastikan ia salah satu dari dua yang ada. */
export function parseMode(nilai: unknown): MidtransMode {
  if (nilai === 'SANDBOX' || nilai === 'PRODUCTION') return nilai;
  throw ApiError.badRequest('Mode harus "SANDBOX" atau "PRODUCTION"');
}

/** Panjang kunci Midtrans yang masuk akal — cuma penjaga bentuk, bukan aturan. */
const MIN_PANJANG_KUNCI = 8;
const MAKS_PANJANG_KUNCI = 200;

/**
 * Periksa bentuk sebuah kunci TANPA menyimpulkan environment-nya.
 *
 * Yang ditolak hanya hal-hal yang tidak mungkin menjadi kunci apa pun: kosong,
 * mengandung spasi/baris baru di tengah (tanda dua kunci tersalin sekaligus,
 * atau kolomnya kemasukan kalimat), atau panjangnya di luar akal. Isi kuncinya
 * sendiri TIDAK PERNAH diubah — hanya whitespace di ujung yang dipangkas.
 */
function bacaKunci(nilai: string, label: string): string {
  const bersih = nilai.trim();
  if (bersih === '') {
    throw ApiError.badRequest(`${label} wajib diisi.`);
  }
  if (/\s/.test(bersih)) {
    throw ApiError.badRequest(
      `${label} tidak boleh mengandung spasi atau baris baru. Tempel satu kunci saja, apa adanya.`,
    );
  }
  if (bersih.length < MIN_PANJANG_KUNCI || bersih.length > MAKS_PANJANG_KUNCI) {
    throw ApiError.badRequest(
      `${label} panjangnya tidak wajar untuk kunci Midtrans. Salin ulang dari dasbor Midtrans.`,
    );
  }
  return bersih;
}

/** Nama mode untuk kalimat berbahasa Indonesia. */
function namaMode(mode: MidtransMode): string {
  return mode === 'PRODUCTION' ? 'Production' : 'Sandbox';
}

/**
 * Awalan kunci yang tampak bertentangan dengan slotnya — SEBAGAI PERINGATAN.
 *
 * Dulu ini adalah penolakan 400, dan itu keliru: akun Midtrans Sandbox tidak
 * selalu menerbitkan kunci berawalan `SB-`. Banyak akun mendapat
 * `Mid-client-…`/`Mid-server-…` polos dari tab Sandbox dasbor Midtrans, dan
 * menolaknya berarti menutup pintu bagi kunci yang sepenuhnya sah.
 *
 * Awalan bukan lagi sumber kebenaran. Yang menentukan environment adalah SLOT
 * yang dipilih pemilik, dan yang membuktikan kuncinya benar adalah jawaban
 * endpoint Midtrans untuk environment itu (lihat `tesKoneksiMidtrans`).
 */
function peringatanAwalan(
  kunci: string,
  mode: MidtransMode,
  label: string,
): string | null {
  const berawalanSB = kunci.startsWith('SB-');
  if (berawalanSB && mode === 'PRODUCTION') {
    return `${label} berawalan "SB-", yang biasanya menandai kunci Sandbox — sedangkan ini slot Production. Kalau memang itu kunci Production dari dasbor Midtrans, abaikan catatan ini; tes koneksi yang akan memastikannya.`;
  }
  if (!berawalanSB && mode === 'SANDBOX') {
    return `${label} tidak berawalan "SB-". Itu WAJAR untuk sebagian akun Sandbox Midtrans dan bukan masalah — tes koneksi ke endpoint Sandbox yang akan memastikannya.`;
  }
  return null;
}

/**
 * Body PUT /payment-settings/midtrans/:mode.
 *
 * ATURAN BENTUK, BUKAN ATURAN ENVIRONMENT. Yang diperiksa di sini hanya bahwa
 * kunci ada, tidak kosong, dan bentuknya masuk akal. Sandbox atau Production
 * ditentukan oleh `mode` (slot yang dipilih pemilik), lalu DIBUKTIKAN dengan
 * memanggil endpoint Midtrans untuk mode itu — bukan dengan menebak dari awalan
 * teks kunci.
 */
export function parseKredensialInput(
  mode: MidtransMode,
  body: unknown,
): KredensialMidtransInput {
  const obj = asRecord(body);
  const peringatan: string[] = [];
  const hasil: KredensialMidtransInput = { peringatan };

  if (obj.clientKey !== undefined) {
    if (obj.clientKey === null) {
      throw ApiError.badRequest(
        `Client Key ${namaMode(mode)} wajib diisi. Untuk mengosongkan kredensial, putuskan integrasinya.`,
      );
    }
    if (typeof obj.clientKey !== 'string') {
      throw ApiError.badRequest('Field "clientKey" harus berupa teks');
    }
    const clientKey = bacaKunci(obj.clientKey, `Client Key ${namaMode(mode)}`);
    const catatan = peringatanAwalan(clientKey, mode, 'Client Key');
    if (catatan) peringatan.push(catatan);
    hasil.clientKey = clientKey;
  }

  // Kolom Server Key selalu kosong saat dialog dibuka. String kosong berarti
  // "jangan sentuh yang lama", bukan "kosongkan" — jadi ia diabaikan, tidak
  // ditolak. Yang mengosongkan kredensial adalah tombol Putuskan Integrasi.
  if (obj.serverKey !== undefined && obj.serverKey !== null) {
    if (typeof obj.serverKey !== 'string') {
      throw ApiError.badRequest('Field "serverKey" harus berupa teks');
    }
    if (obj.serverKey.trim() !== '') {
      const serverKey = bacaKunci(obj.serverKey, `Server Key ${namaMode(mode)}`);
      const catatan = peringatanAwalan(serverKey, mode, 'Server Key');
      if (catatan) peringatan.push(catatan);
      hasil.serverKey = serverKey;
    }
  }

  return hasil;
}
