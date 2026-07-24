import type { ReactNode } from 'react';

interface StatCardProps {
  label: string;
  value: string;
  icon: ReactNode;
  /** Perubahan terhadap periode pembanding, dalam persen. */
  deltaPercent?: number | null;
  /** Keterangan pembanding, mis. "vs kemarin". */
  deltaLabel?: string;
  /** Keterangan tambahan bila tidak memakai delta. */
  hint?: string;
}

function formatDelta(percent: number): string {
  const sign = percent > 0 ? '+' : '';
  return `${sign}${percent.toFixed(1)}%`;
}

/**
 * Kartu metrik (KPI) pada dasbor pemilik: label, nilai besar, ikon, dan
 * indikator tren terhadap periode pembanding.
 */
export default function StatCard({
  label,
  value,
  icon,
  deltaPercent,
  deltaLabel,
  hint,
}: StatCardProps) {
  const hasDelta = typeof deltaPercent === 'number';
  const positive = hasDelta && deltaPercent >= 0;

  return (
    <article className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          {icon}
        </span>
      </div>

      <p className="mt-3 text-2xl font-bold tracking-tight text-slate-900 tabular-nums lg:text-3xl">
        {value}
      </p>

      {hasDelta ? (
        <p className="mt-2 flex items-center gap-1.5 text-sm">
          <span
            className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-semibold ${
              positive
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-rose-50 text-rose-700'
            }`}
          >
            {positive ? '▲' : '▼'} {formatDelta(deltaPercent)}
          </span>
          {deltaLabel && <span className="text-slate-400">{deltaLabel}</span>}
        </p>
      ) : (
        hint && <p className="mt-2 text-sm text-slate-400">{hint}</p>
      )}
    </article>
  );
}
