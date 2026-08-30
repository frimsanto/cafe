import type { MejaKasirDTO } from '../../types/api';

interface TablePickerProps {
  tables: MejaKasirDTO[];
  selectedId: string | null;
  onSelect: (tableId: string) => void;
}

/**
 * Keadaan meja sebagaimana dibaca kasir.
 *
 * Meja TERISI tetap bisa dipilih — itulah yang membuat "pesanan tambahan"
 * mungkin: tamu yang sudah duduk memesan lagi lewat kasir, dan pesanannya harus
 * mendarat di meja yang sama, bukan di meja baru. Yang benar-benar tidak bisa
 * dipilih hanyalah meja nonaktif, dan meja seperti itu tidak pernah dikirim
 * server (sudah tersaring `deletedAt`).
 */
const GAYA: Record<
  MejaKasirDTO['status'],
  { label: string; pill: string; kartu: string }
> = {
  TERSEDIA: {
    label: 'Tersedia',
    pill: 'bg-warm-success/10 text-warm-success',
    kartu: 'ring-warm-line hover:ring-warm-amber',
  },
  TERISI: {
    label: 'Terisi',
    pill: 'bg-warm-espresso/5 text-warm-subtle',
    kartu: 'ring-warm-line hover:ring-warm-amber',
  },
  MENUNGGU_PEMBAYARAN: {
    label: 'Menunggu bayar',
    pill: 'bg-amber-100 text-amber-800',
    kartu: 'ring-amber-300 hover:ring-warm-amber',
  },
};

/**
 * Pemilih meja untuk pesanan makan di tempat.
 *
 * Statusnya ditulis sebagai kata, bukan hanya warna: layar kasir dibaca di
 * bawah lampu kafe yang temaram dan oleh orang yang tidak selalu bisa
 * membedakan hijau dari kuning.
 */
export default function TablePicker({
  tables,
  selectedId,
  onSelect,
}: TablePickerProps) {
  if (tables.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-warm-line bg-warm-paper/60 px-4 py-6 text-center text-sm text-warm-muted">
        Belum ada meja aktif di kafe ini. Tambahkan meja lewat menu Manajemen
        Meja, atau buat pesanan sebagai <strong>Bawa Pulang</strong>.
      </p>
    );
  }

  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {tables.map((table) => {
        const gaya = GAYA[table.status];
        const terpilih = table.id === selectedId;
        return (
          <li key={table.id}>
            <button
              type="button"
              onClick={() => onSelect(table.id)}
              aria-pressed={terpilih}
              className={`flex w-full flex-col items-start gap-1 rounded-xl bg-warm-paper px-3 py-2.5 text-left shadow-sm ring-1 transition active:scale-[0.98] ${
                terpilih
                  ? 'bg-warm-amber/10 ring-2 ring-warm-amber'
                  : gaya.kartu
              }`}
            >
              <span className="truncate text-sm font-bold text-warm-espresso">
                {table.tableName}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${gaya.pill}`}
              >
                {gaya.label}
              </span>
              {table.activeOrderCount > 0 && (
                <span className="text-[11px] text-warm-muted">
                  {table.activeOrderCount} pesanan berjalan · tambahan masuk ke
                  meja ini
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
