import type { CashierOrderDTO } from '../../types/api';
import { formatRupiah } from '../../lib/format';
import { elapsedLabel, elapsedMinutes, formatClock } from '../../lib/time';
import { labelStatus, nadaStatus, normalisasiStatus } from '../../lib/paymentStatus';
import {
  kodePesanan,
  labelJenis,
  labelSumber,
  labelTahapDapur,
  labelTujuan,
  nadaTahapDapur,
  statusPesanan,
  sumberPesanan,
  tahapDapur,
} from '../../lib/orderStatus';
import { labelMetode } from '../../data/paymentMethods';
import PaymentIcon from '../payment/PaymentIcon';
import StatusBadge, { type NadaBadge } from '../payment/StatusBadge';

interface OrderCardProps {
  order: CashierOrderDTO;
  /** Timestamp "sekarang" dari jam halaman, agar lama menunggu ikut berdetak. */
  now: number;
  onDetail: (order: CashierOrderDTO) => void;
  /** Buka dialog pembayaran (hanya untuk yang belum lunas). */
  onPay: (order: CashierOrderDTO) => void;
  /** Tolak pengajuan pembayaran tamu (hanya untuk yang menunggu verifikasi). */
  onTolak: (order: CashierOrderDTO) => void;
  /** Batalkan pesanan dengan alasan. */
  onBatal: (order: CashierOrderDTO) => void;
  /** Tandai sudah diserahkan ke tamu. */
  onSelesai: (order: CashierOrderDTO) => void;
}

/** Batas menit sebelum pesanan disorot sebagai "menunggu terlalu lama". */
const STALE_MINUTES = 10;

/** Peta nada `lib/paymentStatus` → nada badge. Satu tempat, tanpa duplikat. */
const NADA: Record<string, NadaBadge> = {
  netral: 'abu',
  menunggu: 'kuning',
  sukses: 'hijau',
  gagal: 'merah',
};

/**
 * Satu pesanan di layar kasir — dipakai SEMUA tab.
 *
 * Kartunya menampilkan lima keadaan yang berbeda sekaligus (pesanan,
 * pembayaran, dapur, jenis, sumber) karena kasir memang perlu menjawab dua
 * pertanyaan berbeda dari kartu yang sama: "uangnya sudah masuk?" dan
 * "makanannya sudah jalan?". Satu badge tidak akan pernah cukup.
 *
 * Tombol yang muncul mengikuti keadaan, bukan tab: pesanan yang belum lunas
 * menawarkan Terima/Tolak, yang sudah siap menawarkan "Diserahkan", dan yang
 * sudah tuntas hanya menawarkan Lihat Detail. Dengan begitu kasir tidak pernah
 * menekan tombol yang akan ditolak server.
 */
