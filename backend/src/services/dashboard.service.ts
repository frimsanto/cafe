import { prisma } from '../lib/prisma';
import {
  growthPercent,
  resolvePeriod,
  type DateRange,
  type RevenuePeriod,
} from '../lib/period';
import {
  toWidgetPreferences,
  type WidgetPreferences,
} from '../validation/dashboard.validation';

export interface RevenueSummaryDTO {
  period: RevenuePeriod;
  from: string;
  to: string;
  revenue: number;
  orderCount: number;
  previous: {
    revenue: number;
    orderCount: number;
  };
  /** Pertumbuhan omzet vs periode sebelumnya (persen); null bila tak ada dasar. */
  growthPercent: number | null;
}

export interface TopMenuItemDTO {
  menuItemId: string;
  name: string;
  imageUrl: string;
  /** Jumlah porsi terjual pada periode. */
  soldCount: number;
}

export const dashboardService = {
  /**
   * Ringkasan omzet satu kafe untuk periode tertentu.
   *
   * Hanya pesanan yang pembayarannya SUKSES yang dihitung sebagai omzet —
   * pesanan yang masih menunggu pembayaran tidak boleh menaikkan angka.
   * Seluruh query dibatasi `cafeId` (isolasi tenant).
   */
  async getRevenueSummary(
    cafeId: string,
    period: RevenuePeriod,
  ): Promise<RevenueSummaryDTO> {
    const { current, previous } = resolvePeriod(period);

    const aggregateRange = async (range: DateRange) => {
      const result = await prisma.order.aggregate({
        where: {
          cafeId,
          // Omzet dihitung saat uang DITERIMA, bukan saat pesanan dibuat —
          // pesanan lintas tengah malam kini masuk ke hari yang benar.
          paidAt: { gte: range.from, lt: range.to },
          payment: { status: 'SUCCESS' },
        },
        _sum: { totalAmount: true },
        _count: { _all: true },
      });
      return {
        revenue: Number(result._sum.totalAmount ?? 0),
        orderCount: result._count._all,
      };
    };

    const [now, before] = await Promise.all([
      aggregateRange(current),
      aggregateRange(previous),
    ]);

    return {
      period,
      from: current.from.toISOString(),
      to: current.to.toISOString(),
      revenue: now.revenue,
      orderCount: now.orderCount,
      previous: before,
      growthPercent: growthPercent(now.revenue, before.revenue),
    };
  },

  /**
   * Menu terlaris pada periode tertentu: total porsi terjual per item, diambil
   * hanya dari pesanan yang sudah LUNAS dan milik kafe ini.
   *
   * Nama & foto diambil dari katalog menu saat ini; item yang sudah dihapus
   * tetap muncul dengan penanda agar angkanya tidak hilang dari laporan.
   */
  async getTopMenu(
    cafeId: string,
    period: RevenuePeriod,
    limit: number,
  ): Promise<TopMenuItemDTO[]> {
    const { current } = resolvePeriod(period);

    const grouped = await prisma.orderItem.groupBy({
      by: ['menuItemId'],
      where: {
        order: {
          cafeId,
          // Sama seperti omzet: periode mengikuti waktu pembayaran.
          paidAt: { gte: current.from, lt: current.to },
          payment: { status: 'SUCCESS' },
        },
      },
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: limit,
    });

    if (grouped.length === 0) return [];

    const menuItems = await prisma.menuItem.findMany({
      where: { id: { in: grouped.map((g) => g.menuItemId) }, cafeId },
      select: { id: true, name: true, imageUrl: true },
    });
    const byId = new Map(menuItems.map((m) => [m.id, m]));

    return grouped.map((row) => {
      const item = byId.get(row.menuItemId);
      return {
        menuItemId: row.menuItemId,
        name: item?.name ?? 'Menu tidak tersedia',
        imageUrl: item?.imageUrl ?? '',
        soldCount: row._sum.quantity ?? 0,
      };
    });
  },

  /**
   * Preferensi tampilan dasbor milik SATU pengguna. Belum pernah disimpan →
   * kembalikan peta kosong; klien memakai nilai bawaannya sendiri.
   */
  async getPreferences(cafeId: string, userId: string): Promise<WidgetPreferences> {
    const pref = await prisma.dashboardPreference.findFirst({
      where: { userId, cafeId },
      select: { widgets: true },
    });
    return pref ? toWidgetPreferences(pref.widgets) : {};
  },

  /**
   * Simpan preferensi pengguna (idempoten). `userId` & `cafeId` berasal dari
   * token, bukan dari body — pengguna tidak bisa menulis preferensi orang lain.
   */
  async savePreferences(
    cafeId: string,
    userId: string,
    widgets: WidgetPreferences,
  ): Promise<WidgetPreferences> {
    const saved = await prisma.dashboardPreference.upsert({
      where: { userId },
      create: { userId, cafeId, widgets },
      update: { cafeId, widgets },
      select: { widgets: true },
    });
    return toWidgetPreferences(saved.widgets);
  },
};
