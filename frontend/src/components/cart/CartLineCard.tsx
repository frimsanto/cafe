import type { CartLine } from '../../types/cart';
import { formatRupiah } from '../../lib/format';
import { useCart } from '../../cart/CartContext';
import MenuItemImage from '../menu/MenuItemImage';
import QuantityStepper from '../common/QuantityStepper';

interface CartLineCardProps {
  line: CartLine;
}

/**
 * Satu baris keranjang: foto, nama, harga satuan, kontrol jumlah, input catatan
 * khusus (kustomisasi), subtotal, dan tombol hapus.
 */
export default function CartLineCard({ line }: CartLineCardProps) {
  const { increment, decrement, setNotes, removeItem } = useCart();
  const { item, quantity, notes } = line;
  const subtotal = quantity * item.price;

  return (
    <article className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-100">
      <div className="flex gap-3">
        <MenuItemImage
          src={item.imageUrl}
          alt={item.name}
          className="h-20 w-20 shrink-0 rounded-xl"
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate text-base font-semibold text-slate-900">{item.name}</h3>
            <button
              type="button"
              onClick={() => removeItem(item.id)}
              aria-label={`Hapus ${item.name}`}
              className="shrink-0 rounded-lg p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-500"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
              </svg>
            </button>
          </div>
          <span className="text-sm text-slate-500">{formatRupiah(item.price)}</span>

          <div className="mt-auto flex items-center justify-between pt-2">
            <QuantityStepper
              quantity={quantity}
              onIncrement={() => increment(item.id)}
              onDecrement={() => decrement(item.id)}
              size="md"
            />
            <span className="font-bold text-slate-900 tabular-nums">
              {formatRupiah(subtotal)}
            </span>
          </div>
        </div>
      </div>

      <label className="mt-3 block">
        <span className="sr-only">Catatan untuk {item.name}</span>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(item.id, e.target.value)}
          placeholder="Catatan (mis. tanpa gula, extra pedas)"
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400 focus:border-brand-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </label>
    </article>
  );
}
