import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { StatusPembayaranDTO } from '../types/api';
import { pembayaranApi } from '../api/pembayaran';
import { payWithSnap } from '../lib/midtransSnap';
import { describeApiError } from '../lib/apiClient';
import { formatRupiah } from '../lib/format';
import BadgeMetode from '../components/common/BadgeMetode';
import { downloadReceiptPdf } from '../lib/receipt';
import { subscribeToOrderPush, type SubscribeResult } from '../lib/push';
import OrderStatusStepper from '../components/order/OrderStatusStepper';

const POLL_MS = 3_000;

/** Status akhir — polling berhenti begitu salah satunya tercapai. */
const FINAL = new Set(['LUNAS', 'GAGAL']);

const VIEW: Record<
  string,
  { icon: string; title: string; caption: string; accent: string; ring: string }
> = {
  LUNAS: {
    icon: '✅',
    title: 'Pembayaran Berhasil',
    caption: 'Terima kasih! Pesananmu sudah diteruskan ke dapur.',
    accent: 'text-emerald-600',
    ring: 'ring-emerald-100',
  },
  MENUNGGU: {
    icon: '⏳',
    title: 'Menunggu Pembayaran',
    caption: 'Pesanan masuk ke dapur setelah pembayaran dikonfirmasi.',
    accent: 'text-amber-600',
    ring: 'ring-amber-100',
  },
  GAGAL: {
    icon: '❌',
    title: 'Pembayaran Gagal',
    caption: 'Pembayaran tidak selesai. Kamu bisa mencoba lagi.',
    accent: 'text-rose-600',
    ring: 'ring-rose-100',
  },
};

const PUSH_MESSAGE: Record<SubscribeResult, string> = {
  ok: 'Notifikasi aktif — kamu akan diberi tahu saat pesanan siap. ✓',
  denied: 'Izin notifikasi ditolak. Aktifkan lewat pengaturan browser.',
  unsupported: 'Browser ini belum mendukung notifikasi push.',
  disabled: 'Layanan notifikasi belum aktif di server.',
  error: 'Gagal mengaktifkan notifikasi. Coba lagi nanti.',
};

/** Status awal dari query callback Snap (?status=sukses|menunggu|gagal). */
function initialFromQuery(value: string | null): string {
  if (value === 'sukses') return 'LUNAS';
  if (value === 'gagal') return 'GAGAL';
  return 'MENUNGGU';
}

