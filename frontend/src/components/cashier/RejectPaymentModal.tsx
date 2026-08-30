import { useEffect, useRef, useState } from 'react';
import type { CashierOrderDTO } from '../../types/api';
import { formatRupiah } from '../../lib/format';
import { labelMetode } from '../../data/paymentMethods';
import { labelTujuan } from '../../lib/orderStatus';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import ModalScrollArea from '../common/ModalScrollArea';
import PaymentIcon from '../payment/PaymentIcon';

/**
 * Dua keputusan yang sama bentuknya, beda akibatnya:
 *
 *   TOLAK — menolak pengajuan pembayaran tamu. Pesanannya TETAP hidup dan
 *           kembali menunggu dibayar dengan cara lain.
 *   BATAL — membatalkan pesanannya sama sekali. Mejanya kembali kosong.
 *
 * Dijadikan satu komponen karena keduanya menuntut hal yang sama persis:
 * alasan tertulis yang tersimpan bersama nama kasir dan waktunya. Dua salinan
 * berarti dua tempat yang bisa lupa mewajibkannya.
 */
export type ModeAlasan = 'TOLAK' | 'BATAL';

interface RejectPaymentModalProps {
  order: CashierOrderDTO;
  mode?: ModeAlasan;
  busy: boolean;
  error: string | null;
  onTolak: (alasan: string) => void;
  onTutup: () => void;
}

/** Alasan yang paling sering dipakai — sekali tekan, tanpa mengetik. */
const ALASAN_CEPAT: Record<ModeAlasan, string[]> = {
  TOLAK: [
    'Bukti transfer tidak ditemukan di rekening',
    'Nominal yang masuk tidak sesuai tagihan',
    'Bukti pembayaran tidak jelas atau tidak valid',
    'Tamu membatalkan pembayaran',
  ],
  BATAL: [
    'Tamu membatalkan pesanan',
    'Salah input pesanan',
    'Menu yang dipesan habis',
    'Tamu pergi tanpa membayar',
  ],
};

const TEKS: Record<
  ModeAlasan,
  { judul: string; penjelasan: string; tombol: string; sedang: string }
> = {
  TOLAK: {
    judul: 'Tolak pembayaran',
    penjelasan:
      'Pesanan kembali ke status belum dibayar dan tetap di antrean — tamu masih bisa membayar dengan cara lain.',
    tombol: 'Tolak Pembayaran',
    sedang: 'Memproses…',
  },
  BATAL: {
    judul: 'Batalkan pesanan',
    penjelasan:
      'Pesanan ditutup dan tidak akan dikirim ke dapur. Mejanya kembali tersedia untuk tamu berikutnya.',
    tombol: 'Batalkan Pesanan',
    sedang: 'Membatalkan…',
  },
};

/**
 * Dialog penolakan pengajuan pembayaran manual.
 *
 * Alasan wajib diisi, dan itu bukan formalitas: tamu yang pesanannya ditolak
 * berdiri di depan kasir menanyakan kenapa, dan besok ada yang membandingkan
 * setoran dengan catatan. Alasan tersimpan di jejak audit bersama nama kasir
 * dan waktunya.
 *
 * Pilihan cepat disediakan supaya kasir yang sedang sibuk tidak tergoda
 * mengetik "x" hanya agar tombolnya menyala.
 */
export default function RejectPaymentModal({
  order,
  mode = 'TOLAK',
  busy,
  error,
  onTolak,
  onTutup,
}: RejectPaymentModalProps) {
  const teks = TEKS[mode];
  const [alasan, setAlasan] = useState('');
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useBodyScrollLock();

  useEffect(() => {
    areaRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onTutup();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onTutup]);

  const bisaKirim = alasan.trim().length >= 3;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-hidden bg-warm-espresso/40 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tolak-title"
    >
      <button
        type="button"
        aria-label="Tutup"
        onClick={onTutup}
        className="absolute inset-0 cursor-default"
      />

      <div className="relative flex max-h-[92vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-warm-paper shadow-2xl sm:rounded-3xl">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-warm-line px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
              <PaymentIcon name="x" size={20} />
            </span>
            <div className="min-w-0">
              <h2 id="tolak-title" className="font-bold text-warm-espresso">
                {teks.judul} {labelTujuan(order)}
              </h2>
              <p className="text-xs text-warm-muted">
                {labelMetode(order.metodePembayaran)} ·{' '}
                {formatRupiah(order.totalAmount)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onTutup}
            aria-label="Tutup"
            className="shrink-0 rounded-full p-1.5 text-warm-muted transition hover:bg-warm-espresso/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-warm-amber"
          >
            <PaymentIcon name="x" />
          </button>
        </header>

        <ModalScrollArea className="space-y-4 px-5 py-5">
          {error && (
            <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">
              {error}
            </p>
          )}

          <p className="rounded-xl bg-warm-cream px-4 py-3 text-sm text-warm-subtle">
            {teks.penjelasan}
          </p>

          <div className="flex flex-wrap gap-2">
            {ALASAN_CEPAT[mode].map((pilihan) => (
              <button
                key={pilihan}
                type="button"
                onClick={() => setAlasan(pilihan)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-warm-amber ${
                  alasan === pilihan
                    ? 'bg-warm-amber/20 text-warm-subtle ring-1 ring-warm-amber'
                    : 'bg-warm-espresso/10 text-warm-subtle hover:bg-warm-espresso/15'
                }`}
              >
                {pilihan}
              </button>
            ))}
          </div>

          <div>
            <label
              htmlFor="alasan-tolak"
              className="mb-1.5 block text-sm font-medium text-warm-subtle"
            >
              {mode === 'TOLAK' ? 'Alasan penolakan' : 'Alasan pembatalan'}{' '}
              <span className="text-rose-600">*</span>
            </label>
            <textarea
              ref={areaRef}
              id="alasan-tolak"
              rows={3}
              value={alasan}
              onChange={(e) => setAlasan(e.target.value)}
              placeholder={
                mode === 'TOLAK'
                  ? 'Jelaskan singkat kenapa pembayaran ini ditolak…'
                  : 'Jelaskan singkat kenapa pesanan ini dibatalkan…'
              }
              className="w-full resize-y rounded-xl border-0 bg-warm-cream px-3.5 py-2.5 text-sm text-warm-espresso ring-1 ring-warm-line placeholder:text-warm-muted/70 focus:outline-none focus:ring-2 focus:ring-warm-amber"
            />
            <p className="mt-1.5 text-xs text-warm-muted">
              Tersimpan di catatan pembayaran bersama namamu dan waktunya.
            </p>
          </div>
        </ModalScrollArea>

        <footer className="flex shrink-0 gap-3 border-t border-warm-line px-5 py-4">
          <button
            type="button"
            onClick={onTutup}
            disabled={busy}
            className="flex-1 rounded-2xl bg-warm-espresso/10 py-3 font-semibold text-warm-subtle transition hover:bg-warm-espresso/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-warm-amber disabled:opacity-60"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={() => onTolak(alasan.trim())}
            disabled={busy || !bisaKirim}
            className="flex-1 rounded-2xl bg-rose-600 py-3 font-semibold text-white shadow-sm transition hover:bg-rose-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-warm-line disabled:text-warm-muted"
          >
            {busy ? teks.sedang : teks.tombol}
          </button>
        </footer>
      </div>
    </div>
  );
}
