import type { KitchenStatus, Order } from '../../types/order';
import { elapsedLabel, elapsedMinutes, formatClock } from '../../lib/time';
import { nomorAntrian } from '../../lib/orderCode';
import {
  kodePesanan,
  labelJenis,
  labelSumber,
  labelTujuan,
  tahapDapur,
} from '../../lib/orderStatus';
import KitchenItemRow from './KitchenItemRow';

interface KitchenOrderCardProps {
  order: Order;
  /** Timestamp "sekarang" dari clock halaman, agar lama pesanan ikut hidup. */
  now: number;
  /** Pesanan baru masuk — tampilkan sorotan sementara. */
  isNew?: boolean;
  /**
   * Meja ini sudah punya tiket lain yang lebih dulu masuk. Ditandai supaya chef
   * tahu piring-piringnya menyusul ke meja yang sedang dilayani, bukan ke tamu
   * baru — urutan penyajiannya berbeda.
   */
  isTambahan?: boolean;
  /** Dipanggil saat chef mengubah status masak sebuah item. */
  onItemStatusChange: (itemId: string, status: KitchenStatus) => void;
  /** Gerakkan SELURUH tiket sekaligus ("Mulai Proses" / "Siap Disajikan"). */
  onStageChange: (status: 'PREPARING' | 'READY') => void;
}

/**
 * Aksen tiket berdasar lama pesanan — tiga tingkat agar terbaca dari 1-2 meter:
 * normal (<5 mnt), waspada (5-9 mnt), dan mendesak (>=10 mnt).
 *
 * `glow` adalah lapisan cincin yang berdenyut di atas kartu. Denyutnya sengaja
 * ditaruh di lapisan terpisah, bukan di kartu, supaya nama meja dan daftar item
 * tetap pekat 100% — tiket paling mendesak justru tidak boleh ikut memudar.
 */
function urgency(mins: number) {
  if (mins >= 10) {
    return {
      border: 'border-4 border-rose-500 shadow-xl shadow-rose-500/30',
      head: 'bg-rose-600',
      time: 'text-white',
      glow: 'animate-pulse ring-4 ring-rose-400/70',
    };
  }
  if (mins >= 5) {
    return {
      border: 'border-4 border-amber-500 shadow-lg shadow-amber-500/20',
      head: 'bg-amber-600',
      time: 'text-white',
      glow: 'animate-[pulse_2.6s_cubic-bezier(0.4,0,0.6,1)_infinite] ring-2 ring-amber-400/50',
    };
  }
  return {
    border: 'border-2 border-slate-700',
    head: 'bg-slate-700',
    time: 'text-slate-100',
    glow: null,
  };
}

/**
 * Tiket pesanan pada Layar Dapur — satu pesanan dengan daftar itemnya.
 *
 * Chef punya DUA cara menggerakkannya, dan keduanya sah: menekan item satu per
 * satu (untuk tiket campuran, di mana kopi selesai jauh lebih dulu daripada
 * nasi goreng), atau menekan tombol besar di kaki tiket untuk menggerakkan
 * semuanya sekaligus. Yang kedua ada karena pada jam sibuk, empat ketukan untuk
 * satu tiket adalah tiga ketukan terlalu banyak.
 */
