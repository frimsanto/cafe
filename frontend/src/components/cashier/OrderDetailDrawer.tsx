import { useEffect } from 'react';
import type { CashierOrderDTO } from '../../types/api';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { formatRupiah } from '../../lib/format';
import { formatClock, elapsedLabel } from '../../lib/time';
import { nomorAntrian } from '../../lib/orderCode';
import { labelStatus, nadaStatus, normalisasiStatus } from '../../lib/paymentStatus';
import { KITCHEN_STATUS_META } from '../../lib/kitchenStatus';
import {
  kodePesanan,
  labelJenis,
  labelSumber,
  labelStatusPesanan,
  labelTahapDapur,
  labelTujuan,
  nadaStatusPesanan,
  nadaTahapDapur,
  statusPesanan,
  tahapDapur,
} from '../../lib/orderStatus';
import { labelMetode } from '../../data/paymentMethods';
import ModalScrollArea from '../common/ModalScrollArea';
import StatusBadge, { type NadaBadge } from '../payment/StatusBadge';

interface OrderDetailDrawerProps {
  order: CashierOrderDTO;
  onClose: () => void;
  onPay: (order: CashierOrderDTO) => void;
  onTolak: (order: CashierOrderDTO) => void;
  onBatal: (order: CashierOrderDTO) => void;
  onSelesai: (order: CashierOrderDTO) => void;
  onCetak: (order: CashierOrderDTO) => void;
}

const NADA: Record<string, NadaBadge> = {
  netral: 'abu',
  menunggu: 'kuning',
  sukses: 'hijau',
  gagal: 'merah',
};

/** Satu baris "label — nilai" pada daftar rincian. */
function Baris({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <dt className="shrink-0 text-xs text-warm-muted">{label}</dt>
      <dd className="min-w-0 text-right text-sm font-medium text-warm-espresso">
        {children}
      </dd>
    </div>
  );
}

/**
 * Susun garis waktu dari cap waktu yang BENAR-BENAR tersimpan.
 *
 * Tahap yang tidak punya cap waktu sengaja tidak ditampilkan, bukan ditebak
 * dari status sekarang: riwayat yang mengarang jam kejadian lebih buruk
 * daripada riwayat yang jujur bolong — kasir yang menelusuri selisih kas
 * memerlukan yang pertama, bukan cerita yang enak dibaca.
 */
function riwayat(order: CashierOrderDTO): { label: string; waktu: string }[] {
  const baris: { label: string; waktu: string | null | undefined }[] = [
    { label: 'Pesanan dibuat', waktu: order.createdAt },
    { label: 'Pembayaran diterima', waktu: order.paidAt },
    { label: 'Dikonfirmasi & masuk dapur', waktu: order.kitchenQueuedAt ?? order.confirmedAt },
    { label: 'Mulai diproses dapur', waktu: order.kitchenStartedAt },
    { label: 'Siap disajikan', waktu: order.kitchenReadyAt },
    { label: 'Diserahkan ke tamu', waktu: order.completedAt },
    { label: 'Dibatalkan', waktu: order.cancelledAt },
  ];
  return baris
    .filter((b): b is { label: string; waktu: string } => Boolean(b.waktu))
    .map((b) => ({ label: b.label, waktu: b.waktu }));
}

/**
 * Panel rincian satu pesanan: identitas, tiga status, seluruh item beserta
 * catatannya, rincian pembayaran, dan riwayat waktunya.
 *
 * Tombol tindakannya sama dengan yang ada di kartu — kasir yang sudah membuka
 * detail tidak perlu menutupnya dulu untuk bisa menekan Terima.
 */
