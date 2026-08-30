import { useMemo, useState } from 'react';
import type { ManualMethodCode } from '../../types/order';
import type { OpsiMetodeDTO } from '../../types/api';
import { formatRupiah } from '../../lib/format';
import { manualMethods, metodeInfo } from '../../data/paymentMethods';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import ModalScrollArea from '../common/ModalScrollArea';
import PaymentMethodOption from './PaymentMethodOption';

interface ManualMethodModalProps {
  /** Kode metode yang tersedia DI CHECKOUT kafe ini. */
  metodeDiterima: string[];
  /** Rincian tiap metode: instruksi, gambar QRIS, rekening tujuan. */
  metodeDetail?: OpsiMetodeDTO[];
  amount: number;
  busy: boolean;
  error: string | null;
  onConfirm: (metode: ManualMethodCode) => void;
  onClose: () => void;
}

/**
 * Pilihan pembayaran yang diselesaikan bersama kasir.
 *
 * Uangnya tidak berpindah di aplikasi. Yang terjadi setelah tombol ditekan
 * adalah pesanan masuk ke antrean verifikasi kasir dengan status
 * **menunggu verifikasi** — bukan lunas. Modal ini menyatakannya terus terang
 * di dua tempat (spanduk atas dan label tombol) karena inilah kesalahpahaman
 * paling mahal yang bisa terjadi di layar ini: tamu yang mengira sudah selesai
 * lalu pergi, sementara pesanannya tidak pernah masuk dapur.
 *
 * Untuk QRIS statis dan transfer, rincian tujuan pembayaran (gambar QR, nomor
 * rekening) ditampilkan langsung di sini — tanpa itu tamu tidak punya cara
 * membayar sama sekali.
 */
export default function ManualMethodModal({
  metodeDiterima,
  metodeDetail,
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

  const detail = metodeDetail?.find((d) => d.metode === selected);
  const info = selected ? metodeInfo(selected) : undefined;

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
              <span className="font-semibold text-brand-700">{formatRupiah(amount)}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <ModalScrollArea className="px-5 pb-5">
          <p className="mb-4 rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm leading-relaxed text-amber-900">
            Pesanan kamu <strong>belum lunas</strong> sampai kasir memeriksa
            pembayarannya. Setelah memilih, tunjukkan nomor pesanan (dan bukti
            bayar bila ada) ke kasir — pesanan diteruskan ke dapur begitu kasir
            mengonfirmasi.
          </p>

          {error && (
            <p role="alert" className="mb-4 rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
              {error}
            </p>
          )}

          {options.length === 0 ? (
            <p className="rounded-xl bg-slate-50 px-3.5 py-3 text-sm text-slate-600">
              Kafe ini belum mengaktifkan metode pembayaran apa pun untuk dipilih
              sendiri. Silakan tanyakan ke kasir.
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

              {/* ── Cara membayar untuk metode yang dipilih ── */}
              {selected && (
                <div className="mt-4 rounded-2xl bg-slate-50 p-4">
                  <p className="text-sm font-semibold text-slate-800">
                    {info?.petunjukTamu}
                  </p>

                  {selected === 'QRIS_STATIS' && detail?.qrisImageUrl && (
                    <div className="mt-3 flex flex-col items-center gap-2">
                      <img
                        src={detail.qrisImageUrl}
                        alt={`Kode QRIS ${detail.qrisMerchantName ?? 'kafe'}`}
                        className="h-56 w-56 rounded-xl bg-white object-contain p-2 ring-1 ring-slate-200"
                      />
                      {detail.qrisMerchantName && (
                        <p className="text-sm font-semibold text-slate-700">
                          {detail.qrisMerchantName}
                        </p>
                      )}
                    </div>
                  )}

                  {selected === 'TRANSFER' && detail?.bankNomorRekening && (
                    <dl className="mt-3 space-y-1.5 rounded-xl bg-white p-3.5 text-sm ring-1 ring-slate-200">
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-500">Bank</dt>
                        <dd className="font-semibold text-slate-900">{detail.bankNama}</dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-500">Nomor rekening</dt>
                        <dd className="font-mono font-bold text-slate-900 tabular-nums">
                          {detail.bankNomorRekening}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-3">
                        <dt className="text-slate-500">Atas nama</dt>
                        <dd className="text-right font-semibold text-slate-900">
                          {detail.bankAtasNama}
                        </dd>
                      </div>
                      {detail.batasWaktuMenit !== null &&
                        detail.batasWaktuMenit !== undefined && (
                          <div className="flex justify-between gap-3 border-t border-slate-100 pt-1.5">
                            <dt className="text-slate-500">Batas waktu</dt>
                            <dd className="font-semibold text-slate-900">
                              {detail.batasWaktuMenit} menit
                            </dd>
                          </div>
                        )}
                    </dl>
                  )}

                  {detail?.instruksi && (
                    <p className="mt-3 text-xs leading-relaxed text-slate-600">
                      {detail.instruksi}
                    </p>
                  )}
                </div>
              )}

              <button
                type="button"
                disabled={selected === null || busy}
                onClick={() => selected && onConfirm(selected)}
                className="mt-4 w-full rounded-2xl bg-brand-600 py-3.5 font-semibold text-white shadow-sm transition hover:bg-brand-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {busy ? 'Mengirim…' : 'Kirim ke Kasir untuk Diverifikasi'}
              </button>
            </>
          )}
        </ModalScrollArea>
      </div>
    </div>
  );
}
