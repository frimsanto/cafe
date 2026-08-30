export type RevenuePeriod = 'today' | 'week' | 'month';

export const REVENUE_PERIODS: RevenuePeriod[] = ['today', 'week', 'month'];

export interface DateRange {
  from: Date;
  to: Date;
}

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Awal minggu (Senin) — konvensi kalender Indonesia. */
function startOfWeek(date: Date): Date {
  const d = startOfDay(date);
  const day = d.getDay(); // 0 = Minggu
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  return d;
}

function startOfMonth(date: Date): Date {
  const d = startOfDay(date);
  d.setDate(1);
  return d;
}

/**
 * Rentang waktu periode berjalan dan periode pembanding sebelumnya
 * (kemarin / minggu lalu / bulan lalu) untuk menghitung pertumbuhan.
 */
export function resolvePeriod(
  period: RevenuePeriod,
  now: Date = new Date(),
): { current: DateRange; previous: DateRange } {
  if (period === 'today') {
    const from = startOfDay(now);
    const prevFrom = new Date(from);
    prevFrom.setDate(prevFrom.getDate() - 1);
    return {
      current: { from, to: now },
      previous: { from: prevFrom, to: from },
    };
  }

  if (period === 'week') {
    const from = startOfWeek(now);
    const prevFrom = new Date(from);
    prevFrom.setDate(prevFrom.getDate() - 7);
    return {
      current: { from, to: now },
      previous: { from: prevFrom, to: from },
    };
  }

  const from = startOfMonth(now);
  const prevFrom = new Date(from);
  prevFrom.setMonth(prevFrom.getMonth() - 1);
  return {
    current: { from, to: now },
    previous: { from: prevFrom, to: from },
  };
}

/** Persentase pertumbuhan; null bila pembanding nol. */
export function growthPercent(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

// ── Tren omzet harian ────────────────────────────────────────────────────────

export type TrendPeriod = '7d' | '30d';

export const TREND_PERIODS: TrendPeriod[] = ['7d', '30d'];

/** Banyaknya hari yang ditampilkan tiap periode — termasuk hari ini. */
const TREND_DAYS: Record<TrendPeriod, number> = { '7d': 7, '30d': 30 };

export function jumlahHariTren(period: TrendPeriod): number {
  return TREND_DAYS[period];
}

export interface HariKalender extends DateRange {
  /** Tanggal lokal `YYYY-MM-DD` — kunci pengelompokan sekaligus nilai di API. */
  kunci: string;
}

/**
 * Tanggal lokal sebagai `YYYY-MM-DD`.
 *
 * Sengaja dirakit dari komponen lokal, BUKAN `toISOString()`: yang terakhir
 * selalu memakai UTC, sehingga pesanan pukul 23.00 WIB akan tercatat pada
 * tanggal berikutnya dan omzetnya lompat ke hari yang salah.
 */
export function kunciTanggal(date: Date): string {
  const bulan = String(date.getMonth() + 1).padStart(2, '0');
  const hari = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${bulan}-${hari}`;
}

/**
 * Deret `jumlah` hari terakhir yang berakhir HARI INI, urut menaik.
 *
 * Dibangun dengan `setDate` supaya pergantian bulan & tahun terurus sendiri
 * oleh Date — mengurangi 24 jam secara manual akan meleset pada bulan yang
 * berbeda panjangnya.
 */
export function hariTerakhir(jumlah: number, now: Date = new Date()): HariKalender[] {
  const hariIni = startOfDay(now);
  const hasil: HariKalender[] = [];

  for (let mundur = jumlah - 1; mundur >= 0; mundur -= 1) {
    const from = new Date(hariIni);
    from.setDate(from.getDate() - mundur);
    const to = new Date(from);
    to.setDate(to.getDate() + 1);
    hasil.push({ from, to, kunci: kunciTanggal(from) });
  }

  return hasil;
}
