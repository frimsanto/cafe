import type {
  RingkasanAplikasi,
  RingkasanPendapatan,
  StatistikTenant,
} from '../types/dashboard'

/** Id aplikasi dipakai bersama oleh data pendapatan, tenant, dan status app. */
const APP_CAFEOS = '8f1b4c2e-0a6d-4d31-9f77-2b5c1e9a4d10'
const APP_BILLIARDOS = 'c37a9e51-6b28-4f0c-8d94-71e3a5b0c6f2'
const APP_LAUNDRYOS = '5d20b8a7-3c14-49e6-b0a8-9f6d2c4e7b31'

/**
 * Data tiruan untuk layer frontend.
 *
 * Angka disusun menyerupai kondisi nyata platform: CafeOS sudah live lebih
 * dulu sehingga porsinya lebih besar, BilliardOS menyusul. Mei 2026 sengaja
 * dibuat sebagai puncak dan Juni turun, supaya label "nilai tertinggi" dan
 * label "bulan terakhir" pada grafik jatuh di kolom yang berbeda.
 *
 * Dihapus/diganti pemanggilan `fetch` saat task backend dikerjakan.
 */
export const mockRingkasanPendapatan: RingkasanPendapatan = {
  totalPendapatan: 143_550_000,
  pendapatanBulanIni: 15_600_000,
  pendapatanBulanLalu: 14_850_000,
  jumlahPembayaranBulanIni: 33,
  jumlahTenantAktif: 33,
  periodeBerjalan: '2026-07',
  tren: [
    { periode: '2025-08', nominal: 4_350_000 },
    { periode: '2025-09', nominal: 5_100_000 },
    { periode: '2025-10', nominal: 5_850_000 },
    { periode: '2025-11', nominal: 6_300_000 },
    { periode: '2025-12', nominal: 7_950_000 },
    { periode: '2026-01', nominal: 8_400_000 },
    { periode: '2026-02', nominal: 9_150_000 },
    { periode: '2026-03', nominal: 10_650_000 },
    { periode: '2026-04', nominal: 11_400_000 },
    { periode: '2026-05', nominal: 16_200_000 },
    { periode: '2026-06', nominal: 14_850_000 },
    { periode: '2026-07', nominal: 15_600_000 },
  ],
  perAplikasi: [
    {
      appId: APP_CAFEOS,
      nama: 'CafeOS',
      slug: 'cafeos',
      nominal: 10_800_000,
      jumlahTenantAktif: 24,
    },
    {
      appId: APP_BILLIARDOS,
      nama: 'BilliardOS',
      slug: 'billiardos',
      nominal: 4_800_000,
      jumlahTenantAktif: 9,
    },
  ],
}

/**
 * Statistik tenant tiruan.
 *
 * Angka dijaga konsisten dengan `mockRingkasanPendapatan`: 33 tenant aktif
 * (CafeOS 24 + BilliardOS 9), dan komposisi status berjumlah 41 = totalTenant.
 */
export const mockStatistikTenant: StatistikTenant = {
  totalTenant: 41,
  tenantAktif: 33,
  tenantBaruBulanIni: 4,
  tenantBaruBulanLalu: 3,
  periodeBerjalan: '2026-07',
  komposisiStatus: [
    { status: 'AKTIF', jumlah: 33 },
    { status: 'TRIAL', jumlah: 5 },
    { status: 'SUSPENDED', jumlah: 1 },
    { status: 'EXPIRED', jumlah: 2 },
  ],
  perAplikasi: [
    {
      appId: APP_CAFEOS,
      nama: 'CafeOS',
      slug: 'cafeos',
      jumlahTenant: 29,
      jumlahTenantAktif: 24,
    },
    {
      appId: APP_BILLIARDOS,
      nama: 'BilliardOS',
      slug: 'billiardos',
      jumlahTenant: 12,
      jumlahTenantAktif: 9,
    },
  ],
}

/**
 * Status aplikasi tiruan.
 *
 * LaundryOS sengaja dibuat nonaktif dan tanpa tenant — mewakili aplikasi yang
 * sudah didaftarkan tapi belum dirilis, sekaligus supaya tampilan status
 * "nonaktif" ikut teruji. Jumlah tenant aktifnya konsisten dengan
 * `mockStatistikTenant` (24 + 9 + 0 = 33).
 */
export const mockRingkasanAplikasi: RingkasanAplikasi = {
  totalAplikasi: 3,
  aplikasiBerjalan: 2,
  daftar: [
    {
      appId: APP_CAFEOS,
      nama: 'CafeOS',
      slug: 'cafeos',
      aktif: true,
      domain: 'cafe.fessolution.my.id',
      jumlahTenantAktif: 24,
      tanggalRilis: '2025-08-01',
    },
    {
      appId: APP_BILLIARDOS,
      nama: 'BilliardOS',
      slug: 'billiardos',
      aktif: true,
      domain: 'billiard.fessolution.my.id',
      jumlahTenantAktif: 9,
      tanggalRilis: '2026-02-15',
    },
    {
      appId: APP_LAUNDRYOS,
      nama: 'LaundryOS',
      slug: 'laundryos',
      aktif: false,
      domain: 'laundry.fessolution.my.id',
      jumlahTenantAktif: 0,
      tanggalRilis: '2026-07-10',
    },
  ],
}
