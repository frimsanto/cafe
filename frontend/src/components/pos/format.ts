import type { StatusAbsensi } from '../../types/pos';

/** Label Indonesia untuk status absensi — cerminan `lib/shiftStatus.ts` backend. */
export const LABEL_STATUS_ABSENSI: Record<StatusAbsensi, string> = {
  SCHEDULED: 'Dijadwalkan',
  PRESENT: 'Hadir',
  LATE: 'Terlambat',
  PERMISSION: 'Izin',
  SICK: 'Sakit',
  ABSENT: 'Tidak Hadir',
  REPLACED: 'Digantikan',
  OVERTIME: 'Lembur',
  EARLY_LEAVE: 'Pulang Awal',
  COMPLETED: 'Selesai',
};

/** Status yang menuntut perhatian pemilik — diberi warna, bukan sekadar teks. */
export const STATUS_PERLU_PERHATIAN = new Set<StatusAbsensi>([
  'LATE',
  'ABSENT',
  'EARLY_LEAVE',
]);

/**
 * Jam `HH.MM` menurut peramban terminal.
 *
 * Sengaja memakai waktu peramban, bukan zona kafe: yang dibaca kasir adalah
 * "sekarang jam berapa di sini", dan terminal memang berdiri di kafe itu.
 * Laporan pemilik — yang bisa dibuka dari mana saja — memakai zona kafe dan
 * dihitung backend.
 */
export function jamSingkat(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

/** Tanggal pendek `5 Mar`. */
export function tanggalSingkat(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

/** Durasi menit → `8j 15m`. */
export function durasiSingkat(menit: number | null | undefined): string {
  if (menit === null || menit === undefined) return '—';
  const jam = Math.floor(menit / 60);
  const sisa = menit % 60;
  return jam > 0 ? `${jam}j ${sisa}m` : `${sisa}m`;
}

/** Kunci tanggal `YYYY-MM-DD` untuk parameter API. */
export function kunciTanggal(d: Date): string {
  const bulan = String(d.getMonth() + 1).padStart(2, '0');
  const hari = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${bulan}-${hari}`;
}

/** Kunci tanggal `hari` hari dari sekarang (negatif = ke belakang). */
export function kunciGeser(hari: number): string {
  const d = new Date();
  d.setDate(d.getDate() + hari);
  return kunciTanggal(d);
}
