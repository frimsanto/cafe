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
      className="fixed inset-0 z-50 flex items-end justify-center bg-warm-espresso/40 backdrop-blur-sm sm:items-center sm:p-4"
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

      <div className="relative w-full max-w-sm rounded-t-3xl bg-warm-paper p-5 shadow-2xl sm:rounded-3xl">
        <div className="flex items-start gap-3">
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg ${
              tone === 'danger' ? 'bg-rose-50' : 'bg-warm-amber/10'
            }`}
          >
            {tone === 'danger' ? '🗑️' : '❓'}
          </span>
          <div className="min-w-0">
            <h2 id="confirm-title" className="font-bold text-warm-espresso">
              {title}
            </h2>
            <div className="mt-1 text-sm text-warm-muted">{message}</div>
          </div>
        </div>

        <div className="mt-5 flex gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 rounded-2xl bg-warm-espresso/10 py-3 font-semibold text-warm-subtle transition hover:bg-warm-espresso/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`flex-1 rounded-2xl py-3 font-semibold text-white shadow-sm transition active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-warm-line disabled:text-warm-muted ${
              tone === 'danger'
                ? 'bg-rose-600 hover:bg-rose-700'
                : 'bg-warm-amber hover:brightness-95'
            }`}
          >
            {busy ? 'Memproses…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
