import { createHash, randomInt } from 'node:crypto';

/**
 * Kode pemasangan terminal — yang dibaca MANUSIA, bukan yang dipegang mesin.
 *
 * ── Kenapa token perangkat tidak boleh menjadi kode pemasangan ──
 *
 * Token perangkat adalah 64 karakter heksadesimal. Ia sempurna sebagai rahasia
 * yang disimpan cookie dan mustahil sebagai sesuatu yang diucapkan pemilik
 * kepada kasirnya lewat telepon, disalin ke tablet di seberang ruangan, atau
 * dibaca dari layar ponsel. Yang terjadi di produksi persis itu: pemilik
 * menempelkan tokennya ke kolom NAMA TERMINAL, mendaftarkan tiga terminal
 * bernama `0b41506b3ca29a87…`, `budiman@gmail.com`, dan `123123`, lalu mencabut
 * ketiganya dalam dua setengah menit tanpa satu pun pernah terpasang.
 *
 * Kode di bawah memisahkan dua peran yang sebelumnya ditumpuk pada satu string:
 *
 *   KODE PEMASANGAN  pendek, dibaca manusia, sekali pakai, kedaluwarsa.
 *   TOKEN PERANGKAT  panjang, tidak pernah dilihat manusia, umur panjang.
 *
 * Kodenya ditukar dengan tokennya SEKALI di `/kasir`. Sesudah itu tokennya
 * hidup di cookie HttpOnly dan tidak ada manusia — pemilik sekalipun — yang
 * pernah melihatnya.
 *
 * ── Abjadnya: Crockford base32 ──
 *
 * Tanpa I, L, O, dan U. Empat huruf itu dibuang bukan karena selera melainkan
 * karena masing-masing punya kembaran yang salah ketik: I/1, L/1, O/0. (U
 * dibuang Crockford supaya kode acak tidak sesekali mengeja kata kasar.)
 *
 * Yang membuatnya benar-benar menolong bukan abjadnya melainkan
 * `normalisasiKode` di bawah: siapa pun yang MENGETIK `O` ketika layar
 * menampilkan `0` tetap berhasil masuk, karena pembacaannya memetakan kembaran
 * itu balik. Kode yang menolak salah ketik yang sudah diketahui bentuknya
 * adalah kode yang membuat orang mengira terminalnya rusak.
 */

/** Crockford base32 — 32 lambang, 5 bit per karakter. */
const ABJAD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Panjang muatan acak. 8 × 5 bit = 40 bit. */
const PANJANG_MUATAN = 8;

/**
 * Awalan yang membuat kodenya bisa dikenali saat ditempel di grup WhatsApp.
 *
 * Ikut dibuang saat pembacaan, jadi menyalin `KSR-` atau tidak sama saja.
 */
const AWALAN = 'KSR';

/**
 * Umur kode pemasangan.
 *
 * Cukup lama untuk pemilik berjalan dari mejanya ke terminal di seberang kafe,
 * cukup pendek sehingga kode yang telanjur tertinggal di riwayat chat tidak
 * berguna besok pagi. Kode ini sekali pakai, jadi yang dijaga umurnya hanyalah
 * jendela ketika ia masih BELUM dipakai.
 */
export const UMUR_KODE_MENIT = 15;

/**
 * Terbitkan kode baru.
 *
 * `randomInt` — bukan `Math.random()` — karena kode ini adalah kredensial: ia
 * cukup untuk mengubah sebuah peramban menjadi terminal yang dipercaya menagih.
 * `randomInt` juga bebas dari bias modulo, yang akan membuat sebagian lambang
 * lebih sering muncul daripada yang lain dan memperkecil ruang tebakan nyata.
 */
export function buatKode(): string {
  let muatan = '';
  for (let i = 0; i < PANJANG_MUATAN; i += 1) {
    muatan += ABJAD[randomInt(ABJAD.length)];
  }
  return `${AWALAN}-${muatan.slice(0, 4)}-${muatan.slice(4)}`;
}

/**
 * Baca kode yang diketik manusia menjadi bentuk bakunya.
 *
 * Memaafkan: huruf kecil, spasi, tanda hubung di tempat mana pun, awalan yang
 * tertinggal atau hilang, dan tiga salah ketik klasik (O→0, I→1, L→1).
 * `null` bila yang tersisa bukan kode berbentuk benar — pemanggilnya lalu
 * menolak tanpa perlu menyentuh database.
 */
export function normalisasiKode(mentah: string): string | null {
  const bersih = mentah
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/^KSR/, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');

  if (bersih.length !== PANJANG_MUATAN) return null;
  for (const c of bersih) if (!ABJAD.includes(c)) return null;

  return `${AWALAN}-${bersih.slice(0, 4)}-${bersih.slice(4)}`;
}

/**
 * Hash kode untuk disimpan.
 *
 * SHA-256 polos dengan alasan yang sama seperti token perangkat: isinya acak,
 * jadi tidak ada kamus yang bisa menebaknya dan yang tersisa hanya kebutuhan
 * pencarian yang cepat. Yang menjaga kode 40-bit ini bukan kelambatan hash
 * melainkan tiga hal lain — sekali pakai, kedaluwarsa {@link UMUR_KODE_MENIT}
 * menit, dan batas laju penukaran per IP.
 */
export function hashKode(kode: string): string {
  return createHash('sha256').update(kode, 'utf8').digest('hex');
}

/** Kapan sebuah kode yang diterbitkan sekarang berhenti berlaku. */
export function kedaluwarsaKode(sekarang = new Date()): Date {
  return new Date(sekarang.getTime() + UMUR_KODE_MENIT * 60_000);
}
