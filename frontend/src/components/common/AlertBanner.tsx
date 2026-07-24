import type { ReactNode } from 'react';

export type AlertTone = 'success' | 'error' | 'warning';

interface AlertBannerProps {
  tone: AlertTone;
  /** Judul singkat; boleh dikosongkan untuk pesan satu baris. */
  title?: string;
  children: ReactNode;
  /** Tombol tindakan opsional, mis. "Coba lagi". */
  action?: { label: string; onClick: () => void };
  onClose?: () => void;
}

const TONE = {
  success: {
    icon: '✅',
    box: 'bg-emerald-50 ring-emerald-200',
    text: 'text-emerald-800',
    muted: 'text-emerald-700',
    button: 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200',
    close: 'text-emerald-600 hover:bg-emerald-100',
    role: 'status' as const,
  },
  error: {
    icon: '⛔',
    box: 'bg-rose-50 ring-rose-200',
    text: 'text-rose-800',
    muted: 'text-rose-700',
    button: 'bg-rose-100 text-rose-800 hover:bg-rose-200',
    close: 'text-rose-600 hover:bg-rose-100',
    role: 'alert' as const,
  },
  warning: {
    icon: '⚠️',
    box: 'bg-amber-50 ring-amber-200',
    text: 'text-amber-800',
    muted: 'text-amber-700',
    button: 'bg-amber-100 text-amber-800 hover:bg-amber-200',
    close: 'text-amber-600 hover:bg-amber-100',
    role: 'status' as const,
  },
};

/**
 * Spanduk pemberitahuan (berhasil / gagal / peringatan) dengan tombol tindakan
 * dan tutup opsional.
 *
 * Pesan kesalahan memakai `role="alert"` agar langsung dibacakan pembaca layar,
 * sedangkan kabar baik memakai `role="status"` yang lebih sopan (tidak memotong
 * bacaan yang sedang berjalan).
 */
export default function AlertBanner({
  tone,
  title,
  children,
  action,
  onClose,
}: AlertBannerProps) {
  const style = TONE[tone];

  return (
    <div
      role={style.role}
      className={`flex items-start gap-3 rounded-2xl px-4 py-3 ring-1 ${style.box}`}
    >
      <span className="text-lg">{style.icon}</span>

      <div className={`min-w-0 flex-1 text-sm ${style.text}`}>
        {title && <p className="font-semibold">{title}</p>}
        <div className={title ? style.muted : undefined}>{children}</div>
      </div>

      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold transition ${style.button}`}
        >
          {action.label}
        </button>
      )}

      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Tutup pemberitahuan"
          className={`shrink-0 rounded-full p-1 transition ${style.close}`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
