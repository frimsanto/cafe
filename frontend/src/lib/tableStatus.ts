import type { TableStatus } from '../types/table';

// Status pemakaian meja kini dihitung backend (diturunkan dari pesanan yang
// masih berjalan) dan dikirim apa adanya pada tiap meja, jadi klien tidak
// perlu lagi menurunkannya sendiri — yang tersisa hanya pemetaan tampilannya.

interface TableStatusMeta {
  label: string;
  /** Kelas lencana status pada kartu meja. */
  badgeClass: string;
  /** Warna titik penanda di samping label. */
  dotClass: string;
}

export const TABLE_STATUS_META: Record<TableStatus, TableStatusMeta> = {
  KOSONG: {
    label: 'Kosong',
    badgeClass: 'bg-slate-100 text-slate-500',
    dotClass: 'bg-slate-400',
  },
  DIGUNAKAN: {
    label: 'Digunakan',
    badgeClass: 'bg-emerald-50 text-emerald-700',
    dotClass: 'bg-emerald-500',
  },
};
