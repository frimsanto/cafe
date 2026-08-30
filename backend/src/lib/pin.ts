// PIN staf untuk perangkat POS bersama.
//
// PIN adalah kunci untuk MEMBUKA SESI di terminal yang sudah dipercaya — bukan
// pengganti kata sandi, dan tidak pernah bisa dipakai di halaman login biasa.
// Perbedaan itu yang menentukan seluruh bentuk berkas ini.
//
// ── Mengapa 4-6 digit boleh dianggap cukup di sini ──
//
// Ruang tebakannya kecil: sepuluh ribu kemungkinan pada 4 digit. Kalau PIN
// menjadi satu-satunya penjaga sebuah endpoint publik, itu jelas tidak memadai.
// Yang membuatnya memadai di sini adalah TIGA lapis yang harus ditembus
// bersamaan:
//
//   1. Penyerang harus sudah memegang terminal yang terdaftar (token perangkat
//      di cookie HttpOnly), yang berarti ia sudah berada di dalam kafe.
//   2. Percobaannya dibatasi — lihat `KEBIJAKAN` di bawah. Menebak sepuluh ribu
//      kemungkinan dengan penguncian bertingkat memakan waktu berhari-hari,
//      di depan kasir yang sedang bekerja.
//   3. Setiap kegagalan tercatat di audit log.
//
// Jadi yang menjaga PIN bukan panjangnya, melainkan berapa kali ia boleh
// ditebak. Itulah sebabnya kebijakan penguncian di berkas ini bukan hiasan
// yang boleh dilonggarkan "sementara" saat kasir mengeluh lupa PIN.
//
// ── Yang TIDAK PERNAH terjadi di sini ──
//
// PIN mentah tidak pernah dicatat, tidak pernah dikembalikan dalam respons,
// tidak pernah masuk audit log, dan tidak pernah bisa dibaca ulang setelah
// disimpan — termasuk oleh pemilik kafe. "Reset PIN" berarti MENGGANTI, bukan
// menampilkan yang lama.

import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

export const PIN_MIN_DIGIT = 4;
export const PIN_MAX_DIGIT = 6;

/** Kebijakan penguncian — satu-satunya penjaga nyata sebuah PIN. */
export const KEBIJAKAN = {
  /** Percobaan gagal beruntun sebelum penguncian pertama. */
  maksPercobaan: 5,
  /**
   * Lama penguncian, bertambah pada setiap kelipatan `maksPercobaan`
   * berikutnya: 1 menit, lalu 5, lalu 15, lalu 60. Bertingkat, bukan tetap —
   * kasir yang benar-benar lupa PIN cukup menunggu semenit, sementara skrip
   * yang menebak terus-menerus segera menghadapi jeda satu jam.
   */
  durasiKunciMenit: [1, 5, 15, 60],
} as const;

/** PIN yang terlalu mudah ditebak untuk boleh dipakai. */
const POLA_LEMAH = new Set([
  '0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999',
  '1234', '4321', '0123', '3210', '1122', '1212', '2121',
  '000000', '111111', '222222', '333333', '444444', '555555',
  '666666', '777777', '888888', '999999', '123456', '654321', '121212',
]);

export interface HasilValidasiPin {
  valid: boolean;
  /** Pesan untuk pengguna. Tidak pernah memuat PIN-nya. */
  pesan?: string;
}

/**
 * Periksa bentuk sebuah PIN sebelum di-hash.
 *
 * Menolak pola yang paling sering dipakai (`1234`, `0000`) bukan karena
 * matematis lebih lemah — setiap PIN sama peluangnya — melainkan karena itulah
 * yang dicoba penebak pada tiga percobaan pertamanya, jauh sebelum penguncian
 * sempat bekerja.
 */
export function validasiPin(pin: string): HasilValidasiPin {
  if (typeof pin !== 'string' || !/^\d+$/.test(pin)) {
    return { valid: false, pesan: 'PIN hanya boleh berisi angka.' };
  }
  if (pin.length < PIN_MIN_DIGIT || pin.length > PIN_MAX_DIGIT) {
    return {
      valid: false,
      pesan: `PIN harus ${PIN_MIN_DIGIT}-${PIN_MAX_DIGIT} digit.`,
    };
  }
  if (POLA_LEMAH.has(pin)) {
    return {
      valid: false,
      pesan: 'PIN itu terlalu mudah ditebak. Pilih kombinasi lain.',
    };
  }
  return { valid: true };
}

