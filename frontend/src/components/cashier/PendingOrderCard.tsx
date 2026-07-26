import type { CashierOrderDTO } from '../../types/api';
import { formatRupiah } from '../../lib/format';
import { elapsedLabel, elapsedMinutes } from '../../lib/time';

interface PendingOrderCardProps {
  order: CashierOrderDTO;
  /** Menit tunggu sejak pesanan dibuat — untuk menandai antrean yang menua. */
  now: number;
  /** Buka dialog pembayaran untuk pesanan ini. */
  onPay: (order: CashierOrderDTO) => void;
}

/** Batas menit sebelum pesanan disorot sebagai "menunggu terlalu lama". */
const STALE_MINUTES = 10;

/** Penanda status pembayaran (kuning/hijau/merah) di pojok kartu. */
const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  LUNAS: { label: 'Lunas', className: 'bg-warm-success/15 text-warm-success' },
  GAGAL: { label: 'Gagal', className: 'bg-rose-100 text-rose-700' },
  MENUNGGU: { label: 'Menunggu', className: 'bg-amber-100 text-amber-700' },
};

function PaymentBadge({ status }: { status: string | null }) {
  const badge = STATUS_BADGE[status ?? 'MENUNGGU'] ?? STATUS_BADGE.MENUNGGU;
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.className}`}
    >
      {badge.label}
    </span>
  );
}

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
      className={`flex flex-col rounded-2xl bg-warm-paper shadow-sm ring-1 transition ${
        stale ? 'ring-2 ring-warm-amber' : 'ring-warm-line'
      }`}
    >
      <header className="flex items-start justify-between gap-2 border-b border-warm-line p-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-lg font-bold text-warm-espresso">
              {order.tableName}
            </h2>
            <PaymentBadge status={order.statusPembayaran} />
          </div>
          <p className="font-mono text-xs text-warm-muted">{order.id}</p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${
            stale ? 'bg-warm-amber/15 text-warm-subtle' : 'bg-warm-espresso/5 text-warm-muted'
          }`}
        >
          ⏱ {elapsedLabel(order.createdAt, now)}
        </span>
      </header>

      <ul className="flex-1 divide-y divide-warm-line px-4">
        {order.items.map((item) => (
          <li key={item.id} className="flex justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-warm-espresso">
                <span className="text-warm-amber">{item.quantity}×</span> {item.name}
              </p>
              {item.notes && (
                <p className="truncate text-xs italic text-warm-muted">
                  “{item.notes}”
                </p>
              )}
            </div>
            <span className="shrink-0 text-sm font-medium text-warm-subtle tabular-nums">
              {formatRupiah(item.price * item.quantity)}
            </span>
          </li>
        ))}
      </ul>

      <div className="border-t border-warm-line p-4">
        <div className="mb-3 flex items-end justify-between">
          <span className="text-sm text-warm-muted">
            Total · {itemCount} item
          </span>
          <span className="text-xl font-bold text-warm-espresso tabular-nums">
            {formatRupiah(order.totalAmount)}
          </span>
        </div>

        <button
          type="button"
          onClick={() => onPay(order)}
          className="w-full rounded-xl bg-warm-amber py-2.5 text-sm font-bold text-white transition hover:brightness-95 active:scale-95"
        >
          Terima Pembayaran
        </button>
      </div>
    </article>
  );
}
