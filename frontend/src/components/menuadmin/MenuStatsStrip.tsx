import type { MenuStats } from '../../hooks/useMenuManager';

interface MenuStatsStripProps {
  stats: MenuStats;
}

/**
 * Ringkasan angka menu (kategori, total item, tampil, disembunyikan) — versi
 * ringkas dari kartu KPI dasbor karena di sini fokusnya tetap pada daftar menu.
 */
export default function MenuStatsStrip({ stats }: MenuStatsStripProps) {
  const cells: { label: string; value: number; tone: string }[] = [
    { label: 'Kategori', value: stats.categoryCount, tone: 'text-slate-900' },
    { label: 'Total item', value: stats.itemCount, tone: 'text-slate-900' },
    { label: 'Bisa dipesan', value: stats.availableCount, tone: 'text-emerald-600' },
    { label: 'Disembunyikan', value: stats.hiddenCount, tone: 'text-slate-400' },
  ];

  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cells.map((cell) => (
        <div
          key={cell.label}
          className="rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200"
        >
          <dt className="text-xs font-medium text-slate-500">{cell.label}</dt>
          <dd className={`mt-0.5 text-xl font-bold tabular-nums ${cell.tone}`}>
            {cell.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
