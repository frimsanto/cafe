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
 * diberi tahu (data tiruan).
 */
export default function ReadyToastContainer({
  toasts,
  onDismiss,
}: ReadyToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-80 max-w-[calc(100vw-2.5rem)] flex-col gap-2.5">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="animate-slide-down pointer-events-auto flex items-start gap-3 rounded-2xl bg-emerald-500 px-4 py-3 text-white shadow-2xl"
        >
          <span className="text-2xl">🔔</span>
          <div className="min-w-0 flex-1">
            <p className="font-extrabold leading-tight">
              {toast.tableName} — Pesanan Siap!
            </p>
            <p className="text-sm text-emerald-50">
              Notifikasi terkirim ke pelanggan.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onDismiss(toast.id)}
            aria-label="Tutup notifikasi"
            className="shrink-0 rounded-full p-1 text-white/80 transition hover:bg-white/20"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
