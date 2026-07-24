import { useNavigate } from 'react-router-dom';
import { useCart } from '../../cart/CartContext';
import { formatRupiah } from '../../lib/format';

/**
 * Bilah keranjang melayang di bagian bawah halaman menu. Muncul hanya bila ada
 * item di keranjang; menampilkan jumlah item + total dan mengarah ke halaman
 * keranjang.
 */
export default function FloatingCartBar() {
  const { totalItems, totalAmount } = useCart();
  const navigate = useNavigate();

  if (totalItems === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md px-4 pb-4">
      <button
        type="button"
        onClick={() => navigate('/keranjang')}
        className="pointer-events-auto flex w-full items-center justify-between gap-3 rounded-2xl bg-brand-600 px-5 py-3.5 text-white shadow-lg shadow-brand-900/20 transition hover:bg-brand-700 active:scale-[0.99]"
      >
        <span className="flex items-center gap-2">
          <span className="flex h-7 min-w-7 items-center justify-center rounded-full bg-white/20 px-2 text-sm font-bold tabular-nums">
            {totalItems}
          </span>
          <span className="font-semibold">Lihat Keranjang</span>
        </span>
        <span className="font-bold tabular-nums">{formatRupiah(totalAmount)}</span>
      </button>
    </div>
  );
}
