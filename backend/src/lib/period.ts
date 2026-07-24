export type RevenuePeriod = 'today' | 'week' | 'month';

export const REVENUE_PERIODS: RevenuePeriod[] = ['today', 'week', 'month'];

export interface DateRange {
  from: Date;
  to: Date;
}

function startOfDay(date: Date): Date {
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
