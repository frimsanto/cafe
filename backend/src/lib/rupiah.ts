// Satu-satunya tempat dua dunia uang di CafeOS bertemu.
//
// CafeOS menyimpan uang dengan DUA tipe, dan itu disengaja:
//
//   Decimal(12,2)  tabel lama — `orders.total_amount`, `payments.amount`,
//                  `menu_items.price`, `pembayaran_manual.nominal`.
//   BIGINT         tabel shift — `cashier_shifts.modal_awal`, `kas_aktual`,
//                  `selisih`, `cash_movements.nominal`.
//
// Menyeragamkannya berarti mengubah tipe kolom yang sudah berisi seluruh
// riwayat penjualan — penguncian tabel pada database yang sedang dipakai
// berjualan, demi kerapian yang tidak dilihat siapa pun. Harga yang tidak
// sepadan. Yang dilakukan justru sebaliknya: perbatasan antara keduanya
// dipersempit menjadi satu berkas ini, sehingga konversinya hanya terjadi di
// tempat yang bisa dibaca dan diuji.
//
// ── Mengapa laci kas memakai bilangan bulat ──
//
// Rupiah tidak mengenal sen. Setiap kali "tunai seharusnya" dihitung sebagai
// penjumlahan bilangan pecahan, ia berpeluang meleset beberapa rupiah — dan
// selisih kas beberapa rupiah yang muncul setiap hari adalah cara tercepat
// membuat kasir berhenti menganggap selisih sebagai peringatan. Bilangan bulat
// membuat "seharusnya" dan "aktual" bisa benar-benar sama.

import { Prisma } from '@prisma/client';

/**
 * Batas aman rupiah yang masih bisa diwakili `number` JavaScript tanpa
 * kehilangan ketelitian (2^53 - 1 ≈ 9,007 kuadriliun).
 *
 * Angka ini bukan sekadar teori: seluruh DTO mengirim uang sebagai `number`
 * JSON, jadi setiap BigInt yang keluar dari database melewati ambang ini. Kafe
 * yang beromzet sembilan kuadriliun rupiah tidak akan pernah ada — tapi kolom
 * yang rusak karena data sampah bisa saja berisi angka sebesar itu, dan lebih
 * baik ia berhenti dengan galat yang jelas daripada diam-diam membulatkan.
 */
const BATAS_AMAN = BigInt(Number.MAX_SAFE_INTEGER);

/** Galat konversi uang — selalu bug program, bukan kesalahan pengguna. */
export class RupiahError extends Error {
  constructor(pesan: string) {
    super(pesan);
    this.name = 'RupiahError';
  }
}

/**
 * BIGINT database → `number` untuk DTO/JSON.
 *
 * `JSON.stringify` MELEMPAR saat menemui BigInt (bukan mengubahnya menjadi
 * teks, bukan pula mengabaikannya) — sehingga satu kolom BigInt yang lolos ke
 * `res.json()` akan menjatuhkan endpoint-nya dengan pesan yang tidak menyebut
 * kolom mana penyebabnya. Setiap BigInt WAJIB melewati fungsi ini sebelum
 * meninggalkan lapisan service.
 */
export function keNumber(nilai: bigint | null | undefined): number | null {
  if (nilai === null || nilai === undefined) return null;
  if (nilai > BATAS_AMAN || nilai < -BATAS_AMAN) {
    throw new RupiahError(
      `Nilai rupiah di luar jangkauan aman JavaScript: ${nilai.toString()}`,
    );
  }
  return Number(nilai);
}

/** Seperti `keNumber`, tapi null/undefined menjadi 0 — untuk kolom berjumlah. */
export function keNumberAtauNol(nilai: bigint | null | undefined): number {
  return keNumber(nilai) ?? 0;
}

/**
 * `number` dari klien → BIGINT database.
 *
 * MENOLAK pecahan alih-alih membulatkannya. Pembulatan diam-diam di sini
 * berarti kasir mengetik 50.000,50 dan sistem menyimpan 50.000 tanpa
 * memberitahu siapa pun — lalu selisihnya muncul saat penutupan shift sebagai
 * misteri. Yang benar adalah menolak di perbatasan, tempat pengirimnya masih
 * bisa diberi tahu.
 */
export function keBigInt(nilai: number): bigint {
  if (!Number.isFinite(nilai)) {
    throw new RupiahError(`Nilai rupiah bukan bilangan: ${nilai}`);
  }
  if (!Number.isInteger(nilai)) {
    throw new RupiahError(`Rupiah harus bilangan bulat (tanpa sen): ${nilai}`);
  }
  if (Math.abs(nilai) > Number.MAX_SAFE_INTEGER) {
    throw new RupiahError(`Nilai rupiah di luar jangkauan aman: ${nilai}`);
  }
  return BigInt(nilai);
}

/**
 * Decimal(12,2) tabel lama → rupiah bulat.
 *
 * Dibulatkan ke bilangan terdekat, BUKAN dipotong. Harga menu yang tersimpan
 * sebagai 15000.00 tidak bermasalah, tapi nilai yang lahir dari perkalian
 * (mis. diskon persentase yang kelak ditambahkan) bisa menjadi 14999.999999;
 * memotongnya menghasilkan 14.999 — selisih satu rupiah yang muncul di setiap
 * baris dan menumpuk di total.
 */
export function dariDecimal(nilai: Prisma.Decimal | number | null | undefined): bigint {
  if (nilai === null || nilai === undefined) return 0n;
  const angka = typeof nilai === 'number' ? nilai : Number(nilai);
  if (!Number.isFinite(angka)) {
    throw new RupiahError(`Decimal tidak bisa dibaca sebagai angka: ${String(nilai)}`);
  }
  return BigInt(Math.round(angka));
}

/** Rupiah bulat → Decimal, untuk menulis ke kolom-kolom lama. */
export function keDecimal(nilai: bigint | number): Prisma.Decimal {
  const angka = typeof nilai === 'bigint' ? keNumber(nilai) : nilai;
  return new Prisma.Decimal(angka ?? 0);
}

/**
 * Jumlahkan daftar rupiah tanpa pernah keluar dari BigInt.
 *
 * Menjumlahkan lewat `number` lebih dulu (mis. `arr.reduce((a,b)=>a+Number(b))`)
 * akan kehilangan ketelitian pada total yang besar — dan total kas justru
 * satu-satunya angka yang harus tepat sampai rupiah terakhir.
 */
export function jumlah(nilai: Iterable<bigint>): bigint {
  let total = 0n;
  for (const n of nilai) total += n;
  return total;
}

/**
 * Format rupiah untuk struk & laporan: `Rp 1.250.000`.
 *
 * Tanpa desimal dan tanpa `Intl.NumberFormat` — yang terakhir bergantung pada
 * locale data yang bisa berbeda antara mesin pengembang dan VPS, dan struk yang
 * mencetak `Rp 1,250,000` di produksi tapi `Rp 1.250.000` saat diuji adalah
 * jenis perbedaan yang baru ketahuan setelah kertasnya keluar.
 */
export function formatRupiah(nilai: bigint | number): string {
  const angka = typeof nilai === 'bigint' ? (keNumber(nilai) ?? 0) : nilai;
  const negatif = angka < 0;
  const digit = Math.abs(Math.trunc(angka)).toString();
  const dikelompokkan = digit.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negatif ? '-' : ''}Rp ${dikelompokkan}`;
}
