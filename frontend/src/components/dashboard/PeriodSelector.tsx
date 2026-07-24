import { REVENUE_PERIODS, type RevenuePeriod } from '../../types/dashboard';

interface PeriodSelectorProps {
  value: RevenuePeriod;
  onChange: (period: RevenuePeriod) => void;
}

/**
 * Pemilih periode omzet: Hari Ini · Minggu Ini · Bulan Ini.
 * Gaya "Cafe Ambient": kapsul latar espresso transparan, tab aktif solid.
 */
export default function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
  return (
    <div
      role="group"
      aria-label="Pilih periode omzet"
      className="inline-flex gap-0.5 rounded-lg p-1"
      style={{
        backgroundColor: 'rgba(26,18,8,0.05)',
        fontFamily: 'var(--font-data)',
      }}
    >
      {REVENUE_PERIODS.map((period) => {
        const active = period.key === value;
        return (
          <button
            key={period.key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(period.key)}
            className="rounded-md px-3 py-1 transition-colors"
            style={{
              fontSize: 12,
              fontWeight: 500,
              backgroundColor: active ? 'var(--color-espresso)' : 'transparent',
              color: active ? 'var(--color-paper)' : 'var(--color-muted)',
            }}
          >
            {period.label}
          </button>
        );
      })}
    </div>
  );
}
