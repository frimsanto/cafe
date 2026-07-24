import type { KitchenStatus, Order } from '../../types/order';
import { elapsedLabel, elapsedMinutes, formatClock } from '../../lib/time';
import KitchenItemRow from './KitchenItemRow';

interface KitchenOrderCardProps {
  order: Order;
  /** Timestamp "sekarang" dari clock halaman, agar lama pesanan ikut hidup. */
  now: number;
  /** Pesanan baru masuk — tampilkan sorotan sementara. */
  isNew?: boolean;
  /** Dipanggil saat chef mengubah status masak sebuah item. */
  onItemStatusChange: (itemId: string, status: KitchenStatus) => void;
}

// Warna aksen tiket berdasar lama pesanan — makin lama makin mendesak.
function urgency(mins: number) {
  if (mins >= 10) return { ring: 'ring-rose-500/60', head: 'bg-rose-500', time: 'text-rose-300' };
  if (mins >= 5) return { ring: 'ring-amber-500/50', head: 'bg-amber-500', time: 'text-amber-300' };
  return { ring: 'ring-slate-700', head: 'bg-brand-600', time: 'text-slate-300' };
}

/**
 * Tiket pesanan pada Layar Dapur — satu pesanan (meja) dengan daftar itemnya.
 */
export default function KitchenOrderCard({
  order,
  now,
  isNew = false,
  onItemStatusChange,
}: KitchenOrderCardProps) {
  const mins = elapsedMinutes(order.createdAt, now);
  const u = urgency(mins);
  const readyCount = order.items.filter((i) => i.kitchenStatus === 'READY').length;
  const total = order.items.length;
  const allReady = readyCount === total;

  // Prioritas sorotan: baru masuk > semua siap > urgensi waktu.
  const ringClass = isNew
    ? 'animate-pop-in ring-emerald-400'
    : allReady
      ? 'ring-emerald-500/70'
      : u.ring;

  return (
    <article
      className={`flex flex-col overflow-hidden rounded-2xl bg-slate-800 shadow-lg ring-2 ${ringClass}`}
    >
      {/* Header tiket: nomor meja, waktu masuk, nomor pesanan, & lama antre */}
      <header className={`flex items-center justify-between gap-2 px-4 py-3 ${u.head}`}>
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 truncate text-2xl font-black tracking-tight text-white">
            {order.tableName}
            {isNew && (
              <span className="animate-pulse rounded-full bg-emerald-400 px-2 py-0.5 text-[11px] font-extrabold uppercase tracking-wide text-slate-900">
                Baru
              </span>
            )}
          </h2>
          <p className="flex items-center gap-1.5 text-xs font-medium text-white/80">
            <span>🕐 Masuk {formatClock(order.createdAt)}</span>
            <span className="text-white/40">·</span>
            <span className="truncate font-mono">{order.id}</span>
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className={`text-lg font-bold tabular-nums ${u.time} brightness-125`}>
            ⏱ {elapsedLabel(order.createdAt, now)}
          </p>
          <p className="text-xs font-medium text-white/70">
            {readyCount}/{total} siap
          </p>
        </div>
      </header>

      {/* Item */}
      <ul className="flex-1 divide-y divide-slate-700 px-4">
        {order.items.map((item) => (
          <KitchenItemRow
            key={item.id}
            item={item}
            onStatusChange={(status) => onItemStatusChange(item.id, status)}
          />
        ))}
      </ul>

      {/* Footer status ringkas — saat semua siap jadi indikator notifikasi. */}
      {allReady ? (
        <footer className="bg-emerald-500/25 px-4 py-3 text-center">
          <p className="text-base font-extrabold uppercase tracking-wide text-emerald-200">
            🔔 Pesanan Siap Diantar
          </p>
          <p className="mt-0.5 text-xs font-semibold text-emerald-300/90">
            Notifikasi terkirim ke pelanggan
          </p>
        </footer>
      ) : (
        <footer className="bg-slate-900/50 px-4 py-3 text-center text-base font-extrabold uppercase tracking-wide text-slate-300">
          Sedang disiapkan
        </footer>
      )}
    </article>
  );
}
