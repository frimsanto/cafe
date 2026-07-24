import type {
  RingkasanAplikasi,
  RingkasanPendapatan,
  StatistikTenant,
} from '../types/dashboard'
import {
  mockRingkasanAplikasi,
  mockRingkasanPendapatan,
  mockStatistikTenant,
} from '../mocks/dashboard'

/**
 * Titik tukar frontend <-> backend.
 *
 * Selama layer backend belum ada, fungsi ini mengembalikan data tiruan.
 * Saat endpoint `GET /api/dashboard/pendapatan` sudah jadi, cukup ganti isi
 * fungsi ini dengan `fetch` — komponen tidak perlu diubah karena bentuk
 * datanya sudah dikunci di `types/dashboard.ts`.
 */
export async function ambilRingkasanPendapatan(): Promise<RingkasanPendapatan> {
  await jeda(450)
  return mockRingkasanPendapatan
}

/** Nanti: `GET /api/dashboard/tenant`. */
export async function ambilStatistikTenant(): Promise<StatistikTenant> {
  await jeda(450)
  return mockStatistikTenant
}

/** Nanti: `GET /api/dashboard/aplikasi`. */
export async function ambilRingkasanAplikasi(): Promise<RingkasanAplikasi> {
  await jeda(450)
  return mockRingkasanAplikasi
}

function jeda(milidetik: number): Promise<void> {
  return new Promise((selesai) => setTimeout(selesai, milidetik))
}
