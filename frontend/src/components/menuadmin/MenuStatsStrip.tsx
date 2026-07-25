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
    { label: 'Kategori', value: stats.categoryCount, tone: 'text-warm-espresso' },
    { label: 'Total item', value: stats.itemCount, tone: 'text-warm-espresso' },
    { label: 'Bisa dipesan', value: stats.availableCount, tone: 'text-warm-success' },
    { label: 'Disembunyikan', value: stats.hiddenCount, tone: 'text-warm-muted' },
  ];

  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cells.map((cell) => (
        <div key={cell.label} className="card-warm rounded-2xl px-4 py-3">
          <dt className="text-xs font-medium text-warm-muted">{cell.label}</dt>
          <dd className={`mt-0.5 text-xl font-bold tabular-nums ${cell.tone}`}>
            {cell.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
