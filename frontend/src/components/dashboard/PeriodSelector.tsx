import type { RevenuePeriod } from '../../types/dashboard';
import { REVENUE_PERIODS } from '../../data/mockDashboard';

interface PeriodSelectorProps {
  value: RevenuePeriod;
  onChange: (period: RevenuePeriod) => void;
}

/** Pemilih periode omzet: Hari Ini · Minggu Ini · Bulan Ini. */
export default function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
  return (
    <div
      role="group"
      aria-label="Pilih periode omzet"
      className="inline-flex rounded-xl bg-slate-100 p-1"
    >
      {REVENUE_PERIODS.map((period) => {
        const active = period.key === value;
        return (
          <button
            key={period.key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(period.key)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
              active
                ? 'bg-white text-brand-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {period.label}
          </button>
        );
      })}
    </div>
  );
}
