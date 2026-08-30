import type { OrderWithTableDTO } from '../../types/api';
import { formatRupiah } from '../../lib/format';
import { labelMetode } from '../../data/paymentMethods';

/** Label ringkas status masak per item — teks saja, tanpa ikon. */
const STATUS_ITEM: Record<string, { label: string; kelas: string }> = {
  WAITING: { label: 'Menunggu', kelas: 'text-slate-500' },
  COOKING: { label: 'Diproses', kelas: 'text-amber-700' },
  READY: { label: 'Siap', kelas: 'text-forest-700' },
};

function formatWaktu(iso: string): string {
  return new Date(iso).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

interface OrderDetailCardProps {
  pesanan: OrderWithTableDTO;
  /** Total dari server bila pesanan belum menghitungnya sendiri. */
  totalFallback?: number | null;
  /** Kode metode bayar (`TUNAI`, `QRIS`, …); null selama belum dibayar. */
  metodePembayaran?: string | null;
  /**
   * Tampilkan status masak per item. Dimatikan sebelum pembayaran lunas —
   * dapur belum menerima pesanannya, jadi "Menunggu" di sana menyesatkan —
   * dan setelah semuanya selesai, karena tidak ada lagi yang perlu diikuti.
   */
  tampilkanStatusItem?: boolean;
}

/**
 * Rincian pesanan: daftar item, total, lalu tanggal & id pesanan di kaki kartu.
 *
 * Sengaja tenang. Kabar penting — sudah siap atau belum — sudah disampaikan
 * kartu status di atas; kartu ini tugasnya cuma satu, menjawab "tadi saya
 * pesan apa dan bayar berapa", jadi tidak ada ikon, lencana warna-warni, atau
 * batang progres yang bersaing dengan nomor antrian.
 *
 * Id lengkap di kaki kartu adalah id yang sama dengan yang terlihat di layar
 * kasir dan dapur — itulah pegangan bila ada yang perlu dicocokkan.
 */
export default function OrderDetailCard({
  pesanan,
  totalFallback = null,
  metodePembayaran = null,
  tampilkanStatusItem = false,
}: OrderDetailCardProps) {
  const total = pesanan.totalAmount ?? totalFallback ?? 0;

  return (
    <section className="rounded-2xl bg-white p-5 ring-1 ring-slate-200">
      <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500">
        Rincian Pesanan
      </h2>

      <ul className="mt-3 divide-y divide-slate-100">
        {pesanan.items.map((item) => {
          const status = STATUS_ITEM[item.kitchenStatus];
          return (
            <li key={item.id} className="flex items-start gap-3 py-3">
              <span className="w-7 shrink-0 pt-0.5 text-base font-bold tabular-nums text-slate-500">
                {item.quantity}×
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold leading-snug text-slate-900">
                  {item.name}
                </p>
                {item.notes && (
                  <p className="mt-0.5 text-sm text-slate-500">{item.notes}</p>
                )}
                {tampilkanStatusItem && status && (
                  <p className={`mt-0.5 text-sm font-medium ${status.kelas}`}>
                    {status.label}
                  </p>
                )}
              </div>

              <span className="shrink-0 pt-0.5 text-base font-semibold tabular-nums text-slate-700">
                {formatRupiah(item.price * item.quantity)}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="mt-1 flex items-baseline justify-between border-t border-slate-200 pt-4">
        <span className="text-base font-bold text-slate-900">Total</span>
        <span className="text-2xl font-black tabular-nums text-forest-700">
          {formatRupiah(total)}
        </span>
      </div>

      {metodePembayaran && (
        <p className="mt-1 text-right text-sm text-slate-500">
          Dibayar dengan {labelMetode(metodePembayaran)}
        </p>
      )}

      <div className="mt-4 space-y-1 border-t border-slate-100 pt-3 text-xs text-slate-400">
        <p>{formatWaktu(pesanan.createdAt)}</p>
        <p className="break-all font-mono">ID {pesanan.id}</p>
      </div>
    </section>
  );
}
