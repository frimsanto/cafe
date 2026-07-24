import type { KitchenStatus } from '../types/order';

interface KitchenStatusMeta {
  label: string;
  /** Kelas untuk badge (kontras tinggi di latar gelap dapur). */
  badgeClass: string;
  /** Warna aksen untuk penanda samping item row. */
  accentClass: string;
  /** Status berikutnya saat chef menekan item (dipakai task update status). */
  next: KitchenStatus | null;
}

export const KITCHEN_STATUS_META: Record<KitchenStatus, KitchenStatusMeta> = {
  WAITING: {
    label: 'Menunggu',
    badgeClass: 'bg-amber-400/20 text-amber-300 ring-1 ring-amber-400/40',
    accentClass: 'bg-amber-400',
    next: 'COOKING',
  },
  COOKING: {
    label: 'Dimasak',
    badgeClass: 'bg-sky-400/20 text-sky-300 ring-1 ring-sky-400/40',
    accentClass: 'bg-sky-400',
    next: 'READY',
  },
  READY: {
    label: 'Siap',
    badgeClass: 'bg-emerald-400/20 text-emerald-300 ring-1 ring-emerald-400/40',
    accentClass: 'bg-emerald-400',
    next: null,
  },
};
