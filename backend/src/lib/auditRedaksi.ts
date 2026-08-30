// Penyaring nilai yang boleh masuk ke `payment_audit_logs`.
//
// Jejak audit dibaca ulang oleh manusia — pemilik kafe, dan kelak kami saat
// menelusuri selisih kas. Justru karena itu ia tidak boleh menjadi tempat
// rahasia bocor: sebuah Server Key yang tercatat di sini akan hidup selamanya
// di database, ikut dalam setiap backup, dan terbaca siapa pun yang berhak
// membuka log — padahal kolom aslinya susah payah dienkripsi.
//
// Pendekatannya DAFTAR-PUTIH terbalik: nilai apa pun boleh lewat KECUALI
// kuncinya terdengar rahasia, dan beberapa jenis nilai (nomor rekening)
// disamarkan sebagian supaya tetap berguna tanpa terbaca utuh.

/** Kunci yang isinya tidak boleh pernah tersimpan, sekalipun tersamar. */
const KUNCI_RAHASIA = [
  'serverkey',
  'server_key',
  'serverkeyenc',
  'secret',
  'password',
  'token',
  'apikey',
  'api_key',
  'privatekey',
];

/** Kunci yang nilainya disimpan tersamar (ekor saja) — bukan dibuang. */
const KUNCI_SAMAR = ['nomorrekening', 'bank_nomor_rekening', 'banknomorrekening', 'nmid'];

const PENGGANTI = '[dihapus]';

function kunciRahasia(kunci: string): boolean {
  const k = kunci.toLowerCase().replace(/[^a-z_]/g, '');
  return KUNCI_RAHASIA.some((pola) => k.includes(pola.replace(/[^a-z_]/g, '')));
}

function kunciSamar(kunci: string): boolean {
  const k = kunci.toLowerCase().replace(/[^a-z_]/g, '');
  return KUNCI_SAMAR.some((pola) => k.includes(pola.replace(/[^a-z_]/g, '')));
}

/**
 * Samarkan sebuah nilai menjadi ekornya saja: `1234567890` → `••••7890`.
 *
 * Cukup untuk pemilik mengenali rekening mana yang diubah, tidak cukup untuk
 * dipakai orang lain.
 */
export function samarkan(nilai: string): string {
  const bersih = nilai.trim();
  if (bersih.length <= 4) return '••••';
  return `••••${bersih.slice(-4)}`;
}

/** Nilai yang aman disimpan di kolom JSON audit. */
export type NilaiAudit = string | number | boolean | null;

/**
 * Bersihkan sebuah objek sebelum masuk audit log.
 *
 * Kunci rahasia DIBUANG seluruhnya (tidak diganti penanda bernilai, supaya
 * tidak ada yang tergoda membacanya sebagai "ada isinya"); kunci sensitif
 * disamarkan; sisanya lolos apa adanya. Objek/array bersarang tidak
 * didukung — bentuk log ini sengaja datar agar mudah dibaca.
 */
export function redaksiAudit(
  data: Record<string, unknown> | null | undefined,
): Record<string, NilaiAudit> | null {
  if (!data) return null;

  const hasil: Record<string, NilaiAudit> = {};
  for (const [kunci, nilai] of Object.entries(data)) {
    if (nilai === undefined) continue;
    if (kunciRahasia(kunci)) {
      hasil[kunci] = PENGGANTI;
      continue;
    }
    if (nilai === null) {
      hasil[kunci] = null;
      continue;
    }
    if (typeof nilai === 'boolean' || typeof nilai === 'number') {
      hasil[kunci] = nilai;
      continue;
    }
    if (typeof nilai === 'string') {
      hasil[kunci] = kunciSamar(kunci) && nilai !== '' ? samarkan(nilai) : nilai;
      continue;
    }
    if (Array.isArray(nilai)) {
      hasil[kunci] = nilai.map((v) => String(v)).join(', ');
      continue;
    }
    // Bentuk lain (objek bersarang, Date, Decimal) diringkas jadi teks —
    // tidak ada yang perlu ditelusuri dari strukturnya.
    hasil[kunci] = String(nilai);
  }
  return hasil;
}
