/** Format angka dengan pemisah ribuan gaya Indonesia, contoh: 25000 -> "25.000". */
export function formatThousands(amount: number): string {
  return new Intl.NumberFormat('id-ID').format(amount);
}

/**
 * Ambil nilai numerik dari input harga yang diketik pengguna ("Rp 25.000",
 * "25000", "25.000" → 25000). Mengembalikan `null` bila tidak ada angka sama
 * sekali, sehingga pemanggil bisa membedakan "kosong" dari nol.
 */
export function parseAmountInput(raw: string): number | null {
  const digits = raw.replace(/\D/g, '');
  if (digits === '') return null;
  return Number(digits);
}

/** Format angka Rupiah, contoh: 25000 -> "Rp 25.000". */
export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Rupiah ringkas untuk label sumbu grafik: 150000 → "150rb", 1500000 → "1,5jt".
 *
 * Sumbu Y grafik hanya selebar beberapa karakter; angka penuh ("Rp 1.500.000")
 * akan memakan badan grafik itu sendiri. Nilai lengkapnya tetap muncul di
 * tooltip, jadi tidak ada informasi yang benar-benar hilang.
 */
export function formatRupiahSingkat(amount: number): string {
  const ringkas = (nilai: number, satuan: string) =>
    `${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(
      Math.round(nilai * 10) / 10,
    )}${satuan}`;

  const angka = Math.abs(amount);
  if (angka >= 1_000_000_000) return ringkas(amount / 1_000_000_000, 'm');
  if (angka >= 1_000_000) return ringkas(amount / 1_000_000, 'jt');
  if (angka >= 1_000) return ringkas(amount / 1_000, 'rb');
  return formatThousands(amount);
}
