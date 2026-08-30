import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { StatusPembayaran } from '../types/order';
import { pembayaranApi } from '../api/pembayaran';
import { formatRupiah } from '../lib/format';
import {
  labelStatus,
  nadaStatus,
  normalisasiStatus,
  statusFinal,
} from '../lib/paymentStatus';
import BadgeMetode from '../components/common/BadgeMetode';
import PaymentIcon, { type PaymentIconName } from '../components/payment/PaymentIcon';
import AppLayout from '../components/layout/AppLayout';

const POLL_MS = 3_000;

/** Petakan status awal dari query (?status=sukses|menunggu|gagal). */
function initialFromQuery(value: string | null): StatusPembayaran {
  if (value === 'sukses') return 'PAID';
  if (value === 'gagal') return 'FAILED';
  return 'UNPAID';
}

/** Rupa tiap nada status: ikon + warna. Judulnya dari `labelStatus`. */
const RUPA: Record<string, { ikon: PaymentIconName; kelas: string; latar: string }> = {
  sukses: { ikon: 'check', kelas: 'text-warm-success', latar: 'bg-warm-success/10' },
  menunggu: { ikon: 'clock', kelas: 'text-amber-600', latar: 'bg-amber-50' },
  gagal: { ikon: 'x', kelas: 'text-rose-600', latar: 'bg-rose-50' },
  netral: { ikon: 'clock', kelas: 'text-warm-subtle', latar: 'bg-warm-cream' },
};

/**
 * Halaman status pembayaran Midtrans.
 *
 * Status awal langsung dirender dari query param (hasil callback Snap) tanpa
 * menunggu fetch, lalu polling ke server tiap 3 detik untuk memastikannya —
 * berhenti begitu status pembayarannya final.
 */
export default function PembayaranStatusPage() {
  const { midtransOrderId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [status, setStatus] = useState<StatusPembayaran>(() =>
    initialFromQuery(searchParams.get('status')),
  );
  const [metode, setMetode] = useState<string | null>(null);
  const [grossAmount, setGrossAmount] = useState<number | null>(null);

  useEffect(() => {
    if (!midtransOrderId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const res = await pembayaranApi.status(midtransOrderId);
        if (cancelled) return;
        setStatus(normalisasiStatus(res.status));
        setMetode(res.metodePembayaran);
        setGrossAmount(res.grossAmount);
        // Status final — hentikan polling. "Menunggu verifikasi" TIDAK final:
        // yang ditunggu adalah kasir menekan tombol, dan halaman ini harus
        // terus memeriksa sampai itu terjadi.
        if (statusFinal(res.status)) return;
      } catch {
        /* jaringan/gateway bermasalah — coba lagi pada tick berikutnya */
      }
      if (!cancelled) timer = setTimeout(poll, POLL_MS);
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [midtransOrderId]);

  const nada = nadaStatus(status);
  const view = RUPA[nada] ?? RUPA.netral;

  return (
    <AppLayout title="Status Pembayaran" subtitle="Transaksi Midtrans">
      <div className="mx-auto max-w-md">
        <div className="rounded-3xl bg-warm-paper p-6 text-center shadow-sm ring-1 ring-warm-line">
          <span
            className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full ${view.latar} ${view.kelas}`}
          >
            <PaymentIcon name={view.ikon} size={38} />
          </span>
          <h2 className={`mt-4 text-2xl font-bold ${view.kelas}`}>
            {labelStatus(status)}
          </h2>

          {status === 'UNPAID' && (
            <p className="mt-1 flex items-center justify-center gap-2 text-sm text-warm-muted">
              <span className="h-2 w-2 animate-ping rounded-full bg-amber-400" />
              Menunggu pembayaran pelanggan…
            </p>
          )}

          {status === 'AWAITING_VERIFICATION' && (
            <p className="mt-1 text-sm text-warm-muted">
              Tamu mengaku sudah membayar. Periksa dulu di layar Kasir sebelum
              menerimanya.
            </p>
          )}

          <dl className="mt-6 space-y-3 rounded-2xl bg-warm-cream p-4 text-left text-sm">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-warm-muted">Nominal</dt>
              <dd className="font-bold text-warm-espresso tabular-nums">
                {grossAmount === null ? '—' : formatRupiah(grossAmount)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-warm-muted">Metode</dt>
              <dd>
                <BadgeMetode metode={metode} />
              </dd>
            </div>
            <div className="flex items-start justify-between gap-2">
              <dt className="text-warm-muted">ID Transaksi</dt>
              <dd className="break-all text-right font-mono text-xs text-warm-subtle">
                {midtransOrderId}
              </dd>
            </div>
          </dl>

          <div className="mt-6 space-y-2.5">
            {status === 'PAID' && (
              <button
                type="button"
                onClick={() => navigate('/kasir')}
                className="w-full rounded-2xl bg-warm-amber py-3 font-semibold text-white shadow-sm transition hover:brightness-95 active:scale-[0.99]"
              >
                Cetak Struk
              </button>
            )}
            {nada === 'gagal' && (
              <button
                type="button"
                onClick={() => navigate('/kasir')}
                className="w-full rounded-2xl bg-warm-amber py-3 font-semibold text-white shadow-sm transition hover:brightness-95 active:scale-[0.99]"
              >
                Coba Lagi
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate('/kasir')}
              className="w-full rounded-2xl bg-warm-espresso/10 py-3 font-semibold text-warm-subtle transition hover:bg-warm-espresso/20"
            >
              Kembali ke Kasir
            </button>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
