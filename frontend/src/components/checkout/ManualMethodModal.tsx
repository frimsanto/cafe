import { useMemo, useState } from 'react';
import type { ManualMethodCode } from '../../types/order';
import { formatRupiah } from '../../lib/format';
import { manualMethods } from '../../data/paymentMethods';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import ModalScrollArea from '../common/ModalScrollArea';
import PaymentMethodOption from './PaymentMethodOption';

interface ManualMethodModalProps {
  /** Kode metode yang diaktifkan kafe (`cafe.metodeDiterima`). */
  metodeDiterima: string[];
  amount: number;
  busy: boolean;
  error: string | null;
  onConfirm: (metode: ManualMethodCode) => void;
  onClose: () => void;
}

/**
 * Fallback ketika kafe BELUM menyetel Midtrans: pelanggan memilih salah satu
 * metode manual yang diaktifkan kafe, pesanan dicatat, lalu kasir yang
 * mengonfirmasi pembayarannya di layar kasir.
 *
 * Pilihan di sini murni kesepakatan dengan kasir — uangnya tidak berpindah di
 * aplikasi, jadi pesanan tetap MENUNGGU sampai kasir menekan "Konfirmasi Lunas".
 */
export default function ManualMethodModal({
  metodeDiterima,
  amount,
  busy,
  error,
  onConfirm,
  onClose,
}: ManualMethodModalProps) {
  const options = useMemo(
    () => manualMethods.filter((m) => metodeDiterima.includes(m.code)),
    [metodeDiterima],
  );
  const [selected, setSelected] = useState<ManualMethodCode | null>(
    () => options[0]?.code ?? null,
  );

  useBodyScrollLock(true);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-hidden bg-slate-900/50 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="metode-manual-title"
    >
      <button
        type="button"
        aria-label="Tutup"
        onClick={onClose}
        className="absolute inset-0 cursor-default"
      />

      <div className="relative flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
        <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-4 pt-5">
          <div className="min-w-0">
            <h2 id="metode-manual-title" className="text-lg font-bold text-slate-900">
              Bayar di Kasir
            </h2>
            <p className="text-sm text-slate-500">
              Total{' '}
              <span className="font-semibold text-brand-700">
                {formatRupiah(amount)}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <ModalScrollArea className="px-5 pb-5">
          <p className="mb-4 rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800">
            Kafe ini belum menerima pembayaran online. Pilih cara bayarmu, lalu
            tunjukkan nomor pesanan ke kasir — pesanan diteruskan ke dapur setelah
            kasir mengonfirmasi.
          </p>

          {error && (
            <p role="alert" className="mb-4 rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
              {error}
            </p>
          )}

          {options.length === 0 ? (
            <p className="rounded-xl bg-slate-50 px-3.5 py-3 text-sm text-slate-600">
              Kafe ini belum mengaktifkan metode pembayaran apa pun. Silakan
              tanyakan ke kasir.
            </p>
          ) : (
            <>
              <div className="space-y-2.5">
                {options.map((method) => (
                  <PaymentMethodOption
                    key={method.code}
                    method={method}
                    selected={method.code === selected}
                    onSelect={() => setSelected(method.code)}
                  />
                ))}
              </div>

              <button
                type="button"
                disabled={selected === null || busy}
                onClick={() => selected && onConfirm(selected)}
                className="mt-4 w-full rounded-2xl bg-brand-600 py-3.5 font-semibold text-white shadow-sm transition hover:bg-brand-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {busy ? 'Mengirim pesanan…' : 'Kirim Pesanan ke Kasir'}
              </button>
            </>
          )}
        </ModalScrollArea>
      </div>
    </div>
  );
}
