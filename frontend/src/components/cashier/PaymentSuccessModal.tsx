import { useEffect, useRef } from 'react';
import type { Order } from '../../types/order';
import { formatRupiah } from '../../lib/format';
import { labelMetode } from '../../data/paymentMethods';

interface PaymentSuccessModalProps {
  order: Order;
  /** Kembalian tunai, bila kasir mengisi nominal uang yang diterima. */
  change?: number | null;
  /** Buka pratinjau struk untuk dicetak. */
  onPrint: () => void;
  onClose: () => void;
}

/**
 * Pemberitahuan pembayaran berhasil di kasir, lengkap dengan kembalian dan
 * tombol cetak struk.
 *
 * Dialog ini tidak menutup sendiri: kasir perlu waktu menyerahkan kembalian dan
 * memutuskan apakah struk dicetak. Fokus awal jatuh ke tombol cetak.
 */
export default function PaymentSuccessModal({
  order,
  change = null,
  onPrint,
  onClose,
}: PaymentSuccessModalProps) {
  const printRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    printRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // Metode akurat dari domain baru (kode manual / label Midtrans), jatuh ke enum
  // lama bila belum terisi.
  const methodName = labelMetode(order.metodePembayaran ?? order.payment?.method);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-warm-espresso/40 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bayar-sukses-title"
    >
      <button
        type="button"
        aria-label="Tutup"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />

      <div className="relative w-full max-w-md rounded-t-3xl bg-warm-paper p-5 text-center shadow-2xl sm:rounded-3xl">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-warm-success/10 text-3xl">
          ✅
        </span>

        <h2 id="bayar-sukses-title" className="mt-3 text-lg font-bold text-warm-espresso">
          Pembayaran berhasil
        </h2>
        <p className="text-sm text-warm-muted">
          {order.tableName} · {methodName} ·{' '}
          <span className="font-mono">{order.payment?.transactionId ?? '-'}</span>
        </p>

        <dl className="mt-4 space-y-2 rounded-2xl bg-warm-cream p-4 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-warm-muted">Total dibayar</dt>
            <dd className="font-bold text-warm-espresso tabular-nums">
              {formatRupiah(order.totalAmount)}
            </dd>
          </div>

          {change !== null && (
            <div className="flex items-center justify-between border-t border-warm-line pt-2">
              <dt className="text-warm-muted">Kembalian</dt>
              <dd className="text-lg font-bold text-warm-success tabular-nums">
                {formatRupiah(change)}
              </dd>
            </div>
          )}
        </dl>

        <p className="mt-3 text-sm text-warm-muted">
          Pesanan sudah diteruskan ke dapur.
        </p>

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-2xl bg-warm-espresso/10 py-3 font-semibold text-warm-subtle transition hover:bg-warm-espresso/20"
          >
            Selesai
          </button>
          <button
            ref={printRef}
            type="button"
            onClick={onPrint}
            className="flex-1 rounded-2xl bg-warm-amber py-3 font-semibold text-white shadow-sm transition hover:brightness-95 active:scale-[0.99]"
          >
            Cetak Struk
          </button>
        </div>
      </div>
    </div>
  );
}
