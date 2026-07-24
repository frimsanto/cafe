import type { MenuItem } from '../../types/menu';
import { formatRupiah } from '../../lib/format';
import MenuItemImage from '../menu/MenuItemImage';

interface MenuAdminItemCardProps {
  item: MenuItem;
  /** Sorot sesaat setelah item baru ditambahkan/diubah. */
  highlighted?: boolean;
  onEdit: (item: MenuItem) => void;
  onMove: (item: MenuItem) => void;
  onToggleAvailability: (item: MenuItem) => void;
}

/**
 * Satu baris item pada halaman Manajemen Menu — menampilkan foto, nama,
 * deskripsi, harga, status tampil/sembunyi, dan aksinya.
 *
 * Item yang disembunyikan (`isAvailable: false`) tampil sebagai "Habis" di menu
 * digital dan tidak bisa dipesan pelanggan. Di halaman ini item tersebut tetap
 * terlihat tapi diredupkan (foto abu-abu + garis pada harga) supaya bedanya
 * langsung terbaca sekilas, bukan hanya lewat teks lencana.
 */
export default function MenuAdminItemCard({
  item,
  highlighted = false,
  onEdit,
  onMove,
  onToggleAvailability,
}: MenuAdminItemCardProps) {
  const hidden = !item.isAvailable;

  return (
    <article
      className={`flex gap-3 rounded-2xl p-3 shadow-sm ring-1 transition ${
        hidden ? 'bg-slate-50' : 'bg-white'
      } ${
        highlighted
          ? 'ring-2 ring-emerald-400'
          : 'ring-slate-200 hover:ring-brand-300'
      }`}
    >
      <MenuItemImage
        src={item.imageUrl}
        alt={item.name}
        className={`h-16 w-16 shrink-0 rounded-xl transition sm:h-20 sm:w-20 ${
          hidden ? 'opacity-50 grayscale' : ''
        }`}
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h3
            className={`truncate font-semibold ${
              hidden ? 'text-slate-500' : 'text-slate-900'
            }`}
          >
            {item.name}
          </h3>
          <span
            className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              hidden
                ? 'bg-slate-200 text-slate-600'
                : 'bg-emerald-50 text-emerald-700'
            }`}
          >
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 rounded-full ${
                hidden ? 'bg-slate-400' : 'bg-emerald-500'
              }`}
            />
            {hidden ? 'Disembunyikan' : 'Tampil'}
          </span>
        </div>

        <p className="line-clamp-2 text-sm text-slate-500">{item.description}</p>

        {/* Harga & aksi: pada layar sempit tombol turun ke baris berikutnya
            supaya tidak ada yang terpotong. */}
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <p
            className={`font-bold ${
              hidden ? 'text-slate-400 line-through' : 'text-brand-700'
            }`}
          >
            {formatRupiah(item.price)}
          </p>

          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => onToggleAvailability(item)}
              aria-pressed={hidden}
              aria-label={
                hidden
                  ? `Tampilkan ${item.name} agar bisa dipesan lagi`
                  : `Sembunyikan ${item.name} dari pemesanan pelanggan`
              }
              title={
                hidden
                  ? 'Tampilkan lagi — pelanggan bisa memesan'
                  : 'Sembunyikan — pelanggan melihatnya sebagai "Habis"'
              }
              className={`rounded-lg p-1.5 transition ${
                hidden
                  ? 'text-emerald-600 hover:bg-emerald-50'
                  : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600'
              }`}
            >
              {hidden ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10.6 6.1A9.9 9.9 0 0 1 12 6c6.4 0 10 7 10 7a15.7 15.7 0 0 1-3 3.7M6.3 7.7A15.6 15.6 0 0 0 2 13s3.6 7 10 7a9.6 9.6 0 0 0 4.2-.9" />
                  <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2M2 2l20 20" />
                </svg>
              )}
            </button>

            <button
              type="button"
              onClick={() => onMove(item)}
              aria-label={`Pindahkan ${item.name} ke kategori lain`}
              title="Pindahkan ke kategori lain"
              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-brand-50 hover:text-brand-700"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 7h6l2 2h10v9a2 2 0 0 1-2 2H3Z" />
                <path d="m14 12 3 2.5-3 2.5" />
              </svg>
            </button>

            <button
              type="button"
              onClick={() => onEdit(item)}
              aria-label={`Ubah ${item.name}`}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold text-slate-500 transition hover:bg-brand-50 hover:text-brand-700"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
              Ubah
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
