/**
 * Nomor antrian yang dibacakan ke pelanggan — cerminan persis
 * `frontend/src/lib/orderCode.ts`.
 *
 * Angkanya kini datang dari kolom `orders.queue_number`, bukan lagi dari hash
 * UUID. Bedanya bukan kosmetik: nomor hasil hash acak (pesanan pertama hari itu
 * bisa keluar sebagai `Q-742`), sedangkan nomor berurutan memberi tahu tamu DAN
 * staf posisi antrean yang sebenarnya — `A-004` datang sesudah `A-003`.
 *
 * Kedua sisi WAJIB memakai rumus yang sama: struk yang dicetak kasir dan nomor
 * besar di layar ponsel tamu harus menunjukkan angka yang identik. Kalau salah
 * satu berubah, ubah keduanya.
 */

/** Papan antrian kafe berjalan 001…999 lalu berputar lagi ke 001. */
const ANTRIAN_MIN = 1;
const ANTRIAN_MAKS = 999;
const RENTANG = ANTRIAN_MAKS - ANTRIAN_MIN + 1;

/** Awalan huruf pada nomor antrian. Satu huruf tetap: papan kafe hanya punya
    satu deret, jadi huruf di sini murni pemanis baca ("A-tujuh belas"). */
const AWALAN = 'A';

/**
 * Bulatkan sembarang bilangan bulat ke rentang antrian 001–999.
 *
 * Ini titik "rolling"-nya: 999 disusul 001 lagi, bukan 1000 atau 000.
 */
export function putarAntrian(n: number): number {
  return ((((Math.trunc(n) - ANTRIAN_MIN) % RENTANG) + RENTANG) % RENTANG) + ANTRIAN_MIN;
}

/** Selalu tiga digit: 7 → "007", 999 → "999". */
export function formatAntrian(n: number): string {
  return String(putarAntrian(n)).padStart(3, '0');
}

/**
 * Nomor antrian berikutnya untuk sebuah kafe, dari nomor terakhir hari ini.
 *
 * `undefined`/`null` berarti belum ada pesanan hari ini — hari baru selalu
 * dimulai dari 1. Sesudah 999 kembali ke 1 (lihat `putarAntrian`).
 */
export function antrianBerikutnya(terakhir: number | null | undefined): number {
  return putarAntrian((terakhir ?? 0) + 1);
}

/**
 * Kode antrian yang ditampilkan, mis. `A-017`.
 *
 * Pesanan lama (dibuat sebelum kolom `queue_number` ada) tidak punya nomor dan
 * tidak bisa diberi nomor secara jujur, jadi jatuh ke `A-001`.
 */
export function nomorAntrian(queueNumber?: number | null): string {
  if (queueNumber === null || queueNumber === undefined) {
    return `${AWALAN}-${formatAntrian(ANTRIAN_MIN)}`;
  }
  return `${AWALAN}-${formatAntrian(queueNumber)}`;
}

/**
 * Zona waktu "jam dinding kafe" — penentu kapan hari berganti, dan karenanya
 * kapan nomor antrian kembali ke 001.
 *
 * Sengaja TIDAK memakai jam server: VPS lazimnya berjalan di UTC, sehingga
 * "tengah malam" server jatuh pukul 07.00 WIB — tepat di tengah jam sarapan,
 * dan antrean akan tereset saat kafe justru sedang ramai.
 */
const ZONA_KAFE = process.env.TZ_KAFE?.trim() || 'Asia/Jakarta';

/** Instan yang, bila dibaca sebagai UTC, menunjukkan jam dinding zona kafe. */
function jamDinding(saat: Date): Date {
  // `sv-SE` memberi "2026-08-29 14:03:05" — satu-satunya locale bawaan yang
  // formatnya sudah ISO tanpa perlu dirakit dari `formatToParts`.
  const teks = new Intl.DateTimeFormat('sv-SE', {
    timeZone: ZONA_KAFE,
    dateStyle: 'short',
    timeStyle: 'medium',
  }).format(saat);
  return new Date(`${teks.replace(' ', 'T')}Z`);
}

/**
 * Tengah malam terakhir menurut jam dinding kafe, sebagai instan UTC.
 *
 * Dipakai sebagai batas bawah "pesanan hari ini" saat mengambil nomor antrian
 * terakhir.
 */
export function awalHariKafe(saat: Date = new Date()): Date {
  const dinding = jamDinding(saat);
  // `dinding` hanya berpresisi detik (Intl tidak memberi milidetik), jadi
  // pembandingnya ikut dibulatkan — kalau tidak, batas hari meleset sebesar
  // milidetik `saat` dan pesanan tepat di detik pergantian hari bisa terlewat.
  const selisih = dinding.getTime() - Math.floor(saat.getTime() / 1000) * 1000;
  const tengahMalam = Date.UTC(
    dinding.getUTCFullYear(),
    dinding.getUTCMonth(),
    dinding.getUTCDate(),
  );
  return new Date(tengahMalam - selisih);
}
