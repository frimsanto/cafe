import type { KitchenStatus } from '../types/order';

interface KitchenStatusMeta {
  label: string;
  /** Ikon pendek — dikenali sekejap tanpa perlu membaca labelnya. */
  icon: string;
  /** Kelas untuk badge (kontras tinggi di latar gelap dapur). */
  badgeClass: string;
  /**
   * Kelas badge untuk layar TERANG — halaman status pelanggan.
   *
   * Varian dapur memakai warna terang di atas latar gelap (`text-amber-300`);
   * di atas kertas putih warna itu nyaris tak terbaca. Versi ini dibalik:
   * teks pekat di atas latar lembut, supaya tetap jelas dibaca dari jauh dan
   * di bawah matahari.
   */
  badgeTerangClass: string;
  /** Warna aksen untuk penanda samping item row. */
  accentClass: string;
  /** Status berikutnya saat chef menekan item (dipakai task update status). */
  next: KitchenStatus | null;
}

export const KITCHEN_STATUS_META: Record<KitchenStatus, KitchenStatusMeta> = {
  WAITING: {
    label: 'Menunggu',
    icon: '⏳',
    badgeClass: 'bg-amber-400/20 text-amber-300 ring-1 ring-amber-400/40',
    badgeTerangClass: 'bg-amber-100 text-amber-800 ring-1 ring-amber-300',
    accentClass: 'bg-amber-400',
    next: 'COOKING',
  },
  COOKING: {
    label: 'Dimasak',
    icon: '🍳',
    badgeClass: 'bg-sky-400/20 text-sky-300 ring-1 ring-sky-400/40',
    badgeTerangClass: 'bg-sky-100 text-sky-800 ring-1 ring-sky-300',
    accentClass: 'bg-sky-400',
    next: 'READY',
  },
  READY: {
    label: 'Siap',
    icon: '✅',
    badgeClass: 'bg-emerald-400/20 text-emerald-300 ring-1 ring-emerald-400/40',
    badgeTerangClass: 'bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300',
    accentClass: 'bg-emerald-500',
    next: null,
  },
};
