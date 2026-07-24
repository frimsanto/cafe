import type { Order } from '../types/order';
import type { TableStatus } from '../types/table';

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

/**
 * Meja dianggap DIGUNAKAN selama masih punya pesanan yang belum selesai —
 * baik yang menunggu dibayar di kasir maupun yang sedang dimasak dapur.
 * Status ini turunan, bukan kolom tersendiri di basis data.
 */
export function occupiedTableIds(activeOrders: Order[]): Set<string> {
  return new Set(
    activeOrders
      .filter((order) => order.status !== 'SELESAI')
      .map((order) => order.tableId),
  );
}

export function tableStatusOf(
  tableId: string,
  occupied: Set<string>,
): TableStatus {
  return occupied.has(tableId) ? 'DIGUNAKAN' : 'KOSONG';
}