export default function OrderDetailDrawer({
  order,
  onClose,
  onPay,
  onTolak,
  onBatal,
  onSelesai,
  onCetak,
}: OrderDetailDrawerProps) {
  useBodyScrollLock();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const statusBayar = normalisasiStatus(order.statusPembayaran);
  const perluDiperiksa = statusBayar === 'AWAITING_VERIFICATION';
  const lunas = statusBayar === 'PAID';
  const status = statusPesanan(order);
  const tahap = tahapDapur(order);
  const tuntas = status === 'COMPLETED' || status === 'CANCELLED';
  const manual = order.pembayaranManual;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-hidden bg-warm-espresso/40 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="detail-pesanan-title"
    >
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-warm-cream shadow-2xl sm:rounded-2xl">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-warm-line bg-warm-paper px-4 py-3">
          <div className="min-w-0">
            <h2
              id="detail-pesanan-title"
              className="truncate text-lg font-bold text-warm-espresso"
            >
              {labelTujuan(order)}
            </h2>
            <p className="truncate font-mono text-xs text-warm-muted">
              {kodePesanan(order)} · {order.id}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup detail pesanan"
            className="shrink-0 rounded-full p-2 text-warm-muted transition hover:bg-warm-espresso/5"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        <ModalScrollArea className="px-4 py-3">
          <div className="mb-3 flex flex-wrap gap-1.5">
            <StatusBadge nada={nadaStatusPesanan(order)} size="sm">
              {labelStatusPesanan(order)}
            </StatusBadge>
            <StatusBadge nada={NADA[nadaStatus(order.statusPembayaran)]} size="sm">
              {labelStatus(order.statusPembayaran)}
            </StatusBadge>
            {tahap !== 'NOT_SENT' && (
              <StatusBadge nada={nadaTahapDapur(order)} size="sm">
                {labelTahapDapur(order)}
              </StatusBadge>
            )}
          </div>

          {/* Identitas */}
          <section className="mb-3 rounded-xl bg-warm-paper px-4 py-2 shadow-sm ring-1 ring-warm-line">
            <dl className="divide-y divide-warm-line">
              <Baris label="Jenis">{labelJenis(order)}</Baris>
              <Baris label="Sumber">{labelSumber(order)}</Baris>
              <Baris label="Meja">{order.tableName ?? '—'}</Baris>
              <Baris label="Nomor antrian">{nomorAntrian(order.queueNumber)}</Baris>
              {order.customerName && (
                <Baris label="Pelanggan">{order.customerName}</Baris>
              )}
              <Baris label="Masuk">
                {formatClock(order.createdAt)} · {elapsedLabel(order.createdAt)} lalu
              </Baris>
              {order.kasir && <Baris label="Kasir">{order.kasir.name}</Baris>}
            </dl>
          </section>

          {order.catatan && (
            <p className="mb-3 rounded-xl bg-amber-50 px-4 py-2.5 text-sm leading-relaxed text-amber-900 ring-1 ring-amber-200">
              <span className="font-semibold">Catatan pesanan:</span> {order.catatan}
            </p>
          )}

          {order.alasanPembatalan && (
            <p className="mb-3 rounded-xl bg-rose-50 px-4 py-2.5 text-sm leading-relaxed text-rose-900 ring-1 ring-rose-200">
              <span className="font-semibold">Dibatalkan:</span> {order.alasanPembatalan}
              {order.pembatal ? ` — oleh ${order.pembatal.name}` : ''}
            </p>
          )}

          {/* Item */}
          <section className="mb-3 rounded-xl bg-warm-paper px-4 shadow-sm ring-1 ring-warm-line">
            <ul className="divide-y divide-warm-line">
              {order.items.map((item) => (
                <li key={item.id} className="flex justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-warm-espresso">
                      <span className="text-warm-amber">{item.quantity}×</span>{' '}
                      {item.name}
                    </p>
                    {item.notes && (
                      <p className="text-xs italic text-warm-muted">“{item.notes}”</p>
                    )}
                    <span
                      className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        KITCHEN_STATUS_META[item.kitchenStatus].badgeTerangClass
                      }`}
                    >
                      {KITCHEN_STATUS_META[item.kitchenStatus].icon}{' '}
                      {KITCHEN_STATUS_META[item.kitchenStatus].label}
                    </span>
                  </div>
                  <span className="shrink-0 text-sm font-medium text-warm-subtle tabular-nums">
                    {formatRupiah(item.price * item.quantity)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex items-center justify-between border-t border-warm-line py-3">
              <span className="text-sm font-semibold text-warm-subtle">Total</span>
              <span className="text-lg font-bold text-warm-espresso tabular-nums">
                {formatRupiah(order.totalAmount)}
              </span>
            </div>
          </section>

          {/* Pembayaran */}
          <section className="mb-3 rounded-xl bg-warm-paper px-4 py-2 shadow-sm ring-1 ring-warm-line">
            <h3 className="py-1.5 text-xs font-bold uppercase tracking-wide text-warm-muted">
              Pembayaran
            </h3>
            <dl className="divide-y divide-warm-line">
              <Baris label="Metode">{labelMetode(order.metodePembayaran)}</Baris>
              <Baris label="Status">{labelStatus(order.statusPembayaran)}</Baris>
              {order.paidAt && (
                <Baris label="Waktu bayar">{formatClock(order.paidAt)}</Baris>
              )}
              {manual && (
                <>
                  <Baris label="Uang diterima">{formatRupiah(manual.nominal)}</Baris>
                  {manual.kembalian > 0 && (
                    <Baris label="Kembalian">{formatRupiah(manual.kembalian)}</Baris>
                  )}
                  {manual.referensi && (
                    <Baris label="Referensi">{manual.referensi}</Baris>
                  )}
                  {manual.catatanKasir && (
                    <Baris label="Catatan kasir">{manual.catatanKasir}</Baris>
                  )}
                  {manual.alasanPenolakan && (
                    <Baris label="Alasan ditolak">{manual.alasanPenolakan}</Baris>
                  )}
                </>
              )}
              {order.payment?.transactionId && (
                <Baris label="ID transaksi">
                  <span className="font-mono text-xs">{order.payment.transactionId}</span>
                </Baris>
              )}
              {order.midtransOrderId && (
                <Baris label="Order ID Midtrans">
                  <span className="font-mono text-xs">{order.midtransOrderId}</span>
                </Baris>
              )}
            </dl>

            {manual?.buktiUrl && (
              <a
                href={manual.buktiUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="mb-2 mt-1 inline-block rounded-lg bg-warm-espresso/5 px-3 py-1.5 text-xs font-semibold text-warm-subtle transition hover:bg-warm-espresso/10"
              >
                Lihat bukti pembayaran
              </a>
            )}
          </section>

          {/* Riwayat status */}
          <section className="mb-2 rounded-xl bg-warm-paper px-4 py-2 shadow-sm ring-1 ring-warm-line">
            <h3 className="py-1.5 text-xs font-bold uppercase tracking-wide text-warm-muted">
              Riwayat status
            </h3>
            <ol className="space-y-2 py-1">
              {riwayat(order).map((titik) => (
                <li key={titik.label} className="flex items-start gap-2.5">
                  <span
                    aria-hidden
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-warm-amber"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-warm-espresso">{titik.label}</p>
                    <p className="text-xs text-warm-muted tabular-nums">
                      {formatClock(titik.waktu)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </ModalScrollArea>

        {/* Tindakan */}
        <footer className="flex shrink-0 flex-wrap gap-2 border-t border-warm-line bg-warm-paper px-4 py-3">
          {!tuntas && !lunas && (
            <>
              <button
                type="button"
                onClick={() => (perluDiperiksa ? onTolak(order) : onBatal(order))}
                className="rounded-xl bg-rose-50 px-4 py-2.5 text-sm font-bold text-rose-700 ring-1 ring-rose-200 transition hover:bg-rose-100 active:scale-95"
              >
                {perluDiperiksa ? 'Tolak' : 'Batalkan'}
              </button>
              <button
                type="button"
                onClick={() => onPay(order)}
                className="flex-1 rounded-xl bg-warm-amber py-2.5 text-sm font-bold text-white transition hover:brightness-95 active:scale-95"
              >
                {perluDiperiksa ? 'Terima Pembayaran & Konfirmasi' : 'Terima Pembayaran'}
              </button>
            </>
          )}

          {lunas && (
            <button
              type="button"
              onClick={() => onCetak(order)}
              className="rounded-xl bg-warm-espresso/5 px-4 py-2.5 text-sm font-semibold text-warm-subtle transition hover:bg-warm-espresso/10 active:scale-95"
            >
              Cetak struk
            </button>
          )}

          {lunas && tahap === 'READY' && (
            <button
              type="button"
              onClick={() => onSelesai(order)}
              className="flex-1 rounded-xl bg-warm-success py-2.5 text-sm font-bold text-white transition hover:brightness-95 active:scale-95"
            >
              Selesai / Diserahkan
            </button>
          )}

          {tuntas && (
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl bg-warm-espresso/5 py-2.5 text-sm font-semibold text-warm-subtle transition hover:bg-warm-espresso/10"
            >
              Tutup
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
