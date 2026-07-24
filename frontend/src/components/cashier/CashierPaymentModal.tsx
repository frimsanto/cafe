import { useEffect, useState } from 'react';
import type { Order, PaymentMethodCode } from '../../types/order';
import { formatRupiah, formatThousands, parseAmountInput } from '../../lib/format';
import PaymentMethodPicker from './PaymentMethodPicker';

/** Rincian uang tunai yang diterima kasir; `null` untuk pembayaran non-tunai. */
export interface CashDetail {
  received: number;
  change: number;
}

interface CashierPaymentModalProps {
  order: Order;
  onConfirm: (method: PaymentMethodCode, cash: CashDetail | null) => void;
  onClose: () => void;
}

/** Pecahan uang yang paling sering dipakai — untuk mengisi cepat nominal tunai. */
const QUICK_CASH = [50_000, 100_000, 150_000, 200_000];

/**
 * Dialog konfirmasi pembayaran di kasir: pilih metode, hitung kembalian untuk
 * pembayaran tunai, lalu konfirmasi.
 *
 * Untuk tunai, tombol konfirmasi baru aktif setelah uang yang diterima
 * mencukupi — supaya pesanan tidak pernah ditandai lunas dari nominal kurang.
 */
export default function CashierPaymentModal({
  order,
  onConfirm,
  onClose,
}: CashierPaymentModalProps) {
  const [method, setMethod] = useState<PaymentMethodCode | null>(null);
  const [cashInput, setCashInput] = useState('');

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const cashReceived = parseAmountInput(cashInput);
  const change = cashReceived === null ? null : cashReceived - order.totalAmount;
  const cashShort = method === 'CASH' && (change === null || change < 0);
  const canConfirm = method !== null && !cashShort;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bayar-kasir-title"
    >
      <button
        type="button"
        aria-label="Tutup"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />

      <div className="relative max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-slate-50 p-5 shadow-2xl sm:rounded-3xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="bayar-kasir-title" className="text-lg font-bold text-slate-900">
              Pembayaran {order.tableName}
            </h2>
            <p className="font-mono text-xs text-slate-400">{order.id}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-200"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Total yang harus dibayar */}
        <div className="mb-4 rounded-2xl bg-brand-600 px-4 py-3 text-white">
          <p className="text-sm text-white/80">Total tagihan</p>
          <p className="text-2xl font-bold tabular-nums">
            {formatRupiah(order.totalAmount)}
          </p>
        </div>

        <PaymentMethodPicker value={method} onChange={setMethod} />

        {method === 'CASH' && (
          <div className="mt-4">
            <label
              htmlFor="uang-diterima"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Uang diterima
            </label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                Rp
              </span>
              <input
                id="uang-diterima"
                inputMode="numeric"
                autoFocus
                value={cashReceived === null ? '' : formatThousands(cashReceived)}
                onChange={(event) => setCashInput(event.target.value)}
                placeholder="0"
                className="w-full rounded-xl border-0 bg-white py-2.5 pl-9 pr-3.5 text-sm tabular-nums text-slate-800 shadow-sm ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setCashInput(String(order.totalAmount))}
                className="rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-300"
              >
                Uang pas
              </button>
              {QUICK_CASH.filter((amount) => amount >= order.totalAmount).map(
                (amount) => (
                  <button
                    key={amount}
                    type="button"
                    onClick={() => setCashInput(String(amount))}
                    className="rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 tabular-nums transition hover:bg-slate-300"
                  >
                    {formatThousands(amount)}
                  </button>
                ),
              )}
            </div>

            <div
              className={`mt-3 flex items-center justify-between rounded-xl px-4 py-2.5 text-sm ${
                cashShort ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-800'
              }`}
            >
              <span className="font-medium">
                {cashShort ? 'Kurang' : 'Kembalian'}
              </span>
              <span className="font-bold tabular-nums">
                {change === null
                  ? formatRupiah(order.totalAmount)
                  : formatRupiah(Math.abs(change))}
              </span>
            </div>
          </div>
        )}

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-2xl bg-slate-200 py-3 font-semibold text-slate-600 transition hover:bg-slate-300"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => {
              if (!method) return;
              const cash =
                method === 'CASH' && cashReceived !== null && change !== null
                  ? { received: cashReceived, change }
                  : null;
              onConfirm(method, cash);
            }}
            className="flex-1 rounded-2xl bg-brand-600 py-3 font-semibold text-white shadow-sm transition hover:bg-brand-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            Konfirmasi Lunas
          </button>
        </div>

        <p className="mt-3 text-center text-xs text-slate-400">
          Pesanan dikirim ke dapur setelah pembayaran dikonfirmasi.
        </p>
      </div>
    </div>
  );
}
