import type { DashboardPreferences, DashboardWidgetKey } from '../../types/dashboard';
import { DEFAULT_PREFS, WIDGET_OPTIONS } from '../../lib/dashboardPrefs';

interface DashboardSettingsPanelProps {
  prefs: DashboardPreferences;
  onToggle: (key: DashboardWidgetKey, value: boolean) => void;
  onReset: () => void;
  onClose: () => void;
}

/** Sakelar on/off yang aksesibel (peran switch), warna hangat "Cafe Ambient". */
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
      className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
      style={{ backgroundColor: checked ? 'var(--color-amber)' : '#d8cabb' }}
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
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      style={{ fontFamily: 'var(--font-data)' }}
    >
      <button
        type="button"
        aria-label="Tutup pengaturan"
        onClick={onClose}
        className="absolute inset-0 backdrop-blur-sm"
        style={{ backgroundColor: 'rgba(26,18,8,0.35)' }}
      />

      <div
        className="relative w-full max-w-lg rounded-t-3xl p-5 shadow-2xl sm:rounded-3xl"
        style={{ backgroundColor: 'var(--color-paper)', border: '1px solid var(--color-border)' }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 18,
                fontWeight: 500,
                color: 'var(--color-espresso)',
              }}
            >
              Sesuaikan Dasbor
            </h2>
            <p style={{ fontSize: 13, color: 'var(--color-muted)' }}>
              Pilih metrik yang ingin tampil di halaman utama.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="rounded-full p-1.5 transition-colors hover:bg-[rgba(26,18,8,0.06)]"
            style={{ color: 'var(--color-muted)' }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <ul className="mt-4">
          {WIDGET_OPTIONS.map((opt) => (
            <li
              key={opt.key}
              className="flex items-center gap-3 py-3"
              style={{ borderTop: '1px solid rgba(26,18,8,0.06)' }}
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-lg"
                style={{ backgroundColor: 'rgba(26,18,8,0.05)' }}
              >
                {opt.icon}
              </span>
              <div className="min-w-0 flex-1">
                <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--color-espresso)' }}>
                  {opt.label}
                </p>
                <p className="truncate" style={{ fontSize: 13, color: 'var(--color-muted)' }}>
                  {opt.description}
                </p>
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
            className="flex-1 rounded-xl py-2.5 transition-colors disabled:opacity-50 hover:bg-[rgba(26,18,8,0.09)]"
            style={{
              fontSize: 14,
              fontWeight: 500,
              backgroundColor: 'rgba(26,18,8,0.06)',
              color: 'var(--color-subtle)',
            }}
          >
            Kembalikan Bawaan
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl py-2.5 text-white transition-colors hover:brightness-95"
            style={{ fontSize: 14, fontWeight: 500, backgroundColor: 'var(--color-amber)' }}
          >
            Selesai
          </button>
        </div>
      </div>
    </div>
  );
}
