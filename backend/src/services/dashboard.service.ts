import { prisma } from '../lib/prisma';
import {
  growthPercent,
  hariTerakhir,
  jumlahHariTren,
  kunciTanggal,
  resolvePeriod,
  type DateRange,
  type RevenuePeriod,
  type TrendPeriod,
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


/** Satu batang pada grafik tren — selalu ada, meski omzetnya nol. */
export interface RevenueTrendPointDTO {
  /** Tanggal lokal `YYYY-MM-DD`. */
  date: string;
  /** Label sumbu X: nama hari (7d) atau `DD/MM` (30d). */
  label: string;
  totalRevenue: number;
  totalOrders: number;
}

export interface RevenueTrendDTO {
  period: TrendPeriod;
  trend: RevenueTrendPointDTO[];
  summary: {
    todayRevenue: number;
    todayOrders: number;
    yesterdayRevenue: number;
    yesterdayOrders: number;
    /** Positif = naik, negatif = turun; null bila kemarin nol. */
    todayVsYesterdayPercent: number | null;
  };
}

/**
 * Nama hari, diindeks `Date.getDay()` (0 = Minggu).
 *
 * Ditulis tetap alih-alih lewat `Intl`: hasil `Intl` bergantung pada data ICU
 * yang dibundel Node, dan label sumbu grafik tidak boleh berubah hanya karena
 * server dipasang dengan build Node yang berbeda.
 */
const NAMA_HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

function labelHari(tanggal: Date, period: TrendPeriod): string {
  if (period === '7d') return NAMA_HARI[tanggal.getDay()];
  const hari = String(tanggal.getDate()).padStart(2, '0');
  const bulan = String(tanggal.getMonth() + 1).padStart(2, '0');
  return `${hari}/${bulan}`;
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
   * Omzet harian untuk grafik tren — 7 atau 30 hari terakhir, termasuk hari ini.
   *
   * Dasarnya sama persis dengan `getRevenueSummary`: `paidAt` + pembayaran
   * SUKSES, bukan `createdAt` + status pesanan. Ini bukan detail sepele — kalau
   * grafik memakai waktu pesanan DIBUAT sementara kartu omzet di atasnya
   * memakai waktu uang DITERIMA, keduanya akan menampilkan angka berbeda untuk
   * hari yang sama dan pemilik tidak punya cara tahu mana yang benar.
   *
   * Seluruh hari dalam rentang selalu muncul, termasuk yang tidak ada
   * transaksinya (nol) — grafik yang melompati hari sepi membuat akhir pekan
   * yang kosong terlihat seperti hari yang laris.
   */
  async getRevenueTrend(
    cafeId: string,
    period: TrendPeriod,
  ): Promise<RevenueTrendDTO> {
    const hari = hariTerakhir(jumlahHariTren(period));
    const awal = hari[0].from;
    const akhir = hari[hari.length - 1].to;

    // Satu query untuk seluruh rentang, lalu dikelompokkan di sini.
    // `groupBy` Prisma tidak bisa memotong timestamp menjadi tanggal, dan
    // memakai SQL mentah akan menaruh aturan zona waktu di tempat kedua yang
    // harus ikut diubah setiap kali definisi "hari" bergeser.
    const orders = await prisma.order.findMany({
      where: {
        cafeId,
        paidAt: { gte: awal, lt: akhir },
        payment: { status: 'SUCCESS' },
      },
      select: { paidAt: true, totalAmount: true },
    });

    const ember = new Map(
      hari.map((h) => [h.kunci, { totalRevenue: 0, totalOrders: 0 }]),
    );

    for (const order of orders) {
      // `paidAt` pasti terisi — ia yang dipakai menyaring di atas.
      const slot = ember.get(kunciTanggal(order.paidAt!));
      if (!slot) continue;
      slot.totalRevenue += Number(order.totalAmount);
      slot.totalOrders += 1;
    }

    const trend: RevenueTrendPointDTO[] = hari.map((h) => {
      const slot = ember.get(h.kunci)!;
      return {
        date: h.kunci,
        label: labelHari(h.from, period),
        totalRevenue: slot.totalRevenue,
        totalOrders: slot.totalOrders,
      };
    });

    // Hari ini & kemarin selalu ada di dalam rentang (minimal 7 hari), jadi
    // ringkasannya dibaca dari ember yang sudah dihitung — tanpa query kedua.
    const hariIni = trend[trend.length - 1];
    const kemarin = trend[trend.length - 2];

    return {
      period,
      trend,
      summary: {
        todayRevenue: hariIni.totalRevenue,
        todayOrders: hariIni.totalOrders,
        yesterdayRevenue: kemarin.totalRevenue,
        yesterdayOrders: kemarin.totalOrders,
        todayVsYesterdayPercent: growthPercent(
          hariIni.totalRevenue,
          kemarin.totalRevenue,
        ),
      },
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