export default function KitchenOrderCard({
  order,
  now,
  isNew = false,
  isTambahan = false,
  onItemStatusChange,
  onStageChange,
}: KitchenOrderCardProps) {
  const mins = elapsedMinutes(order.createdAt, now);
  const u = urgency(mins);
  const readyCount = order.items.filter((i) => i.kitchenStatus === 'READY').length;
  const total = order.items.length;
  const tahap = tahapDapur(order);
  const allReady = tahap === 'READY' || tahap === 'COMPLETED';

  // Prioritas sorotan: baru masuk > semua siap > urgensi waktu.
  const borderClass = isNew
    ? 'animate-pop-in border-4 border-emerald-400 shadow-lg shadow-emerald-500/20'
    : allReady
      ? 'border-4 border-emerald-500'
      : u.border;

  // Denyut urgensi tidak dipakai saat tiket sudah rampung — sudah tak mendesak.
  const glowClass = isNew || allReady ? null : u.glow;

  return (
    <article
      className={`relative flex flex-col overflow-hidden rounded-2xl bg-slate-800 ${borderClass}`}
    >
      {glowClass && (
        <span
          aria-hidden
          className={`pointer-events-none absolute inset-0 z-10 rounded-2xl ${glowClass}`}
        />
      )}

      {/* Header tiket: tujuan besar, progres siap, jam masuk, & lama antre */}
      <header className={`px-5 py-4 ${u.head}`}>
        <div className="flex items-center justify-between gap-3">
          <h2 className="flex min-w-0 items-center gap-2 text-3xl font-black tracking-tight text-white">
            <span className="truncate">{labelTujuan(order)}</span>
            {isNew && (
              <span className="shrink-0 animate-pulse rounded-full bg-emerald-400 px-2.5 py-1 text-sm font-extrabold uppercase tracking-wide text-slate-900">
                Baru
              </span>
            )}
          </h2>
          <span className="shrink-0 text-lg font-bold tabular-nums text-white/80">
            {readyCount}/{total} siap
          </span>
        </div>

        {/* Penanda: nomor antrian, jenis, sumber, dan tambahan. */}
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs font-bold text-white">
            {nomorAntrian(order.queueNumber)}
          </span>
          <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs font-semibold text-white/90">
            {labelJenis(order)}
          </span>
          <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs font-semibold text-white/90">
            {labelSumber(order)}
          </span>
          {isTambahan && (
            <span className="rounded-full bg-amber-300 px-2 py-0.5 text-xs font-extrabold uppercase tracking-wide text-slate-900">
              Pesanan Tambahan
            </span>
          )}
          {order.customerName && (
            <span className="rounded-full bg-white/15 px-2 py-0.5 text-xs font-semibold text-white/90">
              {order.customerName}
            </span>
          )}
        </div>

        <div className="mt-1.5 flex items-center justify-between gap-3">
          <span className="font-mono text-sm font-medium text-white/70">
            {/* Kode pesanan ikut dicetak di sini supaya chef bisa mencocokkan
                tiket dengan layar kasir tanpa menebak dari nama meja. */}
            {kodePesanan(order)} · masuk {formatClock(order.createdAt)}
          </span>
          <span className={`text-xl font-black tabular-nums ${u.time}`}>
            ⏱ {elapsedLabel(order.createdAt, now)}
          </span>
        </div>
      </header>

      {/* Catatan untuk seluruh pesanan — dibaca sebelum item mana pun disentuh. */}
      {order.catatan && (
        <p className="border-b border-slate-700 bg-amber-500/15 px-5 py-2.5 text-base font-semibold leading-snug text-amber-200">
          📝 {order.catatan}
        </p>
      )}

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

      {/* Kaki tiket: tombol besar yang menggerakkan seluruh pesanan. */}
      {allReady ? (
        <footer className="bg-emerald-500 px-5 py-4 text-center">
          <p className="text-xl font-black uppercase tracking-wide text-white">
            ✅ Pesanan Siap Diantar
          </p>
          <p className="mt-0.5 text-sm font-semibold text-emerald-50">
            Menunggu kasir menandainya sudah diserahkan
          </p>
        </footer>
      ) : (
        <footer className="grid grid-cols-2 gap-2 bg-slate-900/50 p-3">
          <button
            type="button"
            onClick={() => onStageChange('PREPARING')}
            disabled={tahap === 'PREPARING'}
            className="rounded-xl bg-sky-600 py-3 text-base font-extrabold uppercase tracking-wide text-white transition hover:bg-sky-500 active:scale-95 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
          >
            {tahap === 'PREPARING' ? 'Sedang Diproses' : 'Mulai Proses'}
          </button>
          <button
            type="button"
            onClick={() => onStageChange('READY')}
            className="rounded-xl bg-emerald-600 py-3 text-base font-extrabold uppercase tracking-wide text-white transition hover:bg-emerald-500 active:scale-95"
          >
            Siap Disajikan
          </button>
        </footer>
      )}
    </article>
  );
}
