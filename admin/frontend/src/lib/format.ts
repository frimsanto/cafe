const LOCALE = 'id-ID'

const BULAN_PANJANG = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
]

const BULAN_SINGKAT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
]

/** "Rp 15.600.000" — nilai penuh, untuk tabel, tooltip, dan angka utama. */
export function formatRupiah(nilai: number): string {
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(nilai)
}

/** "Rp 15,6 jt" — bentuk ringkas untuk tick sumbu dan label pada mark. */
export function formatRupiahRingkas(nilai: number): string {
  const absolut = Math.abs(nilai)
  if (absolut >= 1_000_000_000) return `Rp ${angkaRingkas(nilai / 1_000_000_000)} M`
  if (absolut >= 1_000_000) return `Rp ${angkaRingkas(nilai / 1_000_000)} jt`
  if (absolut >= 1_000) return `Rp ${angkaRingkas(nilai / 1_000)} rb`
  return formatRupiah(nilai)
}

function angkaRingkas(nilai: number): string {
  // Satu desimal sampai ratusan: tanpa itu 15,6 jt dan 16,2 jt sama-sama
  // dibulatkan jadi "16 jt" dan dua kolom yang berbeda terbaca identik.
  return new Intl.NumberFormat(LOCALE, {
    maximumFractionDigits: Math.abs(nilai) < 100 ? 1 : 0,
  }).format(nilai)
}

/** "1.284" */
export function formatAngka(nilai: number): string {
  return new Intl.NumberFormat(LOCALE).format(nilai)
}

/** "+5,1%" / "-6,1%" — selalu bertanda kecuali nol. */
export function formatPersen(nilai: number): string {
  const angka = new Intl.NumberFormat(LOCALE, {
    maximumFractionDigits: 1,
    signDisplay: 'exceptZero',
  }).format(nilai)
  return `${angka}%`
}

/**
 * Persentase perubahan dari `sebelum` ke `sesudah`.
 * Mengembalikan `null` bila basisnya nol — perubahan tidak terdefinisi dan
 * tidak boleh ditampilkan sebagai "+100%".
 */
export function hitungPerubahan(sesudah: number, sebelum: number): number | null {
  if (sebelum === 0) return null
  return ((sesudah - sebelum) / sebelum) * 100
}

/** "2026-07" -> "Juli 2026" */
export function formatPeriode(periode: string): string {
  const { tahun, indeksBulan } = uraiPeriode(periode)
  return `${BULAN_PANJANG[indeksBulan]} ${tahun}`
}

/** "2026-07" -> "Jul"; bulan Januari ikut membawa tahun ("Jan 26") sebagai penanda pergantian tahun. */
export function labelPeriodeSingkat(periode: string): string {
  const { tahun, indeksBulan } = uraiPeriode(periode)
  const singkat = BULAN_SINGKAT[indeksBulan]
  return indeksBulan === 0 ? `${singkat} ${String(tahun).slice(-2)}` : singkat
}

/** "2026-07" -> "Jul 2026" */
export function labelPeriodeSedang(periode: string): string {
  const { tahun, indeksBulan } = uraiPeriode(periode)
  return `${BULAN_SINGKAT[indeksBulan]} ${tahun}`
}

/** "2025-08-01" -> "1 Agustus 2025" */
export function formatTanggal(iso: string): string {
  const tanggal = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(tanggal.getTime())) return iso
  return new Intl.DateTimeFormat(LOCALE, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(tanggal)
}

function uraiPeriode(periode: string): { tahun: number; indeksBulan: number } {
  const [tahun, bulan] = periode.split('-').map(Number)
  return { tahun, indeksBulan: Math.min(Math.max(bulan - 1, 0), 11) }
}
