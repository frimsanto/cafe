import { useEffect, useMemo, useState } from 'react';
import type { ManualMethodCode, Order } from '../../types/order';
import type { PaymentConfigDTO } from '../../types/api';
import { formatRupiah, formatThousands, parseAmountInput } from '../../lib/format';
import { manualMethods } from '../../data/paymentMethods';

/** Rincian uang tunai yang diterima kasir; `null` untuk metode non-tunai. */
export interface CashDetail {
  received: number;
  change: number;
}

interface PaymentModalProps {
  order: Order;
  config: PaymentConfigDTO;
  /** Permintaan sedang diproses (konfirmasi manual / buat Midtrans). */
  busy: boolean;
  /** Galat yang ditampilkan di dalam modal (modal tidak ditutup). */
  error: string | null;
  onManualConfirm: (
    metode: ManualMethodCode,
    nominal: number,
    catatan: string | null,
    cash: CashDetail | null,
  ) => void;
  onMidtrans: () => void;
  onClose: () => void;
}

type Selection = ManualMethodCode | 'MIDTRANS' | null;

const QUICK_CASH = [50_000, 100_000, 150_000, 200_000];

/**
 * Modal pilih metode & konfirmasi pembayaran di kasir.
 *
 * Tombol metode mengikuti konfigurasi kafe (`metodeDiterima` + status Midtrans).
 * Metode manual dikonfirmasi langsung (tunai menghitung kembalian); Midtrans
 * membuka popup Snap lewat `onMidtrans`. Bila hanya satu metode aktif, langkah
 * pemilihan dilewati.
 */
