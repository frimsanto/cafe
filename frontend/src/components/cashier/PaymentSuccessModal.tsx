import { useEffect, useRef } from 'react';
import type { Order } from '../../types/order';
import { formatRupiah } from '../../lib/format';
import { cashierPaymentMethods } from '../../data/paymentMethods';

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

  // Modal ini hanya muncul setelah pembayaran sukses, jadi `payment` praktis
  // selalu terisi — tetap dijaga agar tipe nullable dari API dihormati.
  const methodName = order.payment
    ? (cashierPaymentMethods.find((m) => m.code === order.payment!.method)?.name ??
      order.payment.method)
    : '-';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 backdrop-blur-sm sm:items-center sm:p-4"
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

      <div className="relative w-full max-w-md rounded-t-3xl bg-white p-5 text-center shadow-2xl sm:rounded-3xl">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 text-3xl">
          ✅
        </span>

        <h2 id="bayar-sukses-title" className="mt-3 text-lg font-bold text-slate-900">
          Pembayaran berhasil
        </h2>
        <p className="text-sm text-slate-500">
          {order.tableName} · {methodName} ·{' '}
          <span className="font-mono">{order.payment?.transactionId ?? '-'}</span>
        </p>

        <dl className="mt-4 space-y-2 rounded-2xl bg-slate-50 p-4 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-slate-500">Total dibayar</dt>
            <dd className="font-bold text-slate-900 tabular-nums">
              {formatRupiah(order.totalAmount)}
            </dd>
          </div>

          {change !== null && (
            <div className="flex items-center justify-between border-t border-slate-200 pt-2">
              <dt className="text-slate-500">Kembalian</dt>
              <dd className="text-lg font-bold text-emerald-600 tabular-nums">
                {formatRupiah(change)}
              </dd>
            </div>
          )}
        </dl>

        <p className="mt-3 text-sm text-slate-500">
          Pesanan sudah diteruskan ke dapur.
        </p>

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-2xl bg-slate-200 py-3 font-semibold text-slate-600 transition hover:bg-slate-300"
          >
            Selesai
          </button>
          <button
            ref={printRef}
            type="button"
            onClick={onPrint}
            className="flex-1 rounded-2xl bg-brand-600 py-3 font-semibold text-white shadow-sm transition hover:bg-brand-700 active:scale-[0.99]"
          >
            Cetak Struk
          </button>
        </div>
      </div>
    </div>
  );
}