export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, SALT_ROUNDS);
}

/**
 * Cocokkan PIN dengan hash-nya.
 *
 * Mengembalikan `false` (bukan melempar) saat hash-nya rusak atau kosong:
 * staf yang belum punya PIN harus ditolak seperti staf yang salah PIN, bukan
 * menjatuhkan permintaannya dengan galat yang membocorkan bahwa akun itu
 * memang belum bisa dipakai.
 */
export async function cocokkanPin(pin: string, hash: string | null): Promise<boolean> {
  if (!hash) return false;
  try {
    return await bcrypt.compare(pin, hash);
  } catch {
    return false;
  }
}

// ── Penguncian ───────────────────────────────────────────────────────────────

/** Kondisi PIN seorang staf, persis kolom yang tersimpan di `users`. */
export interface KondisiPin {
  pinGagal: number;
  pinTerkunciSampai: Date | null;
}

/** Keputusan setelah satu percobaan PIN. */
export interface KeputusanPin {
  /** Berapa nilai `pin_gagal` yang harus ditulis. */
  pinGagal: number;
  /** Kapan penguncian berakhir; null = tidak terkunci. */
  pinTerkunciSampai: Date | null;
  /** Sisa percobaan sebelum terkunci — untuk ditampilkan ke staf. */
  sisaPercobaan: number;
}

/**
 * Apakah PIN sedang terkunci pada `sekarang`.
 *
 * Perbandingannya `>` bukan `>=`: penguncian yang berakhir tepat detik ini
 * sudah selesai, dan menahannya satu detik lagi hanya membuat kasir menekan
 * tombol dua kali.
 */
export function sedangTerkunci(kondisi: KondisiPin, sekarang: Date = new Date()): boolean {
  return kondisi.pinTerkunciSampai !== null && kondisi.pinTerkunciSampai > sekarang;
}

/** Sisa penguncian dalam detik — untuk pesan "coba lagi dalam N detik". */
export function sisaKunciDetik(
  kondisi: KondisiPin,
  sekarang: Date = new Date(),
): number {
  if (!sedangTerkunci(kondisi, sekarang)) return 0;
  const sisa = kondisi.pinTerkunciSampai!.getTime() - sekarang.getTime();
  return Math.max(1, Math.ceil(sisa / 1000));
}

/**
 * Hitung kondisi baru setelah PIN SALAH.
 *
 * Fungsi murni — tidak menyentuh database — supaya kebijakan penguncian bisa
 * diuji habis-habisan tanpa koneksi, sesuai konvensi uji backend CafeOS.
 */
export function setelahGagal(
  kondisi: KondisiPin,
  sekarang: Date = new Date(),
): KeputusanPin {
  const gagal = kondisi.pinGagal + 1;
  const { maksPercobaan, durasiKunciMenit } = KEBIJAKAN;

  // Belum mencapai ambang → cukup naikkan penghitungnya.
  if (gagal % maksPercobaan !== 0) {
    return {
      pinGagal: gagal,
      pinTerkunciSampai: kondisi.pinTerkunciSampai,
      sisaPercobaan: maksPercobaan - (gagal % maksPercobaan),
    };
  }

  // Kelipatan ambang → kunci, dengan durasi yang menaik tiap kelipatan.
  const tingkat = Math.min(
    Math.floor(gagal / maksPercobaan) - 1,
    durasiKunciMenit.length - 1,
  );
  const menit = durasiKunciMenit[tingkat];

  return {
    pinGagal: gagal,
    pinTerkunciSampai: new Date(sekarang.getTime() + menit * 60_000),
    sisaPercobaan: 0,
  };
}

/**
 * Kondisi setelah PIN BENAR — penghitung dan penguncian sama-sama dibersihkan.
 *
 * Penting bahwa `pinGagal` kembali ke nol dan bukan sekadar dikurangi: kasir
 * yang salah ketik empat kali lalu berhasil tidak boleh memulai besok pagi
 * dengan satu percobaan tersisa.
 */
export function setelahBerhasil(): KeputusanPin {
  return {
    pinGagal: 0,
    pinTerkunciSampai: null,
    sisaPercobaan: KEBIJAKAN.maksPercobaan,
  };
}
