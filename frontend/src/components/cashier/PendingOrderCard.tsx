import type { Order } from '../../types/order';
import { formatRupiah } from '../../lib/format';
import { elapsedLabel, elapsedMinutes } from '../../lib/time';

interface PendingOrderCardProps {
  order: Order;
  /** Menit tunggu sejak pesanan dibuat — untuk menandai antrean yang menua. */
  now: number;
  /** Buka dialog pembayaran untuk pesanan ini. */
  onPay: (order: Order) => void;
}

/** Batas menit sebelum pesanan disorot sebagai "menunggu terlalu lama". */
const STALE_MINUTES = 10;

/**
 * Satu pesanan yang menunggu pembayaran di kasir: identitas meja, rincian item,
 * total, dan tombol penanda lunas.
 *
 * Pesanan yang sudah lama menunggu diberi aksen jingga supaya kasir mendahulukan
 * tamu yang paling lama menunggu.
 */
export default function PendingOrderCard({
  order,
  now,
  onPay,
}: PendingOrderCardProps) {
  const waiting = elapsedMinutes(order.createdAt, now);
  const stale = waiting >= STALE_MINUTES;
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <article
      className={`flex flex-col rounded-2xl bg-white shadow-sm ring-1 transition ${
        stale ? 'ring-2 ring-amber-400' : 'ring-slate-200'
      }`}
    >
      <header className="flex items-start justify-between gap-2 border-b border-slate-100 p-4">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-bold text-slate-900">
            {order.tableName}
          </h2>
          <p className="font-mono text-xs text-slate-400">{order.id}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
            stale ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'
          }`}
        >
          ⏱ {elapsedLabel(order.createdAt, now)}
        </span>
      </header>

      <ul className="flex-1 divide-y divide-slate-100 px-4">
        {order.items.map((item) => (
          <li key={item.id} className="flex justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-800">
                <span className="text-brand-700">{item.quantity}×</span> {item.name}
              </p>
              {item.notes && (
                <p className="truncate text-xs italic text-slate-400">
                  “{item.notes}”
                </p>
              )}
            </div>
            <span className="shrink-0 text-sm font-medium text-slate-600 tabular-nums">
              {formatRupiah(item.price * item.quantity)}
            </span>
          </li>
        ))}
      </ul>

      <div className="border-t border-slate-100 p-4">
        <div className="mb-3 flex items-end justify-between">
          <span className="text-sm text-slate-500">
            Total · {itemCount} item
          </span>
          <span className="text-xl font-bold text-slate-900 tabular-nums">
            {formatRupiah(order.totalAmount)}
          </span>
        </div>

        <button
          type="button"
          onClick={() => onPay(order)}
          className="w-full rounded-xl bg-brand-600 py-2.5 text-sm font-bold text-white transition hover:bg-brand-700 active:scale-95"
        >
          Terima Pembayaran
        </button>
      </div>
    </article>
  );
}
