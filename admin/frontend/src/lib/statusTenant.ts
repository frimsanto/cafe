import type { StatusTenant } from '../types/dashboard'

interface RupaStatus {
  label: string
  /** Token status dari palet — tidak pernah dipakai untuk warna seri biasa. */
  warna: string
  keterangan: string
}

/**
 * Status tenant adalah *keadaan*, bukan identitas, jadi warnanya diambil dari
 * palet status (good / warning / serious / critical) — bukan dari slot warna
 * kategorikal. Setiap kemunculan warna selalu ditemani label teks, sehingga
 * artinya tidak pernah bergantung pada warna saja.
 */
export const RUPA_STATUS: Record<StatusTenant, RupaStatus> = {
  AKTIF: {
    label: 'Aktif',
    warna: 'var(--status-good)',
    keterangan: 'Langganan berjalan dan sudah dibayar',
  },
  TRIAL: {
    label: 'Trial',
    warna: 'var(--status-warning)',
    keterangan: 'Masa coba gratis, belum membayar',
  },
  SUSPENDED: {
    label: 'Suspended',
    warna: 'var(--status-serious)',
    keterangan: 'Dinonaktifkan manual oleh super admin',
  },
  EXPIRED: {
    label: 'Expired',
    warna: 'var(--status-critical)',
    keterangan: 'Masa aktif habis, menunggu perpanjangan',
  },
}

/**
 * Urutan tampil dari kondisi paling sehat ke paling perlu ditindak.
 * Urutan ini tetap, tidak mengikuti besar-kecilnya angka, supaya posisi dan
 * warna sebuah status tidak berpindah saat datanya berubah.
 */
export const URUTAN_STATUS: StatusTenant[] = ['AKTIF', 'TRIAL', 'SUSPENDED', 'EXPIRED']
