/**
 * Batas atas sumbu Y yang "bulat" (1 / 2 / 2,5 / 5 / 10 x pangkat sepuluh),
 * sehingga tick-nya jatuh di angka yang enak dibaca.
 */
export function batasAtasBulat(nilaiTertinggi: number): number {
  if (nilaiTertinggi <= 0) return 1
  const pangkat = 10 ** Math.floor(Math.log10(nilaiTertinggi))
  const rasio = nilaiTertinggi / pangkat
  const langkah = rasio <= 1 ? 1 : rasio <= 2 ? 2 : rasio <= 2.5 ? 2.5 : rasio <= 5 ? 5 : 10
  return langkah * pangkat
}

/**
 * Skala sumbu Y untuk grafik kolom: batas atas bulat plus ruang kepala ~8%,
 * supaya label langsung di atas kolom tertinggi tidak menabrak tepi plot.
 */
export function skalaSumbu(nilaiTertinggi: number, jumlahTick = 5) {
  const batasAtas = batasAtasBulat(nilaiTertinggi * 1.08)
  const tick = Array.from(
    { length: jumlahTick },
    (_, indeks) => (batasAtas / (jumlahTick - 1)) * indeks,
  )
  return { batasAtas, tick }
}

/** Persentase tinggi/panjang sebuah mark terhadap batas atas skala. */
export function persenDariBatas(nilai: number, batasAtas: number): number {
  if (batasAtas <= 0) return 0
  return Math.max(0, Math.min(100, (nilai / batasAtas) * 100))
}