export default function PaymentModal({
  order,
  config,
  busy,
  error,
  onManualConfirm,
  onMidtrans,
  onClose,
}: PaymentModalProps) {
  const manualOptions = useMemo(
    () => manualMethods.filter((m) => config.metodeDiterima.includes(m.code)),
    [config.metodeDiterima],
  );
  const midtransActive = config.midtransAktif;
  const totalActive = manualOptions.length + (midtransActive ? 1 : 0);

  // Satu metode aktif → lewati pemilihan, langsung ke flow-nya.
  const initial: Selection =
    totalActive === 1 ? (manualOptions[0]?.code ?? 'MIDTRANS') : null;

  const [method, setMethod] = useState<Selection>(initial);
  const [cashInput, setCashInput] = useState('');
  const [catatan, setCatatan] = useState('');

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const total = order.totalAmount;
  const cashReceived = parseAmountInput(cashInput);
  const change = cashReceived === null ? null : cashReceived - total;
  const cashShort = method === 'TUNAI' && (change === null || change < 0);
  const canConfirmManual = method !== null && method !== 'MIDTRANS' && !cashShort;

  const canGoBack = totalActive > 1 && method !== null;

  const submitManual = () => {
    if (method === null || method === 'MIDTRANS' || cashShort) return;
    if (method === 'TUNAI') {
      if (cashReceived === null || change === null) return;
      onManualConfirm('TUNAI', cashReceived, catatan.trim() || null, {
        received: cashReceived,
        change,
      });
    } else {
      onManualConfirm(method, total, catatan.trim() || null, null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-warm-espresso/40 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bayar-title"
    >
      <button type="button" aria-label="Tutup" onClick={onClose} className="absolute inset-0 cursor-default" />

      <div className="relative max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-warm-cream p-5 shadow-2xl sm:rounded-3xl">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="bayar-title" className="text-lg font-bold text-warm-espresso">
              Pembayaran {order.tableName}
            </h2>
            <p className="truncate font-mono text-xs text-warm-muted">{order.id}</p>
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

        {/* Total tagihan */}
        <div className="mb-4 rounded-2xl bg-warm-espresso px-4 py-3 text-warm-paper">
          <p className="text-sm text-warm-paper/70">Total tagihan</p>
          <p className="text-2xl font-bold tabular-nums">{formatRupiah(total)}</p>
        </div>

        {error && (
          <div className="mb-4 rounded-xl bg-rose-50 px-4 py-2.5 text-sm text-rose-700" role="alert">
            {error}
          </div>
        )}

        {canGoBack && (
          <button
            type="button"
            onClick={() => setMethod(null)}
            className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-warm-subtle hover:text-warm-espresso"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
            Ganti metode
          </button>
        )}

        {/* ── Langkah pemilihan metode ── */}
        {method === null && (
          <div className="space-y-2">
            {manualOptions.map((m) => (
              <button
                key={m.code}
                type="button"
                onClick={() => setMethod(m.code)}
                className="flex w-full items-center gap-3 rounded-2xl bg-warm-paper px-4 py-3 text-left shadow-sm ring-1 ring-warm-line transition hover:bg-warm-espresso/5"
              >
                <span className="text-xl">{m.icon}</span>
                <span className="min-w-0">
                  <span className="block font-semibold text-warm-espresso">{m.name}</span>
                  <span className="block text-xs text-warm-muted">{m.description}</span>
                </span>
              </button>
            ))}

            {midtransActive && (
              <button
                type="button"
                onClick={() => setMethod('MIDTRANS')}
                className="flex w-full items-center gap-3 rounded-2xl bg-warm-paper px-4 py-3 text-left shadow-sm ring-1 ring-warm-amber/50 transition hover:bg-warm-amber/5"
              >
                <span className="text-xl">🔵</span>
                <span className="min-w-0">
                  <span className="block font-semibold text-warm-espresso">
                    GoPay / QRIS Dinamis / Virtual Account
                  </span>
                  <span className="block text-xs text-warm-muted">
                    Pelanggan bayar via Midtrans
                  </span>
                </span>
              </button>
            )}

            {totalActive === 0 && (
              <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-700">
                Belum ada metode pembayaran aktif. Atur di menu Pengaturan → Pembayaran.
              </p>
            )}
          </div>
        )}

        {/* ── Flow Midtrans ── */}
        {method === 'MIDTRANS' && (
          <div className="space-y-4">
            <p className="rounded-xl bg-warm-paper px-4 py-3 text-sm text-warm-subtle ring-1 ring-warm-line">
              Pelanggan akan membayar lewat QRIS dinamis, GoPay, atau Virtual Account.
              Layar pembayaran Midtrans akan terbuka.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={onMidtrans}
              className="w-full rounded-2xl bg-warm-amber py-3 font-semibold text-white shadow-sm transition hover:brightness-95 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-warm-line disabled:text-warm-muted"
            >
              {busy ? 'Menyiapkan…' : 'Buka Pembayaran Midtrans'}
            </button>
          </div>
        )}

        {/* ── Flow manual ── */}
        {method !== null && method !== 'MIDTRANS' && (
          <div className="space-y-4">
            {method === 'TUNAI' ? (
              <div>
                <label htmlFor="uang-diterima" className="mb-1 block text-sm font-medium text-warm-subtle">
                  Uang diterima
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-warm-muted">
                    Rp
                  </span>
                  <input
                    id="uang-diterima"
                    inputMode="numeric"
                    autoFocus
                    value={cashReceived === null ? '' : formatThousands(cashReceived)}
                    onChange={(e) => setCashInput(e.target.value)}
                    placeholder="0"
                    className="w-full rounded-xl border-0 bg-warm-paper py-2.5 pl-9 pr-3.5 text-sm tabular-nums text-warm-espresso shadow-sm ring-1 ring-warm-line focus:outline-none focus:ring-2 focus:ring-warm-amber"
                  />
                </div>

                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setCashInput(String(total))}
                    className="rounded-lg bg-warm-espresso/10 px-3 py-1.5 text-xs font-semibold text-warm-subtle transition hover:bg-warm-espresso/20"
                  >
                    Uang pas
                  </button>
                  {QUICK_CASH.filter((amount) => amount >= total).map((amount) => (
                    <button
                      key={amount}
                      type="button"
                      onClick={() => setCashInput(String(amount))}
                      className="rounded-lg bg-warm-espresso/10 px-3 py-1.5 text-xs font-semibold text-warm-subtle tabular-nums transition hover:bg-warm-espresso/20"
                    >
                      {formatThousands(amount)}
                    </button>
                  ))}
                </div>

                <div
                  className={`mt-3 flex items-center justify-between rounded-xl px-4 py-2.5 text-sm ${
                    cashShort ? 'bg-rose-50 text-rose-700' : 'bg-warm-success/10 text-warm-success'
                  }`}
                >
                  <span className="font-medium">{cashShort ? 'Kurang' : 'Kembalian'}</span>
                  <span className="font-bold tabular-nums">
                    {change === null ? formatRupiah(total) : formatRupiah(Math.abs(change))}
                  </span>
                </div>
              </div>
            ) : (
              <div className="rounded-xl bg-warm-paper px-4 py-3 text-sm text-warm-subtle ring-1 ring-warm-line">
                Konfirmasi setelah menerima pembayaran sebesar{' '}
                <span className="font-bold text-warm-espresso">{formatRupiah(total)}</span>.
              </div>
            )}

            <div>
              <label htmlFor="catatan-kasir" className="mb-1 block text-sm font-medium text-warm-subtle">
                Catatan (opsional)
              </label>
              <input
                id="catatan-kasir"
                type="text"
                value={catatan}
                onChange={(e) => setCatatan(e.target.value)}
                placeholder="mis. ref transfer, no. approval EDC"
                className="w-full rounded-xl border-0 bg-warm-paper py-2.5 px-3.5 text-sm text-warm-espresso shadow-sm ring-1 ring-warm-line focus:outline-none focus:ring-2 focus:ring-warm-amber"
              />
            </div>

            <button
              type="button"
              disabled={!canConfirmManual || busy}
              onClick={submitManual}
              className="w-full rounded-2xl bg-warm-amber py-3 font-semibold text-white shadow-sm transition hover:brightness-95 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-warm-line disabled:text-warm-muted"
            >
              {busy ? 'Memproses…' : 'Konfirmasi Lunas'}
            </button>
          </div>
        )}

        <p className="mt-3 text-center text-xs text-warm-muted">
          Pesanan dikirim ke dapur setelah pembayaran dikonfirmasi.
        </p>
      </div>
    </div>
  );
}
