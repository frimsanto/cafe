export interface ReadyToastData {
  id: string;
  tableName: string;
}

interface ReadyToastContainerProps {
  toasts: ReadyToastData[];
  onDismiss: (id: string) => void;
}

/**
 * Tumpukan notifikasi "pesanan siap" di pojok layar dapur. Muncul saat sebuah
 * pesanan berpindah ke status semua-item-siap, menandakan pelanggan telah
 * diberi tahu. Ukurannya dibesarkan agar tertangkap dari seberang dapur.
 */
export default function ReadyToastContainer({
  toasts,
  onDismiss,
}: ReadyToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-96 max-w-[calc(100vw-2.5rem)] flex-col gap-3">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="animate-slide-down pointer-events-auto flex items-center gap-4 rounded-2xl bg-emerald-500 px-5 py-4 text-white shadow-2xl ring-2 ring-emerald-300"
        >
          <span aria-hidden className="text-4xl leading-none">
            🔔
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xl font-black leading-tight">
              {toast.tableName} — Siap!
            </p>
            <p className="text-sm text-emerald-100">
              Notifikasi terkirim ke pelanggan.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            aria-label="Tutup notifikasi"
            className="shrink-0 rounded-full p-1.5 text-white/80 transition hover:bg-white/20"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
