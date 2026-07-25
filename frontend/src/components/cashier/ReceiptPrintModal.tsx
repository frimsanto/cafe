import { useEffect } from 'react';
import type { Order } from '../../types/order';
import ReceiptPreview from './ReceiptPreview';

interface ReceiptPrintModalProps {
  order: Order;
  cafeName: string;
  cash?: { received: number; change: number } | null;
  /** Sedang menyiapkan berkas PDF. */
  downloading?: boolean;
  onDownloadPdf: () => void;
  onClose: () => void;
}

/**
 * Dialog pratinjau & cetak struk.
 *
 * "Cetak" memanggil dialog cetak peramban — aturan `@media print` membuat hanya
 * pratinjau struk yang ikut tercetak, pas di kertas 80mm printer kasir.
 * Sebagai alternatif, struk bisa diunduh sebagai PDF untuk diarsipkan.
 */
export default function ReceiptPrintModal({
  order,
  cafeName,
  cash = null,
  downloading = false,
  onDownloadPdf,
  onClose,
}: ReceiptPrintModalProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-warm-espresso/40 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="struk-title"
    >
      <button
        type="button"
        aria-label="Tutup pratinjau struk"
        onClick={onClose}
        className="print-hidden absolute inset-0 cursor-default"
      />

      <div className="relative flex max-h-[92vh] w-full max-w-md flex-col rounded-t-3xl bg-warm-cream shadow-2xl sm:rounded-3xl">
        <div className="print-hidden flex items-start justify-between gap-3 p-5 pb-3">
          <div>
            <h2 id="struk-title" className="text-lg font-bold text-warm-espresso">
              Pratinjau Struk
            </h2>
            <p className="text-sm text-warm-muted">
              Tampilan ini yang akan tercetak di kertas 80mm.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="rounded-full p-1.5 text-warm-muted transition hover:bg-warm-espresso/10"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5">
          <ReceiptPreview order={order} cafeName={cafeName} cash={cash} />
        </div>

        <div className="print-hidden flex flex-col gap-2 p-5 pt-4 sm:flex-row">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl bg-warm-espresso/10 px-4 py-3 font-semibold text-warm-subtle transition hover:bg-warm-espresso/20 sm:flex-1"
          >
            Tutup
          </button>
          <button
            type="button"
            onClick={onDownloadPdf}
            disabled={downloading}
            className="rounded-2xl bg-warm-paper px-4 py-3 font-semibold text-warm-subtle shadow-sm ring-1 ring-warm-line transition hover:bg-warm-espresso/5 disabled:cursor-not-allowed disabled:text-warm-muted sm:flex-1"
          >
            {downloading ? 'Menyiapkan…' : 'Unduh PDF'}
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-2xl bg-warm-amber px-4 py-3 font-semibold text-white shadow-sm transition hover:brightness-95 active:scale-[0.99] sm:flex-1"
          >
            Cetak
          </button>
        </div>
      </div>
    </div>
  );
}
