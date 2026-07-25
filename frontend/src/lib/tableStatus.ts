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
    badgeClass: 'bg-warm-espresso/5 text-warm-muted',
    dotClass: 'bg-warm-muted',
  },
  DIGUNAKAN: {
    label: 'Digunakan',
    badgeClass: 'bg-warm-success/10 text-warm-success',
    dotClass: 'bg-warm-success',
  },
};
