import { useEffect, useState } from 'react';
import type { PaymentMethodCode } from '../../types/order';
import { formatRupiah } from '../../lib/format';
import MockQrCode from './MockQrCode';

interface PaymentSimulationModalProps {
  method: PaymentMethodCode;
  methodName: string;
  amount: number;
  /** Seed untuk QR tiruan (mis. id order sementara). */
  seed: string;
  onSuccess: () => void;
  onCancel: () => void;
}

type Stage = 'form' | 'processing';

/**
 * Overlay simulasi pembayaran. TIDAK memanggil gateway sungguhan — pengguna
 * menekan tombol untuk mensimulasikan pembayaran berhasil, lalu ada animasi
 * "memproses" singkat sebelum `onSuccess` dipanggil.
 *
 * Fase backend akan mengganti ini dengan alur gateway asli (InterActive QRIS).
 */
export default function PaymentSimulationModal({
  method,
  methodName,
  amount,
  seed,
  onSuccess,
  onCancel,
}: PaymentSimulationModalProps) {
  const [stage, setStage] = useState<Stage>('form');

  useEffect(() => {
    if (stage !== 'processing') return;
    const timer = setTimeout(onSuccess, 1600);
    return () => clearTimeout(timer);
  }, [stage, onSuccess]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl">
        {stage === 'processing' ? (
          <div className="flex flex-col items-center py-10">
            <svg className="h-12 w-12 animate-spin text-brand-600" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.4 0 0 5.4 0 12h4z" />
            </svg>
            <p className="mt-4 font-medium text-slate-700">Memproses pembayaran…</p>
            <p className="text-sm text-slate-400">Mohon tunggu sebentar</p>
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Bayar via {methodName}</h2>
                <p className="text-sm text-slate-500">
                  Total{' '}
                  <span className="font-semibold text-brand-700">
                    {formatRupiah(amount)}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={onCancel}
                aria-label="Tutup"
                className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {method === 'QRIS' ? (
              <div className="flex flex-col items-center rounded-2xl bg-slate-50 p-5">
                <MockQrCode seed={seed} size={200} />
                <p className="mt-3 text-center text-sm text-slate-500">
                  Scan QR ini dengan aplikasi bank atau e-wallet kamu.
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center rounded-2xl bg-slate-50 px-5 py-8 text-center">
                <span className="text-4xl">{method === 'GOPAY' ? '💚' : '💳'}</span>
                <p className="mt-3 text-sm text-slate-500">
                  Kamu akan diarahkan ke {methodName} untuk menyelesaikan
                  pembayaran.
                </p>
              </div>
            )}

            <div className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-center text-xs text-amber-700">
              Mode simulasi — belum terhubung ke gateway pembayaran.
            </div>

            <button
              type="button"
              onClick={() => setStage('processing')}
              className="mt-4 w-full rounded-2xl bg-brand-600 py-3.5 font-semibold text-white shadow-sm transition hover:bg-brand-700 active:scale-[0.99]"
            >
              Simulasikan Pembayaran Berhasil
            </button>
          </>
        )}
      </div>
    </div>
  );
}
