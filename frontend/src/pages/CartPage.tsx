import { useNavigate } from 'react-router-dom';
import { useCart } from '../cart/CartContext';
import { formatRupiah } from '../lib/format';
import { useTableSession } from '../table/TableSessionContext';
import CartLineCard from '../components/cart/CartLineCard';

/**
 * Halaman keranjang: pelanggan meninjau item, mengubah jumlah, menambah catatan
 * khusus, dan menghapus item sebelum checkout.
 *
 * Identitas meja diambil dari sesi QR yang sama dengan halaman menu.
 */
export default function CartPage() {
  const { lines, totalItems, totalAmount, clearCart } = useCart();
  const { table } = useTableSession();
  const navigate = useNavigate();
  const isEmpty = lines.length === 0;

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-slate-100 shadow-xl">
      {/* Header */}
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <button
          type="button"
          onClick={() => navigate('/menu')}
          aria-label="Kembali ke menu"
          className="rounded-full p-1.5 text-slate-600 transition hover:bg-slate-100"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold text-slate-900">Keranjang</h1>
          <p className="text-xs text-slate-500">{table?.tableName ?? '-'}</p>
        </div>
        {!isEmpty && (
          <button
            type="button"
            onClick={clearCart}
            className="text-sm font-medium text-rose-500 transition hover:text-rose-600"
          >
            Kosongkan
          </button>
        )}
      </header>

      {isEmpty ? (
        <EmptyCart onBrowse={() => navigate('/menu')} />
      ) : (
        <>
          <main className="flex-1 space-y-3 px-4 py-4">
            {lines.map((line) => (
              <CartLineCard key={line.item.id} line={line} />
            ))}
          </main>

          {/* Ringkasan + checkout */}
          <footer className="sticky bottom-0 border-t border-slate-200 bg-white px-4 pb-5 pt-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm text-slate-500">
                Total ({totalItems} item)
              </span>
              <span className="text-xl font-bold text-slate-900 tabular-nums">
                {formatRupiah(totalAmount)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => navigate('/checkout')}
              className="w-full rounded-2xl bg-brand-600 py-3.5 text-center font-semibold text-white shadow-sm transition hover:bg-brand-700 active:scale-[0.99]"
            >
              Lanjut ke Pembayaran
            </button>
          </footer>
        </>
      )}
    </div>
  );
}

function EmptyCart({ onBrowse }: { onBrowse: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-20 text-center">
      <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-slate-200 text-slate-400">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="9" cy="21" r="1" />
          <circle cx="20" cy="21" r="1" />
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
        </svg>
      </div>
      <h2 className="text-lg font-semibold text-slate-700">Keranjang masih kosong</h2>
      <p className="mt-1 text-sm text-slate-500">
        Yuk pilih menu favoritmu dulu.
      </p>
      <button
        type="button"
        onClick={onBrowse}
        className="mt-6 rounded-full bg-brand-600 px-6 py-2.5 font-semibold text-white shadow-sm transition hover:bg-brand-700"
      >
        Lihat Menu
      </button>
    </div>
  );
}
