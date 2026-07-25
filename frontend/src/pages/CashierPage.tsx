import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import type { PaymentMethodCode } from '../types/order';
import type { CashierOrderDTO } from '../types/api';
import { useAuth } from '../auth/AuthContext';
import { useCashierOrders } from '../hooks/useCashierOrders';
import { describeApiError } from '../lib/apiClient';
import { formatRupiah } from '../lib/format';
import { downloadReceiptPdf } from '../lib/receipt';
import AppLayout from '../components/layout/AppLayout';
import AlertBanner from '../components/common/AlertBanner';
import PendingOrderCard from '../components/cashier/PendingOrderCard';
import CashierPaymentModal, {
  type CashDetail,
} from '../components/cashier/CashierPaymentModal';
import PaymentSuccessModal from '../components/cashier/PaymentSuccessModal';
import ReceiptPrintModal from '../components/cashier/ReceiptPrintModal';

const METHOD_LABEL: Partial<Record<PaymentMethodCode, string>> = {
  CASH: 'Tunai',
  EDC: 'Kartu (EDC)',
};

/**
 * Halaman kasir: daftar pesanan yang menunggu pembayaran tunai/EDC.
 *
 * Antrean diurutkan dari yang paling lama menunggu (FIFO) dan bisa disaring
 * lewat pencarian meja/nomor pesanan. Setelah kasir menandai lunas, pesanan
 * dianggap dirilis ke dapur — menegakkan aturan "pesanan hanya masuk dapur
 * setelah pembayaran dikonfirmasi".
 *
 * Antrean & konfirmasi pembayaran seluruhnya lewat API kasir; daftarnya ikut
 * diperbarui realtime agar dua kasir tidak menagih pesanan yang sama.
 */
