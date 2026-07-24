import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import type { Order, PaymentMethodCode } from '../types/order';
import { useAuth } from '../auth/AuthContext';
import { useCashierOrders } from '../hooks/useCashierOrders';
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
 * Fase frontend: data & konfirmasi masih tiruan (belum memanggil API).
 */
export default function CashierPage() {
  const { user } = useAuth();
  const { pending, totalPending, markPaid } = useCashierOrders(user?.cafeId ?? '');

  const [query, setQuery] = useState('');
  /** Pesanan yang dialog pembayarannya sedang terbuka. */
  const [payingOrder, setPayingOrder] = useState<Order | null>(null);
  /** Pembayaran yang baru berhasil — dasar notifikasi sukses & cetak struk. */
  const [paidResult, setPaidResult] = useState<{
    order: Order;
    cash: CashDetail | null;
  } | null>(null);
  /** Struk yang sedang dipratinjau untuk dicetak. */
  const [receipt, setReceipt] = useState<{
    order: Order;
    cash: CashDetail | null;
  } | null>(null);
  const [printing, setPrinting] = useState(false);
  const [confirmation, setConfirmation] = useState<{
    tableName: string;
    method: PaymentMethodCode;
  } | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);

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

  const handleConfirmPayment = (
    method: PaymentMethodCode,
    cash: CashDetail | null,
  ) => {
    if (!payingOrder) return;
    const paid = markPaid(payingOrder.id, method);
    setPayingOrder(null);
    if (!paid) return;

    setPaidResult({ order: paid, cash });
    setConfirmation({ tableName: paid.tableName, method });
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
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
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
              className="w-full rounded-xl border-0 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-800 shadow-sm ring-1 ring-slate-200 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500 sm:max-w-md"
            />
          </div>
        )}

        {pending.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-20 text-center">
            <span className="text-4xl">💳</span>
            <h2 className="mt-3 text-lg font-semibold text-slate-700">
              Tidak ada pembayaran tertunda
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Pesanan yang memilih bayar di kasir akan muncul di sini.
            </p>
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-16 text-center">
            <span className="text-3xl">🔍</span>
            <h2 className="mt-3 font-semibold text-slate-700">
              Tidak ada pesanan yang cocok
            </h2>
            <button
              type="button"
              onClick={() => setQuery('')}
              className="mt-4 rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-200"
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
