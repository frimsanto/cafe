import type { Order } from '../../types/order';
import { formatRupiah } from '../../lib/format';
import { cashierPaymentMethods, paymentMethods } from '../../data/paymentMethods';

interface ReceiptPreviewProps {
  order: Order;
  cafeName: string;
  /** Uang yang diterima & kembalian — hanya untuk pembayaran tunai. */
  cash?: { received: number; change: number } | null;
}

function methodLabel(order: Order): string {
  const method = order.payment?.method;
  if (!method) return '-';
  const all = [...paymentMethods, ...cashierPaymentMethods];
  return all.find((m) => m.code === method)?.name ?? method;
}

function formatWaktu(iso: string): string {
  return new Date(iso).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const Divider = () => (
  <div className="my-2 border-t border-dashed border-slate-300" />
);

/**
 * Pratinjau struk di layar — meniru hasil cetak kertas 80mm (huruf monospace,
 * lebar tetap) sehingga kasir tahu persis apa yang akan keluar dari printer.
 *
 * Elemen ini juga yang dicetak: kelas `print-area` membuatnya menjadi satu-
 * satunya bagian halaman yang tampil saat dialog cetak peramban dibuka
 * (lihat aturan `@media print` di `index.css`).
 */
export default function ReceiptPreview({
  order,
  cafeName,
  cash = null,
}: ReceiptPreviewProps) {
  return (
    <div className="print-area mx-auto w-[80mm] max-w-full bg-white p-4 font-mono text-[11px] leading-relaxed text-slate-900 shadow-sm ring-1 ring-slate-200">
      <div className="text-center">
        <p className="text-sm font-bold uppercase tracking-wide">{cafeName}</p>
        <p className="mt-1 font-semibold">STRUK PEMBAYARAN</p>
      </div>

      <Divider />

      <dl className="space-y-0.5">
        <div className="flex justify-between gap-2">
          <dt>No. Pesanan</dt>
          <dd className="text-right">{order.id}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Meja</dt>
          <dd className="text-right">{order.tableName}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>Waktu</dt>
          <dd className="text-right">{formatWaktu(order.createdAt)}</dd>
        </div>
      </dl>

      <Divider />

      <ul className="space-y-1.5">
        {order.items.map((item) => (
          <li key={item.id}>
            <p className="break-words">{item.name}</p>
            <div className="flex justify-between gap-2">
              <span className="text-slate-500">
                {item.quantity} x {formatRupiah(item.price)}
              </span>
              <span className="tabular-nums">
                {formatRupiah(item.price * item.quantity)}
              </span>
            </div>
            {item.notes && (
              <p className="break-words text-slate-500">Catatan: {item.notes}</p>
            )}
          </li>
        ))}
      </ul>

      <Divider />

      <div className="flex justify-between gap-2 text-sm font-bold">
        <span>TOTAL</span>
        <span className="tabular-nums">{formatRupiah(order.totalAmount)}</span>
      </div>

      <dl className="mt-1.5 space-y-0.5">
        <div className="flex justify-between gap-2">
          <dt>Metode</dt>
          <dd className="text-right">{methodLabel(order)}</dd>
        </div>

        {cash && (
          <>
            <div className="flex justify-between gap-2">
              <dt>Tunai</dt>
              <dd className="text-right tabular-nums">
                {formatRupiah(cash.received)}
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Kembali</dt>
              <dd className="text-right tabular-nums">
                {formatRupiah(cash.change)}
              </dd>
            </div>
          </>
        )}

        <div className="flex justify-between gap-2">
          <dt>Status</dt>
          <dd className="text-right font-semibold">
            {order.payment
              ? order.payment.status === 'SUCCESS'
                ? 'LUNAS'
                : order.payment.status
              : 'BELUM DIBAYAR'}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>ID Transaksi</dt>
          <dd className="text-right">{order.payment?.transactionId ?? '-'}</dd>
        </div>
      </dl>

      <Divider />

      <div className="text-center text-slate-500">
        <p>Terima kasih atas kunjungan Anda!</p>
        <p>Simpan struk ini sebagai bukti pembayaran.</p>
      </div>
    </div>
  );
}