function formatWaktu(iso: string): string {
  return new Date(iso).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Halaman status pesanan & pembayaran untuk PELANGGAN.
 *
 * Callback Snap hanya memberi tahu apa yang dilihat peramban; yang menentukan
 * lunas atau tidak adalah server (webhook Midtrans + rekonsiliasi ke Core API).
 * Karena itu status dari query param hanya dipakai sebagai tampilan awal, lalu
 * dipastikan lewat polling tiap 3 detik — yang berhenti sendiri begitu status
 * final (LUNAS/GAGAL) tercapai.
 *
 * Halaman ini juga jadi tujuan jalur manual: pesanan menunggu sampai kasir
 * mengonfirmasi, dan pelanggan melihat perubahannya di layar yang sama.
 */
export default function PesananStatusPage() {
  const { orderId = '' } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [status, setStatus] = useState<string>(() =>
    initialFromQuery(searchParams.get('status')),
  );
  const [detail, setDetail] = useState<StatusPembayaranDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [pushMsg, setPushMsg] = useState<string | null>(null);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushDone, setPushDone] = useState(false);

  /** Penanda unmount — dipakai bersama oleh polling & muat manual. */
  const cancelledRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Nomor urut rantai polling yang sedang sah. Menekan "Lihat Status" saat satu
   * permintaan masih terbang akan memulai rantai baru; tanpa penanda ini rantai
   * lama ikut menjadwalkan tick-nya sendiri dan polling berjalan berlipat.
   */
  const generasiRef = useRef(0);

  const ambilStatus = useCallback(async (): Promise<string | null> => {
    try {
      const res = await pembayaranApi.status(orderId);
      if (cancelledRef.current) return null;
      setDetail(res);
      setStatus(res.status);
      setError(null);
      return res.status;
    } catch (err) {
      if (cancelledRef.current) return null;
      setError(describeApiError(err, 'Status pembayaran gagal dimuat.'));
      return null;
    } finally {
      if (!cancelledRef.current) setMemuat(false);
    }
  }, [orderId]);

  /**
   * Mulai (atau mulai ulang) polling: periksa sekarang, lalu tiap 3 detik sampai
   * status final. Rantai lama otomatis gugur lewat nomor generasi.
   */
  const mulaiPolling = useCallback(async () => {
    const generasi = generasiRef.current + 1;
    generasiRef.current = generasi;
    if (timerRef.current) clearTimeout(timerRef.current);

    const tick = async () => {
      const hasil = await ambilStatus();
      // Komponen dilepas, atau sudah ada rantai yang lebih baru.
      if (cancelledRef.current || generasi !== generasiRef.current) return;
      // Status final → tidak perlu menanyakan lagi.
      if (hasil !== null && FINAL.has(hasil)) return;
      timerRef.current = setTimeout(() => void tick(), POLL_MS);
    };

    await tick();
  }, [ambilStatus]);

  useEffect(() => {
    if (!orderId) return;
    cancelledRef.current = false;
    void mulaiPolling();

    return () => {
      cancelledRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [orderId, mulaiPolling]);

  const pesanan = detail?.pesanan ?? null;
  const view = VIEW[status] ?? VIEW.MENUNGGU;
  const total = pesanan?.totalAmount ?? detail?.grossAmount ?? null;

  /** Coba bayar lagi lewat Midtrans (pesanan yang sama, transaksi baru). */
  const handleCobaLagi = async () => {
    if (retrying) return;
    setRetrying(true);
    setError(null);
    try {
      const tx = await pembayaranApi.buatMidtrans(pesanan?.id ?? orderId);
      if (!tx.clientKey) {
        setError('Pembayaran online kafe ini belum lengkap dikonfigurasi.');
        return;
      }
      payWithSnap({
        snapToken: tx.snapToken,
        clientKey: tx.clientKey,
        isProduction: tx.isProduction,
        onSuccess: () => void mulaiPolling(),
        onPending: () => void mulaiPolling(),
        onError: () => setError('Pembayaran gagal diproses. Silakan coba lagi.'),
        onClose: () => void mulaiPolling(),
      });
    } catch (err) {
      setError(describeApiError(err, 'Pembayaran gagal dimulai. Coba lagi.'));
    } finally {
      setRetrying(false);
    }
  };

  const handleAktifkanPush = async () => {
    if (pushBusy || !pesanan) return;
    setPushBusy(true);
    const result = await subscribeToOrderPush(pesanan.cafeId, pesanan.id);
    setPushMsg(PUSH_MESSAGE[result]);
    setPushDone(result === 'ok');
    setPushBusy(false);
  };

  const handleUnduhStruk = async () => {
    if (downloading || !pesanan || !detail) return;
    setDownloading(true);
    try {
      await downloadReceiptPdf(pesanan, {
        id: pesanan.cafeId,
        name: detail.cafeName,
        tagline: '',
      });
    } catch {
      setError('Struk gagal dibuat. Silakan coba lagi.');
    } finally {
      setDownloading(false);
    }
  };

  if (memuat && !detail) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col gap-4 bg-slate-100 px-4 py-8">
        <div className="h-48 animate-pulse rounded-3xl bg-white" />
        <div className="h-40 animate-pulse rounded-2xl bg-white" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-slate-100 shadow-xl">
      <main className="flex-1 space-y-4 px-4 pb-8 pt-6">
        {/* Kartu status */}
        <section
          className={`rounded-3xl bg-white p-6 text-center shadow-sm ring-1 ${view.ring}`}
        >
          <span className="animate-pop-in mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-slate-50 text-4xl">
            {view.icon}
          </span>
          <h1 className={`mt-4 text-2xl font-bold ${view.accent}`}>{view.title}</h1>
          <p className="mt-1 text-sm text-slate-500">{view.caption}</p>

          {status === 'MENUNGGU' && (
            <p className="mt-3 flex items-center justify-center gap-2 text-sm text-amber-700">
              <span className="h-2 w-2 animate-ping rounded-full bg-amber-400" />
              Memeriksa status pembayaran…
            </p>
          )}

          <dl className="mt-6 space-y-3 rounded-2xl bg-slate-50 p-4 text-left text-sm">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-500">Kafe</dt>
              <dd className="font-semibold text-slate-800">
                {detail?.cafeName ?? '-'}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-500">Meja</dt>
              <dd className="font-medium text-slate-700">
                {pesanan?.tableName ?? '-'}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-500">Total</dt>
              <dd className="font-bold text-slate-900 tabular-nums">
                {total === null ? '—' : formatRupiah(total)}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-2">
              <dt className="text-slate-500">Metode Bayar</dt>
              <dd>
                <BadgeMetode metode={detail?.metodePembayaran} />
              </dd>
            </div>
            <div className="flex items-start justify-between gap-2">
              <dt className="shrink-0 text-slate-500">No. Pesanan</dt>
              <dd className="break-all text-right font-mono text-xs text-slate-600">
                {pesanan?.id ?? orderId}
              </dd>
            </div>
            {pesanan && (
              <div className="flex items-center justify-between gap-2">
                <dt className="text-slate-500">Waktu</dt>
                <dd className="font-medium text-slate-700">
                  {formatWaktu(pesanan.createdAt)}
                </dd>
              </div>
            )}
          </dl>

          {error && (
            <p role="alert" className="mt-4 rounded-xl bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
              {error}
            </p>
          )}

          <div className="mt-5 space-y-2.5">
            <button
              type="button"
              onClick={() => void mulaiPolling()}
              className="w-full rounded-2xl bg-slate-100 py-3 font-semibold text-slate-700 transition hover:bg-slate-200 active:scale-[0.99]"
            >
              Lihat Status
            </button>
            {status === 'GAGAL' && (
              <button
                type="button"
                onClick={() => void handleCobaLagi()}
                disabled={retrying}
                className="w-full rounded-2xl bg-brand-600 py-3 font-semibold text-white shadow-sm transition hover:bg-brand-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {retrying ? 'Menyiapkan…' : 'Coba Bayar Lagi'}
              </button>
            )}
          </div>
        </section>

        {/* Petunjuk khusus jalur kasir */}
        {status === 'MENUNGGU' && (
          <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-50 text-xl">
                🧾
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-slate-800">
                  Menunggu konfirmasi pembayaran
                </p>
                <p className="text-sm text-slate-500">
                  Kalau kamu membayar di kasir, tunjukkan nomor pesanan di atas.
                  Halaman ini otomatis berubah begitu pembayaran tercatat.
                </p>
              </div>
            </div>
          </section>
        )}

        {/* Setelah lunas: progres dapur + notifikasi */}
        {status === 'LUNAS' && pesanan && (
          <>
            <section className="animate-slide-down rounded-2xl bg-white p-4 shadow-sm ring-1 ring-brand-100">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xl">
                  🔔
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-800">Pesanan dikirim ke dapur</p>
                  <p className="text-sm text-slate-500">
                    Dapur sedang menyiapkan pesanan untuk {pesanan.tableName}.
                  </p>
                </div>
              </div>

              {pushMsg ? (
                <p
                  className={`mt-3 rounded-xl px-3 py-2 text-sm ${
                    pushDone ? 'bg-brand-50 text-brand-700' : 'bg-amber-50 text-amber-700'
                  }`}
                >
                  {pushMsg}
                </p>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleAktifkanPush()}
                  disabled={pushBusy}
                  className="mt-3 w-full rounded-xl border border-brand-200 bg-brand-50 py-2.5 text-sm font-semibold text-brand-700 transition hover:bg-brand-100 disabled:opacity-60"
                >
                  {pushBusy ? 'Mengaktifkan…' : '🔔 Beri tahu saya saat pesanan siap'}
                </button>
              )}
            </section>

            <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
              <OrderStatusStepper status={pesanan.status} />
            </section>
          </>
        )}

        {/* Rincian pesanan */}
        {pesanan && pesanan.items.length > 0 && (
          <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
            <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
              Rincian Pesanan
            </h2>
            <ul className="divide-y divide-slate-100">
              {pesanan.items.map((item) => (
                <li key={item.id} className="flex justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-800">
                      <span className="text-brand-700">{item.quantity}×</span>{' '}
                      {item.name}
                    </p>
                    {item.notes && (
                      <p className="truncate text-xs italic text-slate-400">
                        “{item.notes}”
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 font-medium text-slate-700 tabular-nums">
                    {formatRupiah(item.price * item.quantity)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>

      <footer className="sticky bottom-0 space-y-2.5 border-t border-slate-200 bg-white px-4 pb-5 pt-4">
        {status === 'LUNAS' && (
          <button
            type="button"
            onClick={() => void handleUnduhStruk()}
            disabled={downloading}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 py-3.5 font-semibold text-white shadow-sm transition hover:bg-brand-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-brand-400"
          >
            {downloading ? 'Menyiapkan struk…' : 'Unduh Struk (PDF)'}
          </button>
        )}
        <button
          type="button"
          onClick={() => navigate('/menu')}
          className="w-full rounded-2xl bg-slate-100 py-3.5 font-semibold text-slate-700 transition hover:bg-slate-200 active:scale-[0.99]"
        >
          Kembali ke Menu
        </button>
      </footer>
    </div>
  );
}
