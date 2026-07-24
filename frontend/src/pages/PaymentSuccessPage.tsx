import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Order } from '../types/order';
import { getLastOrder } from '../order/orderStore';
import { formatRupiah } from '../lib/format';
import { downloadReceiptPdf } from '../lib/receipt';
import { subscribeToOrderPush, type SubscribeResult } from '../lib/push';
import { mockCafe } from '../data/mockMenu';
import { paymentMethods } from '../data/paymentMethods';
import OrderStatusStepper from '../components/order/OrderStatusStepper';

const PUSH_MESSAGE: Record<SubscribeResult, string> = {
  ok: 'Notifikasi aktif — kamu akan diberi tahu saat pesanan siap. ✓',
  denied: 'Izin notifikasi ditolak. Aktifkan lewat pengaturan browser.',
  unsupported: 'Browser ini belum mendukung notifikasi push.',
  disabled: 'Layanan notifikasi belum aktif di server.',
  error: 'Gagal mengaktifkan notifikasi. Coba lagi nanti.',
};

function formatWaktu(iso: string): string {
  return new Date(iso).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Halaman konfirmasi pembayaran sukses (fitur "Notifikasi Pesanan Dibayar").
 *
 * Menegaskan pembayaran berhasil, memberi tahu bahwa pesanan sudah dikirim ke
 * dapur, menampilkan progres status pesanan, dan merinci isi pesanan.
 *
 * Struk PDF (tombol unduh) adalah task berikutnya di page ini.
 */
export default function PaymentSuccessPage() {
  const navigate = useNavigate();
  const [order, setOrder] = useState<Order | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushMsg, setPushMsg] = useState<string | null>(null);
  const [pushDone, setPushDone] = useState(false);

  useEffect(() => {
    const last = getLastOrder();
    if (!last) {
      navigate('/menu', { replace: true });
      return;
    }
    setOrder(last);
  }, [navigate]);

  if (!order) return null;

  const methodName =
    paymentMethods.find((m) => m.code === order.payment.method)?.name ??
    order.payment.method;

  const handleEnablePush = async () => {
    if (pushLoading || !order) return;
    setPushLoading(true);
    const result = await subscribeToOrderPush(order.cafeId, order.id);
    setPushMsg(PUSH_MESSAGE[result]);
    setPushDone(result === 'ok');
    setPushLoading(false);
  };

  const handleDownloadReceipt = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      await downloadReceiptPdf(order, mockCafe);
    } catch (err) {
      console.error('Gagal membuat struk PDF', err);
      alert('Maaf, struk gagal dibuat. Silakan coba lagi.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-slate-100 shadow-xl">
      {/* Hero sukses */}
      <div className="bg-gradient-to-br from-brand-600 to-brand-800 px-6 pb-10 pt-12 text-center text-white">
        <div className="animate-pop-in mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-white/15 backdrop-blur">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-brand-600">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
        </div>
        <h1 className="text-2xl font-bold">Pembayaran Berhasil</h1>
        <p className="mt-1 text-brand-100">
          Terima kasih! Pesananmu sudah kami terima.
        </p>
      </div>

      <main className="-mt-5 flex-1 space-y-4 px-4 pb-8">
        {/* Notifikasi masuk dapur + opt-in push */}
        <div className="animate-slide-down rounded-2xl bg-white p-4 shadow-sm ring-1 ring-brand-100">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xl">
              🔔
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-800">Pesanan dikirim ke dapur</p>
              <p className="text-sm text-slate-500">
                Dapur sedang menyiapkan pesanan untuk {order.tableName}.
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
              onClick={handleEnablePush}
              disabled={pushLoading}
              className="mt-3 w-full rounded-xl border border-brand-200 bg-brand-50 py-2.5 text-sm font-semibold text-brand-700 transition hover:bg-brand-100 disabled:opacity-60"
            >
              {pushLoading ? 'Mengaktifkan…' : '🔔 Beri tahu saya saat pesanan siap'}
            </button>
          )}
        </div>

        {/* Progres status */}
        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
          <OrderStatusStepper status={order.status} />
        </section>

        {/* Detail pesanan */}
        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">
                No. Pesanan
              </p>
              <p className="font-mono font-semibold text-slate-800">{order.id}</p>
            </div>
            <div className="text-right">
              <p className="text-xs uppercase tracking-wide text-slate-400">Waktu</p>
              <p className="text-sm font-medium text-slate-700">
                {formatWaktu(order.createdAt)}
              </p>
            </div>
          </div>

          <ul className="divide-y divide-slate-100 py-1">
            {order.items.map((item) => (
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

          <div className="space-y-1.5 border-t border-slate-100 pt-3">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Metode Pembayaran</span>
              <span className="font-medium text-slate-700">{methodName}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-semibold text-slate-800">Total Dibayar</span>
              <span className="text-lg font-bold text-brand-700 tabular-nums">
                {formatRupiah(order.totalAmount)}
              </span>
            </div>
          </div>
        </section>
      </main>

      <footer className="sticky bottom-0 space-y-2.5 border-t border-slate-200 bg-white px-4 pb-5 pt-4">
        <button
          type="button"
          onClick={handleDownloadReceipt}
          disabled={downloading}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 py-3.5 font-semibold text-white shadow-sm transition hover:bg-brand-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-brand-400"
        >
          {downloading ? (
            <>
              <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.4 0 0 5.4 0 12h4z" />
              </svg>
              Menyiapkan struk…
            </>
          ) : (
            <>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
              Unduh Struk (PDF)
            </>
          )}
        </button>
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
