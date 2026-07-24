/**
 * Kontrak API Dashboard — Ringkasan Pendapatan.
 *
 * Layer frontend dikerjakan lebih dulu, jadi tipe di bawah ini adalah
 * KONTRAK yang diasumsikan dan nanti harus dipenuhi backend Express
 * (port 4002) pada endpoint:
 *
 *   GET /api/dashboard/pendapatan
 *
 * Semua nominal dalam Rupiah penuh (integer, tanpa desimal).
 */

/** Satu titik pada tren pendapatan bulanan. */
export interface TitikTrenPendapatan {
  /** Periode bulan dalam format `YYYY-MM`, mis. "2026-07". */
  periode: string
  /** Total pendapatan pada bulan tersebut, seluruh aplikasi. */
  nominal: number
}

/** Rekap pendapatan untuk satu aplikasi SaaS. */
export interface PendapatanAplikasi {
  appId: string
  /** Nama tampil, mis. "CafeOS". */
  nama: string
  /** Identifier unik, mis. "cafeos". */
  slug: string
  /** Pendapatan aplikasi ini pada bulan berjalan. */
  nominal: number
  jumlahTenantAktif: number
}

/** Payload lengkap `GET /api/dashboard/pendapatan`. */
export interface RingkasanPendapatan {
  /** Akumulasi seluruh pembayaran yang pernah masuk, semua aplikasi. */
  totalPendapatan: number
  /** Bulan berjalan (belum tentu selesai). */
  pendapatanBulanIni: number
  /** Bulan kalender sebelumnya, untuk perbandingan. */
  pendapatanBulanLalu: number
  /** Jumlah pembayaran yang dikonfirmasi pada bulan berjalan. */
  jumlahPembayaranBulanIni: number
  /** Total tenant berstatus AKTIF saat ini, seluruh aplikasi. */
  jumlahTenantAktif: number
  /** Periode bulan berjalan dalam format `YYYY-MM`. */
  periodeBerjalan: string
  /** 12 bulan terakhir, urut dari paling lama ke paling baru. */
  tren: TitikTrenPendapatan[]
  /** Rincian pendapatan bulan berjalan per aplikasi. */
  perAplikasi: PendapatanAplikasi[]
}

/* -------------------------------------------------------------------------
 * GET /api/dashboard/tenant — statistik tenant
 * ---------------------------------------------------------------------- */

/** Status langganan tenant; sama persis dengan enum di tabel `tenants`. */
export type StatusTenant = 'TRIAL' | 'AKTIF' | 'SUSPENDED' | 'EXPIRED'

/** Jumlah tenant pada satu status. */
export interface JumlahPerStatus {
  status: StatusTenant
  jumlah: number
}

/** Sebaran tenant untuk satu aplikasi SaaS. */
export interface TenantAplikasi {
  appId: string
  nama: string
  slug: string
  /** Seluruh tenant aplikasi ini, apa pun statusnya. */
  jumlahTenant: number
  jumlahTenantAktif: number
}

/** Payload lengkap `GET /api/dashboard/tenant`. */
export interface StatistikTenant {
  /** Seluruh tenant terdaftar, apa pun statusnya. */
  totalTenant: number
  /** Tenant berstatus AKTIF saat ini. */
  tenantAktif: number
  /** Tenant yang mendaftar pada bulan berjalan. */
  tenantBaruBulanIni: number
  /** Tenant baru bulan kalender sebelumnya, untuk perbandingan. */
  tenantBaruBulanLalu: number
  /** Periode bulan berjalan dalam format `YYYY-MM`. */
  periodeBerjalan: string
  /** Sebaran tenant per status; jumlahnya harus sama dengan `totalTenant`. */
  komposisiStatus: JumlahPerStatus[]
  /** Sebaran tenant per aplikasi. */
  perAplikasi: TenantAplikasi[]
}

/* -------------------------------------------------------------------------
 * GET /api/dashboard/aplikasi — status aplikasi yang dikelola
 * ---------------------------------------------------------------------- */

/** Satu aplikasi SaaS beserta kondisinya saat ini. */
export interface StatusAplikasi {
  appId: string
  nama: string
  slug: string
  /** Kolom `status` pada tabel `apps`: aktif berarti melayani tenant. */
  aktif: boolean
  /** Domain produksi aplikasi, mis. "cafe.fessolution.my.id". */
  domain: string
  jumlahTenantAktif: number
  /** Tanggal aplikasi mulai dikelola platform, format ISO 8601 (`YYYY-MM-DD`). */
  tanggalRilis: string
}

/** Payload lengkap `GET /api/dashboard/aplikasi`. */
export interface RingkasanAplikasi {
  /** Seluruh aplikasi terdaftar, aktif maupun tidak. */
  totalAplikasi: number
  /** Aplikasi yang berstatus aktif saat ini. */
  aplikasiBerjalan: number
  daftar: StatusAplikasi[]
}