export default function OrderCard({
  order,
  now,
  onDetail,
  onPay,
  onTolak,
  onBatal,
  onSelesai,
}: OrderCardProps) {
  const waiting = elapsedMinutes(order.createdAt, now);
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);

  const statusBayar = normalisasiStatus(order.statusPembayaran);
  const perluDiperiksa = statusBayar === 'AWAITING_VERIFICATION';
  const lunas = statusBayar === 'PAID';
  const status = statusPesanan(order);
  const tahap = tahapDapur(order);
  const dibatalkan = status === 'CANCELLED';
  const tuntas = status === 'COMPLETED' || dibatalkan;

  // Sorotan hanya untuk yang benar-benar menunggu tindakan; pesanan yang sudah
  // tuntas tidak perlu ikut berteriak dari layar.
  const stale = !tuntas && !lunas && waiting >= STALE_MINUTES;

  const ring = dibatalkan
    ? 'ring-warm-line opacity-70'
    : perluDiperiksa
      ? 'ring-2 ring-amber-400'
      : tahap === 'READY'
        ? 'ring-2 ring-warm-success'
        : stale
          ? 'ring-2 ring-warm-amber'
          : 'ring-warm-line';

  return (
    <article
      className={`flex flex-col rounded-2xl bg-warm-paper shadow-sm ring-1 transition ${ring}`}
    >
      <header className="flex items-start justify-between gap-2 border-b border-warm-line p-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <h2 className="truncate text-lg font-bold text-warm-espresso">
              {labelTujuan(order)}
            </h2>
            <span className="rounded-full bg-warm-espresso/5 px-2 py-0.5 text-[11px] font-semibold text-warm-subtle">
              {labelJenis(order)}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                sumberPesanan(order) === 'CASHIER'
                  ? 'bg-warm-amber/15 text-warm-subtle'
                  : 'bg-warm-cream text-warm-subtle'
              }`}
            >
              {labelSumber(order)}
            </span>
          </div>
          <p className="mt-0.5 font-mono text-xs text-warm-muted">
            {kodePesanan(order)}
            {order.customerName ? ` · ${order.customerName}` : ''}
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
            stale ? 'bg-warm-amber/15 text-warm-subtle' : 'bg-warm-espresso/5 text-warm-muted'
          }`}
          title={`Masuk ${formatClock(order.createdAt)}`}
        >
          <PaymentIcon name="clock" size={12} />
          {elapsedLabel(order.createdAt, now)}
        </span>
      </header>

      {/* Tiga status yang berdiri sendiri. */}
      <div className="flex flex-wrap gap-1.5 border-b border-warm-line px-4 py-2.5">
        <StatusBadge nada={NADA[nadaStatus(order.statusPembayaran)]} size="sm">
          {labelStatus(order.statusPembayaran)}
        </StatusBadge>
        {order.metodePembayaran && (
          <span className="inline-flex items-center rounded-full bg-warm-espresso/5 px-2 py-0.5 text-[11px] font-semibold text-warm-subtle">
            {labelMetode(order.metodePembayaran)}
          </span>
        )}
        {tahap !== 'NOT_SENT' && (
          <StatusBadge nada={nadaTahapDapur(order)} size="sm">
            {labelTahapDapur(order)}
          </StatusBadge>
        )}
      </div>

      {perluDiperiksa && (
        <p className="flex items-start gap-2 border-b border-warm-line bg-amber-50 px-4 py-2.5 text-xs leading-relaxed text-amber-900">
          <PaymentIcon name="alert" size={14} className="mt-px shrink-0" />
          <span>
            Tamu mengaku sudah membayar lewat{' '}
            <strong>{labelMetode(order.metodePembayaran)}</strong>. Periksa dulu
            uangnya benar-benar masuk sebelum menekan Terima.
          </span>
        </p>
      )}

      {dibatalkan && order.alasanPembatalan && (
        <p className="border-b border-warm-line bg-rose-50 px-4 py-2.5 text-xs leading-relaxed text-rose-900">
          Dibatalkan: {order.alasanPembatalan}
        </p>
      )}

      <ul className="flex-1 divide-y divide-warm-line px-4">
        {order.items.slice(0, 4).map((item) => (
          <li key={item.id} className="flex justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-warm-espresso">
                <span className="text-warm-amber">{item.quantity}×</span> {item.name}
              </p>
              {item.notes && (
                <p className="truncate text-xs italic text-warm-muted">“{item.notes}”</p>
              )}
            </div>
            <span className="shrink-0 text-sm font-medium text-warm-subtle tabular-nums">
              {formatRupiah(item.price * item.quantity)}
            </span>
          </li>
        ))}
        {order.items.length > 4 && (
          <li className="py-2 text-xs text-warm-muted">
            +{order.items.length - 4} item lainnya — buka detail untuk melihat semuanya
          </li>
        )}
      </ul>

      <div className="border-t border-warm-line p-4">
        <div className="mb-3 flex items-end justify-between">
          <span className="text-sm text-warm-muted">Total · {itemCount} item</span>
          <span className="text-xl font-bold text-warm-espresso tabular-nums">
            {formatRupiah(order.totalAmount)}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onDetail(order)}
            className="flex-1 rounded-xl bg-warm-espresso/5 py-2.5 text-sm font-semibold text-warm-subtle transition hover:bg-warm-espresso/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-warm-amber active:scale-95"
          >
            Lihat Detail
          </button>

          {!tuntas && !lunas && (
            <>
              <button
                type="button"
                onClick={() => (perluDiperiksa ? onTolak(order) : onBatal(order))}
                className="rounded-xl bg-rose-50 px-3 py-2.5 text-sm font-bold text-rose-700 ring-1 ring-rose-200 transition hover:bg-rose-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 active:scale-95"
              >
                {perluDiperiksa ? 'Tolak' : 'Batalkan'}
              </button>
              <button
                type="button"
                onClick={() => onPay(order)}
                className="flex-1 rounded-xl bg-warm-amber py-2.5 text-sm font-bold text-white transition hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-warm-amber focus-visible:ring-offset-2 active:scale-95"
              >
                {perluDiperiksa ? 'Terima' : 'Terima Pembayaran'}
              </button>
            </>
          )}

          {lunas && tahap === 'READY' && (
            <button
              type="button"
              onClick={() => onSelesai(order)}
              className="flex-1 rounded-xl bg-warm-success py-2.5 text-sm font-bold text-white transition hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-warm-success focus-visible:ring-offset-2 active:scale-95"
            >
              Selesai / Diserahkan
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
