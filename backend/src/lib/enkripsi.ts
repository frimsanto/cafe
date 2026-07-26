import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// Enkripsi simetris untuk menyimpan kredensial rahasia (mis. Midtrans serverKey)
// di database. Memakai AES-256-GCM: selain merahasiakan isi, GCM juga memverifikasi
// keutuhan data (auth tag) sehingga ciphertext yang diubah-ubah akan ditolak.
//
// Kunci berasal dari ENCRYPTION_KEY di .env — 32 byte dalam bentuk hex (64 karakter).
//   Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit — panjang nonce yang direkomendasikan untuk GCM.
const KEY_HEX_LENGTH = 64; // 32 byte = 64 karakter hex.

/**
 * Ambil kunci enkripsi 32-byte dari environment. Dilempar bila belum diset atau
 * panjangnya salah — lebih baik gagal keras saat konfigurasi daripada diam-diam
 * menyimpan kredensial dengan kunci lemah.
 */
function loadKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY ?? '';
  if (raw.length !== KEY_HEX_LENGTH || !/^[0-9a-fA-F]+$/.test(raw)) {
    throw new Error(
      'ENCRYPTION_KEY harus 64 karakter hex (32 byte). Generate dengan: ' +
        'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
  }
  return Buffer.from(raw, 'hex');
}

/**
 * Enkripsi teks biasa menjadi string `iv:authTag:ciphertext` (semuanya hex).
 * IV acak per pemanggilan sehingga dua enkripsi teks yang sama tetap berbeda.
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
 * Balikkan hasil `enkripsi`. Melempar bila format salah atau auth tag tidak cocok
 * (ciphertext rusak / diubah / kunci berbeda).
 */
export function dekripsi(ciphertext: string): string {
  const key = loadKey();
  const parts = ciphertext.split(':');
  if (parts.length !== 3) {
    throw new Error('Format ciphertext tidak valid (harus iv:authTag:data)');
  }
  const [ivHex, tagHex, dataHex] = parts;
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}
