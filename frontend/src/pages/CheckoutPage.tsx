import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../cart/CartContext';
import { formatRupiah } from '../lib/format';
import { paymentMethods } from '../data/paymentMethods';
import type { PaymentMethodCode } from '../types/order';
import { saveLastOrder } from '../order/orderStore';
import { ordersApi } from '../api/orders';
import { describeApiError } from '../lib/apiClient';
import { useTableSession } from '../table/TableSessionContext';
import PaymentMethodOption from '../components/checkout/PaymentMethodOption';
import PaymentSimulationModal from '../components/checkout/PaymentSimulationModal';

/**
 * Halaman checkout & simulasi pembayaran di meja.
 *
 * Alur: tinjau ringkasan pesanan → pilih metode (QRIS/GoPay/Kartu) → tekan
 * "Bayar Sekarang" → modal simulasi. Saat simulasi sukses, order dibuat &
 * disimpan, keranjang dikosongkan, lalu diarahkan ke halaman sukses.
 *
 * Pesanan dibuat lebih dulu lewat `POST /orders` (status MENUNGGU_PEMBAYARAN),
 * baru dibayar lewat `/pay`. Urutan ini penting: pesanan tercatat di database
 * sebelum uang berpindah, sehingga pembayaran yang berhasil tidak pernah
 * kehilangan pesanannya.
 */
export default function CheckoutPage() {
  const { lines, totalItems, totalAmount, clearCart } = useCart();
  const { table } = useTableSession();
  const navigate = useNavigate();

  const [selectedMethod, setSelectedMethod] = useState<PaymentMethodCode>(
    paymentMethods[0].code,
  );
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Seed QR simulasi — tetap sama selama sesi checkout ini.
  const seed = useMemo(() => `${table?.tableId ?? 'meja'}-${Date.now()}`, [table]);

  // Kalau keranjang kosong (mis. dibuka langsung / setelah bayar), balik ke menu.
  useEffect(() => {
    if (lines.length === 0) navigate('/menu', { replace: true });
  }, [lines.length, navigate]);

  if (lines.length === 0) return null;

  const activeMethod = paymentMethods.find((m) => m.code === selectedMethod)!;

  const handlePaymentSuccess = async () => {
    if (!table) {
      setError('Meja belum dikenali. Pindai ulang QR di meja kamu.');
      setShowModal(false);
      return;
    }

    try {
      const created = await ordersApi.create(
        table.cafeId,
        table.tableId,
        lines.map((line) => ({
          menuItemId: line.item.id,
          quantity: line.quantity,
          notes: line.notes,
        })),
      );
      const paid = await ordersApi.pay(table.cafeId, created.id, selectedMethod);

      // Simpan pesanan versi server — id & id transaksinya yang dipakai struk.
      saveLastOrder({ ...paid, tableName: table.tableName });
      clearCart();
      setShowModal(false);
      navigate('/pesanan/sukses', { replace: true });
    } catch (err) {
      setShowModal(false);
      setError(describeApiError(err, 'Pesanan gagal diproses. Coba lagi.'));
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-slate-100 shadow-xl">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <button
          type="button"
          onClick={() => navigate('/keranjang')}
          aria-label="Kembali ke keranjang"
          className="rounded-full p-1.5 text-slate-600 transition hover:bg-slate-100"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold text-slate-900">Pembayaran</h1>
          <p className="text-xs text-slate-500">
            {table ? `${table.cafeName} · ${table.tableName}` : 'Meja belum dikenali'}
          </p>
        </div>
      </header>

      <main className="flex-1 space-y-5 px-4 py-4">
        {error && (
          <p
            role="alert"
            className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700"
          >
            {error}
          </p>
        )}

        {/* Ringkasan pesanan */}
        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
            Ringkasan Pesanan
          </h2>
          <ul className="divide-y divide-slate-100">
            {lines.map((line) => (
              <li key={line.item.id} className="flex justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-800">
                    <span className="text-brand-700">{line.quantity}×</span>{' '}
                    {line.item.name}
                  </p>
                  {line.notes && (
                    <p className="truncate text-xs italic text-slate-400">
                      “{line.notes}”
                    </p>
                  )}
                </div>
                <span className="shrink-0 font-medium text-slate-700 tabular-nums">
                  {formatRupiah(line.item.price * line.quantity)}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* Metode pembayaran */}
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">
            Metode Pembayaran
          </h2>
          <div className="space-y-2.5">
            {paymentMethods.map((method) => (
              <PaymentMethodOption
                key={method.code}
                method={method}
                selected={method.code === selectedMethod}
                onSelect={() => setSelectedMethod(method.code)}
              />
            ))}
          </div>
        </section>
      </main>

      {/* Total + bayar */}
      <footer className="sticky bottom-0 border-t border-slate-200 bg-white px-4 pb-5 pt-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm text-slate-500">Total ({totalItems} item)</span>
          <span className="text-xl font-bold text-slate-900 tabular-nums">
            {formatRupiah(totalAmount)}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="w-full rounded-2xl bg-brand-600 py-3.5 text-center font-semibold text-white shadow-sm transition hover:bg-brand-700 active:scale-[0.99]"
        >
          Bayar Sekarang
        </button>
      </footer>

      {showModal && (
        <PaymentSimulationModal
          method={selectedMethod}
          methodName={activeMethod.name}
          amount={totalAmount}
          seed={seed}
          onSuccess={() => void handlePaymentSuccess()}
          onCancel={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
