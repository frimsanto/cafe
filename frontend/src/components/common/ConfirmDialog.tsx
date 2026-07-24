import { useEffect, useRef, type ReactNode } from 'react';

interface ConfirmDialogProps {
  title: string;
  /** Penjelasan singkat tentang akibat tindakan ini. */
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` untuk tindakan merusak (hapus), `normal` untuk lainnya. */
  tone?: 'danger' | 'normal';
  /** Tindakan sedang berjalan — tombol dikunci agar tidak terkirim dua kali. */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Dialog konfirmasi untuk tindakan yang tidak bisa dibatalkan.
 *
 * Fokus awal jatuh ke tombol batal (bukan tombol hapus) supaya menekan Enter
 * secara refleks tidak langsung menghapus data; Esc juga membatalkan.
 */
export default function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Ya, lanjutkan',
  cancelLabel = 'Batal',
  tone = 'normal',
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
    >
      <button
        type="button"
        aria-label="Tutup"
        onClick={onCancel}
        className="absolute inset-0 cursor-default"
      />

      <div className="relative w-full max-w-sm rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl">
        <div className="flex items-start gap-3">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg ${
              tone === 'danger' ? 'bg-rose-50' : 'bg-brand-50'
            }`}
          >
            {tone === 'danger' ? '🗑️' : '❓'}
          </span>
          <div className="min-w-0">
            <h2 id="confirm-title" className="font-bold text-slate-900">
              {title}
            </h2>
            <div className="mt-1 text-sm text-slate-500">{message}</div>
          </div>
        </div>

        <div className="mt-5 flex gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 rounded-2xl bg-slate-200 py-3 font-semibold text-slate-600 transition hover:bg-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`flex-1 rounded-2xl py-3 font-semibold text-white shadow-sm transition active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-300 ${
              tone === 'danger'
                ? 'bg-rose-600 hover:bg-rose-700'
                : 'bg-brand-600 hover:bg-brand-700'
            }`}
          >
            {busy ? 'Memproses…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
