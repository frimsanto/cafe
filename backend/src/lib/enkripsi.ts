import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';

// Enkripsi simetris untuk menyimpan kredensial rahasia (mis. Midtrans serverKey)
// di database. Memakai AES-256-GCM: selain merahasiakan isi, GCM juga memverifikasi
// keutuhan data (auth tag) sehingga ciphertext yang diubah-ubah akan ditolak.
//
// Kunci berasal dari ENCRYPTION_KEY di .env — 32 byte dalam bentuk hex (64 karakter).
//   Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
//
// ── FORMAT CIPHERTEXT: `iv:authTag:data` (hex), TIDAK BERUBAH ───────────────
// Format ini sama persis sejak kolom `cafes.midtrans_server_key` lahir, dan
// migrasi `20260830000000_pengaturan_pembayaran` menyalin ciphertext-nya apa
// adanya ke `midtrans_credentials.server_key_enc`. Tidak ada AAD, tidak ada
// version marker, dan derivasi kuncinya cuma "hex ENCRYPTION_KEY -> 32 byte".
//
// Itu disebut tegas di sini karena penting: ciphertext yang gagal dibuka BUKAN
// karena formatnya berganti. Menambahkan AAD (mis. cafeId/mode) sekarang justru
// akan membuat seluruh data lama tak terbaca — jadi sengaja TIDAK dilakukan.
// Yang dibedakan modul ini hanyalah SEBAB kegagalannya.
//
// ── DUA KEGAGALAN YANG TIDAK BOLEH TERTUKAR ─────────────────────────────────
//   * KONFIGURASI — ENCRYPTION_KEY tidak ada/tidak sah di proses ini. Datanya
//     baik-baik saja; yang salah servernya. Menyuruh pengguna mengetik ulang
//     kuncinya adalah nasihat yang salah: penyimpanannya pun akan gagal.
//   * CIPHERTEXT  — kuncinya ada, tapi blob ini tidak bisa dibuka dengannya.
//     Barulah di sini "masukkan ulang Server Key" menjadi jalan keluar.
//
// Kunci enkripsi TIDAK PERNAH dibuat otomatis saat variabelnya kosong. Kunci
// dadakan berarti setiap restart menghasilkan kunci berbeda — seluruh kredensial
// tersimpan menjadi sampah tanpa ada yang tahu kapan itu terjadi.

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit — panjang nonce yang direkomendasikan untuk GCM.
const TAG_LENGTH = 16; // GCM auth tag: 128-bit.
const KEY_HEX_LENGTH = 64; // 32 byte = 64 karakter hex.

const PESAN_KONFIGURASI =
  'ENCRYPTION_KEY harus 64 karakter hex (32 byte). Generate dengan: ' +
  'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"';

/**
 * Server tidak dikonfigurasi dengan benar — ENCRYPTION_KEY hilang atau tidak
 * sah. Dibedakan dari `KesalahanDekripsi` supaya pemanggil tidak menyalahkan
 * data pengguna atas kesalahan operator.
 */
export class KesalahanKonfigurasiEnkripsi extends Error {
  readonly kode = 'ENCRYPTION_KEY_TIDAK_TERSEDIA' as const;
  constructor(pesan = PESAN_KONFIGURASI) {
    super(pesan);
    this.name = 'KesalahanKonfigurasiEnkripsi';
  }
}

/** Ciphertext-nya yang tidak bisa dibuka — bukan konfigurasi servernya. */
export class KesalahanDekripsi extends Error {
  readonly kode = 'CIPHERTEXT_TIDAK_TERBACA' as const;
  constructor(pesan = 'Ciphertext tidak bisa didekripsi dengan kunci yang berlaku') {
    super(pesan);
    this.name = 'KesalahanDekripsi';
  }
}

/** Hasil dekripsi yang tidak pernah melempar — sebabnya ikut terbawa. */
export type HasilDekripsi =
  | { ok: true; teks: string }
  | { ok: false; sebab: 'KONFIGURASI' | 'CIPHERTEXT'; pesan: string };

function hexValid(nilai: string, panjangByte?: number): boolean {
  if (nilai === '' || nilai.length % 2 !== 0) return false;
  if (panjangByte !== undefined && nilai.length !== panjangByte * 2) return false;
  return /^[0-9a-fA-F]+$/.test(nilai);
}

/**
 * Ambil kunci enkripsi 32-byte dari environment. Dilempar bila belum diset atau
 * panjangnya salah — lebih baik gagal keras saat konfigurasi daripada diam-diam
 * menyimpan kredensial dengan kunci lemah (atau kunci dadakan yang hilang saat
 * proses berikutnya naik).
 */
function loadKey(): Buffer {
  const raw = (process.env.ENCRYPTION_KEY ?? '').trim();
  if (raw.length !== KEY_HEX_LENGTH || !hexValid(raw, 32)) {
    throw new KesalahanKonfigurasiEnkripsi();
  }
  return Buffer.from(raw, 'hex');
}

