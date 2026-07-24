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
