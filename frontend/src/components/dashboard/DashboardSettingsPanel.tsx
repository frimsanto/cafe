import type { DashboardPreferences, DashboardWidgetKey } from '../../types/dashboard';
import { DEFAULT_PREFS, WIDGET_OPTIONS } from '../../lib/dashboardPrefs';

interface DashboardSettingsPanelProps {
  prefs: DashboardPreferences;
  onToggle: (key: DashboardWidgetKey, value: boolean) => void;
  onReset: () => void;
  onClose: () => void;
}

/** Sakelar on/off yang aksesibel (peran switch). */
function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${
        checked ? 'bg-brand-600' : 'bg-slate-300'
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
          checked ? 'left-[22px]' : 'left-0.5'
        }`}
      />
    </button>
  );
}

/**
 * Panel kustomisasi dasbor: pemilik memilih metrik/widget yang ingin tampil.
 * Perubahan langsung disimpan ke localStorage oleh pemanggil.
 */
export default function DashboardSettingsPanel({
  prefs,
  onToggle,
  onReset,
  onClose,
}: DashboardSettingsPanelProps) {
  const isDefault = WIDGET_OPTIONS.every(
    (opt) => prefs[opt.key] === DEFAULT_PREFS[opt.key],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Tutup pengaturan"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
      />

      <div className="relative w-full max-w-lg rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Sesuaikan Dasbor</h2>
            <p className="text-sm text-slate-500">
              Pilih metrik yang ingin tampil di halaman utama.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <ul className="mt-4 divide-y divide-slate-100">
          {WIDGET_OPTIONS.map((opt) => (
            <li key={opt.key} className="flex items-center gap-3 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-lg">
                {opt.icon}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-800">{opt.label}</p>
                <p className="truncate text-sm text-slate-500">{opt.description}</p>
              </div>
              <Toggle
                checked={prefs[opt.key]}
                onChange={(v) => onToggle(opt.key, v)}
                label={`Tampilkan ${opt.label}`}
              />
            </li>
          ))}
        </ul>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onReset}
            disabled={isDefault}
            className="flex-1 rounded-xl bg-slate-100 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-200 disabled:opacity-50"
          >
            Kembalikan Bawaan
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl bg-brand-600 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-700"
          >
            Selesai
          </button>
        </div>
      </div>
    </div>
  );
}
