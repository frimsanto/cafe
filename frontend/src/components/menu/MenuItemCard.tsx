import type { MenuItem } from '../../types/menu';
import { formatRupiah } from '../../lib/format';
import { useCart } from '../../cart/CartContext';
import MenuItemImage from './MenuItemImage';
import QuantityStepper from '../common/QuantityStepper';

interface MenuItemCardProps {
  item: MenuItem;
}

/**
 * Kartu satu item menu: foto, nama, deskripsi, harga, dan status ketersediaan.
 * Item yang tidak tersedia ditandai badge "Habis" dan tampil meredup.
 *
 * Jika item belum ada di keranjang → tombol "Tambah". Jika sudah ada → tampil
 * stepper jumlah (−  n  +). Catatan khusus per item diisi di halaman keranjang.
 */
export default function MenuItemCard({ item }: MenuItemCardProps) {
  const { getQuantity, addItem, increment, decrement } = useCart();
  const unavailable = !item.isAvailable;
  const quantity = getQuantity(item.id);

  return (
    <article
      className={`flex gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-100 transition ${
        unavailable ? 'opacity-60' : 'hover:shadow-md'
      }`}
    >
      <div className="relative shrink-0">
        <MenuItemImage
          src={item.imageUrl}
          alt={item.name}
          className="h-24 w-24 rounded-xl"
        />
        {unavailable && (
          <span className="absolute inset-0 flex items-center justify-center rounded-xl bg-slate-900/50 text-xs font-semibold uppercase tracking-wide text-white">
            Habis
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <h3 className="truncate text-base font-semibold text-slate-900">{item.name}</h3>
        <p className="mt-0.5 line-clamp-2 text-sm leading-snug text-slate-500">
          {item.description}
        </p>

        <div className="mt-auto flex items-center justify-between pt-2">
          <span className="text-base font-bold text-brand-700">
            {formatRupiah(item.price)}
          </span>

          {unavailable ? (
            <button
              type="button"
              disabled
              className="cursor-not-allowed rounded-full bg-slate-300 px-4 py-1.5 text-sm font-semibold text-white"
            >
              Habis
            </button>
          ) : quantity > 0 ? (
            <QuantityStepper
              quantity={quantity}
              onIncrement={() => increment(item.id)}
              onDecrement={() => decrement(item.id)}
            />
          ) : (
            <button
              type="button"
              onClick={() => addItem(item)}
              className="rounded-full bg-brand-600 px-4 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 active:scale-95"
            >
              Tambah
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