export default function CashierPage() {
  const { user } = useAuth();
  const { pending, totalPending, loading, error, reload, markPaid } =
    useCashierOrders(user?.cafeId ?? '');

  const [query, setQuery] = useState('');
  /** Pesanan yang dialog pembayarannya sedang terbuka. */
  const [payingOrder, setPayingOrder] = useState<CashierOrderDTO | null>(null);
  /** Pembayaran yang baru berhasil — dasar notifikasi sukses & cetak struk. */
  const [paidResult, setPaidResult] = useState<{
    order: CashierOrderDTO;
    cash: CashDetail | null;
  } | null>(null);
  /** Struk yang sedang dipratinjau untuk dicetak. */
  const [receipt, setReceipt] = useState<{
    order: CashierOrderDTO;
    cash: CashDetail | null;
  } | null>(null);
  const [printing, setPrinting] = useState(false);
  const [confirmation, setConfirmation] = useState<{
    tableName: string;
    method: PaymentMethodCode;
  } | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  /** Kegagalan konfirmasi pembayaran — ditampilkan di dalam dialog. */
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // Satu jam bersama untuk seluruh kartu — label "lama menunggu" ikut berdetak.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!confirmation) return;
    const timer = setTimeout(() => setConfirmation(null), 4000);
    return () => clearTimeout(timer);
  }, [confirmation]);

  const visible = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return pending;
    return pending.filter(
      (order) =>
        order.tableName.toLowerCase().includes(keyword) ||
        order.id.toLowerCase().includes(keyword),
    );
  }, [pending, query]);

  if (!user) return <Navigate to="/login" replace />;

  const handleConfirmPayment = async (
    method: PaymentMethodCode,
    cash: CashDetail | null,
  ) => {
    if (!payingOrder) return;
    setPaymentError(null);
    const target = payingOrder;
    try {
      // Backend yang mencatat pembayaran dan merilis pesanan ke dapur.
      const paid = await markPaid(target.id, method);
      setPayingOrder(null);
      setPaidResult({ order: paid, cash });
      setConfirmation({ tableName: paid.tableName, method });
    } catch (error) {
      // Modal dibiarkan terbuka agar kasir bisa langsung mencoba lagi tanpa
      // kehilangan pilihan metode & nominal yang sudah diisi.
      setPaymentError(describeApiError(error, 'Pembayaran gagal dikonfirmasi.'));
    }
  };

  /**
   * Unduh struk sebagai PDF. Identitas kafe diambil dari sesi pengguna supaya
   * struk selalu memakai nama kafe (tenant) yang benar.
   */
  const handleDownloadPdf = async () => {
    if (!receipt || printing) return;
    setPrinting(true);
    setPrintError(null);
    try {
      await downloadReceiptPdf(receipt.order, {
        id: receipt.order.cafeId,
        name: user?.cafeName ?? 'CafeOS',
        tagline: '',
      });
    } catch {
      setPrintError('Struk PDF gagal dibuat. Coba lagi.');
    } finally {
      setPrinting(false);
    }
  };

  return (
    <AppLayout
      title="Kasir"
      subtitle={`${pending.length} pesanan menunggu · ${formatRupiah(totalPending)}`}
    >
      <div className="space-y-4">
        {/* Gagal memuat antrean — jangan diam-diam tampil sebagai "tidak ada
            pembayaran tertunda", karena artinya bertolak belakang. */}
        {!loading && error && (
          <AlertBanner
            tone="error"
            title="Gagal memuat antrean kasir"
            action={{ label: 'Coba lagi', onClick: reload }}
          >
            {error}
          </AlertBanner>
        )}

        {paymentError && (
          <AlertBanner tone="error" onClose={() => setPaymentError(null)}>
            {paymentError}
          </AlertBanner>
        )}

        {printError && (
          <AlertBanner tone="error" onClose={() => setPrintError(null)}>
            {printError}
          </AlertBanner>
        )}

        {confirmation && (
          <AlertBanner tone="success" onClose={() => setConfirmation(null)}>
            {confirmation.tableName} ditandai lunas (
            {METHOD_LABEL[confirmation.method] ?? confirmation.method}). Pesanan
            dikirim ke dapur.
          </AlertBanner>
        )}

        {pending.length > 0 && (
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-warm-muted">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            </span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Cari meja atau nomor pesanan…"
              aria-label="Cari pesanan"
              className="w-full rounded-xl border-0 bg-warm-paper py-2.5 pl-10 pr-4 text-sm text-warm-espresso shadow-sm ring-1 ring-warm-line placeholder:text-warm-muted focus:outline-none focus:ring-2 focus:ring-warm-amber sm:max-w-md"
            />
          </div>
        )}

        {loading ? (
          <div role="status" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <span className="sr-only">Memuat antrean kasir…</span>
            {Array.from({ length: 6 }, (_, index) => (
              <div
                key={index}
                aria-hidden
                className="skeleton-warm h-40 rounded-2xl"
              />
            ))}
          </div>
        ) : pending.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-warm-line bg-warm-paper/60 px-6 py-20 text-center">
            <span className="text-4xl">💳</span>
            <h2 className="mt-3 text-lg font-semibold text-warm-espresso">
              Tidak ada pembayaran tertunda
            </h2>
            <p className="mt-1 text-sm text-warm-muted">
              Pesanan yang memilih bayar di kasir akan muncul di sini.
            </p>
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-warm-line bg-warm-paper/60 px-6 py-16 text-center">
            <span className="text-3xl">🔍</span>
            <h2 className="mt-3 font-semibold text-warm-espresso">
              Tidak ada pesanan yang cocok
            </h2>
            <button
              type="button"
              onClick={() => setQuery('')}
              className="mt-4 rounded-lg bg-warm-espresso/5 px-4 py-2 text-sm font-semibold text-warm-subtle transition hover:bg-warm-espresso/10"
            >
              Reset pencarian
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {visible.map((order) => (
              <PendingOrderCard
                key={order.id}
                order={order}
                now={now}
                onPay={setPayingOrder}
              />
            ))}
          </div>
        )}
      </div>

      {payingOrder && (
        <CashierPaymentModal
          order={payingOrder}
          onConfirm={handleConfirmPayment}
          onClose={() => setPayingOrder(null)}
        />
      )}

      {paidResult && (
        <PaymentSuccessModal
          order={paidResult.order}
          change={paidResult.cash?.change ?? null}
          onPrint={() => {
            setReceipt(paidResult);
            setPaidResult(null);
          }}
          onClose={() => setPaidResult(null)}
        />
      )}

      {receipt && (
        <ReceiptPrintModal
          order={receipt.order}
          cafeName={user.cafeName}
          cash={receipt.cash}
          downloading={printing}
          onDownloadPdf={() => void handleDownloadPdf()}
          onClose={() => setReceipt(null)}
        />
      )}
    </AppLayout>
  );
}
