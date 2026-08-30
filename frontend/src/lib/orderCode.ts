/**
 * Nomor antrian yang dibacakan ke pelanggan.
 *
 * Angkanya datang dari server (`orders.queue_number`): berurutan per kafe dan
 * per hari, mulai dari 1 setiap pagi. Sebelumnya kode ini menurunkan nomor dari
 * hash id pesanan — stabil, tapi acak, sehingga tamu pertama hari itu bisa
 * memegang `Q-742` dan tidak seorang pun bisa membaca urutan antrean darinya.
 *
 * Sifatnya tetap MURNI TAMPILAN: id lengkap pesanan masih dicantumkan di kaki
 * kartu rincian, karena itulah yang dilihat staf di layar mereka bila ada yang
 * perlu dicocokkan.
 *
 * Cerminan persis `backend/src/lib/orderCode.ts` — struk yang dicetak staf dan
 * nomor besar di layar ponsel tamu harus menunjukkan angka yang sama. Kalau
 * salah satu berubah, ubah keduanya.
 */

/** Nomor terkecil & terbesar yang boleh tampil — papan antrian kafe lazimnya
    berjalan 001…999 lalu berputar kembali ke 001, tidak pernah menampilkan
    000 yang terbaca seperti "kosong". */
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
 * Kode antrian yang ditampilkan, mis. `A-017`.
 *
 * Pesanan lama (dibuat sebelum server menyimpan nomor antrian) tidak punya
 * nomor dan tidak bisa diberi nomor secara jujur, jadi jatuh ke `A-001`.
 */
export function nomorAntrian(queueNumber?: number | null): string {
  if (queueNumber === null || queueNumber === undefined) {
    return `${AWALAN}-${formatAntrian(ANTRIAN_MIN)}`;
  }
  return `${AWALAN}-${formatAntrian(queueNumber)}`;
}