/**
 * Apakah proses ini punya ENCRYPTION_KEY yang sah?
 *
 * Dipakai lapisan di atas untuk membedakan "server belum dikonfigurasi" dari
 * "kredensial ini rusak" TANPA harus menyentuh satu pun ciphertext.
 */
export function enkripsiSiap(): boolean {
  try {
    loadKey();
    return true;
  } catch {
    return false;
  }
}

/** Melempar `KesalahanKonfigurasiEnkripsi` bila kunci tidak tersedia. */
export function pastikanEnkripsiSiap(): void {
  loadKey();
}

/**
 * Bentuk `iv:authTag:data` dengan panjang yang masuk akal?
 *
 * Pemeriksaan murah ini membedakan blob format lain / plaintext yang telanjur
 * masuk kolom dari ciphertext sah yang kuncinya kebetulan berbeda. Keduanya
 * sama-sama harus dimasukkan ulang, tapi hanya yang pertama bisa dipastikan
 * tanpa memegang kunci sama sekali.
 */
export function bentukCiphertextDikenal(nilai: string): boolean {
  const parts = nilai.split(':');
  if (parts.length !== 3) return false;
  const [ivHex, tagHex, dataHex] = parts;
  return hexValid(ivHex, IV_LENGTH) && hexValid(tagHex, TAG_LENGTH) && hexValid(dataHex);
}

/**
 * Enkripsi teks biasa menjadi string `iv:authTag:ciphertext` (semuanya hex).
 * IV acak per pemanggilan sehingga dua enkripsi teks yang sama tetap berbeda.
 *
 * Melempar `KesalahanKonfigurasiEnkripsi` bila ENCRYPTION_KEY tidak tersedia —
 * menyimpan kredensial yang tidak akan pernah bisa dibuka lagi lebih buruk
 * daripada menolak menyimpannya.
 */
export function enkripsi(text: string): string {
  const key = loadKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Balikkan hasil `enkripsi`. Melempar `KesalahanKonfigurasiEnkripsi` bila kunci
 * tidak ada, atau `KesalahanDekripsi` bila format salah / auth tag tidak cocok
 * (ciphertext rusak, diubah, atau dienkripsi dengan kunci lain).
 */
export function dekripsi(ciphertext: string): string {
  const key = loadKey();
  if (!bentukCiphertextDikenal(ciphertext)) {
    throw new KesalahanDekripsi('Format ciphertext tidak dikenal (harus iv:authTag:data)');
  }
  const [ivHex, tagHex, dataHex] = ciphertext.split(':');
  try {
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataHex, 'hex')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch {
    // Pesan asli dari OpenSSL ("Unsupported state or unable to authenticate
    // data") tidak menambah apa pun dan cuma jadi kebisingan di log.
    throw new KesalahanDekripsi();
  }
}

/**
 * Versi `dekripsi` yang TIDAK PERNAH melempar.
 *
 * Inilah yang dipakai jalur baca: kredensial yang tak terbaca adalah keadaan
 * yang harus DILAPORKAN ke pemilik kafe, bukan galat 500. Yang dikembalikan
 * memisahkan dua sebab yang tindak lanjutnya berbeda total.
 */
export function dekripsiAman(ciphertext: string): HasilDekripsi {
  try {
    return { ok: true, teks: dekripsi(ciphertext) };
  } catch (err) {
    if (err instanceof KesalahanKonfigurasiEnkripsi) {
      return { ok: false, sebab: 'KONFIGURASI', pesan: err.message };
    }
    return {
      ok: false,
      sebab: 'CIPHERTEXT',
      pesan: err instanceof Error ? err.message : 'Ciphertext tidak bisa dibaca',
    };
  }
}

/**
 * Enkripsi lalu SEGERA dekripsi kembali untuk membuktikan hasilnya terbaca.
 *
 * Round-trip ini murah (satu blok AES) dan menutup satu-satunya cara kredensial
 * bisa "tersimpan" tapi tak pernah bisa dipakai: tersimpan oleh proses yang
 * kuncinya ternyata bukan kunci yang akan membacanya nanti. Setelah fungsi ini
 * kembali tanpa melempar, status "tersimpan" adalah fakta, bukan harapan.
 */
export function enkripsiTerverifikasi(text: string): string {
  const ciphertext = enkripsi(text);
  const balik = dekripsi(ciphertext);
  // Perbandingan waktu-tetap: nilainya rahasia, dan tidak ada alasan
  // membocorkan panjang prefix yang cocok lewat waktu eksekusi.
  const a = Buffer.from(balik, 'utf8');
  const b = Buffer.from(text, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new KesalahanDekripsi('Round-trip enkripsi tidak menghasilkan nilai yang sama');
  }
  return ciphertext;
}
