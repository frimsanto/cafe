import type { CartLine } from '../../types/cart';
import type { ManualMethodCode } from '../../types/order';
import type { PaymentConfigDTO } from '../../types/api';
import { formatRupiah, formatThousands, parseAmountInput } from '../../lib/format';
import { manualMethods } from '../../data/paymentMethods';
import PaymentIcon from '../payment/PaymentIcon';

/** Nominal cepat yang paling sering diserahkan tamu. */
const UANG_CEPAT = [20_000, 50_000, 100_000, 150_000, 200_000];

interface PosCartPanelProps {
  keranjang: CartLine[];
  subtotal: number;
  jumlahItem: number;
  onUbahJumlah: (menuItemId: string, notes: string, quantity: number) => void;
  onUbahCatatan: (menuItemId: string, notesLama: string, notesBaru: string) => void;
  onHapus: (menuItemId: string, notes: string) => void;

  catatanPesanan: string;
  onCatatanPesanan: (nilai: string) => void;

  config: PaymentConfigDTO | null;
  metode: ManualMethodCode | null;
  onMetode: (metode: ManualMethodCode) => void;
  uangDiterima: string;
  onUangDiterima: (nilai: string) => void;
  referensi: string;
  onReferensi: (nilai: string) => void;

  busy: boolean;
  onSubmit: () => void;
}

/**
 * Panel kanan dialog pesanan baru: keranjang, metode pembayaran, dan tombol
 * "Bayar & Kirim ke Dapur".
 *
 * Subtotal ditampilkan sebagai TOTAL apa adanya. CafeOS belum mendukung diskon,
 * pajak, maupun service charge — menampilkan baris "Pajak Rp 0" akan
 * menjanjikan perhitungan yang sebenarnya tidak ada, dan struk yang dicetak
 * tidak akan cocok dengan pembukuan mana pun.
 */
export default function PosCartPanel({
  keranjang,
  subtotal,
  jumlahItem,
  onUbahJumlah,
  onUbahCatatan,
  onHapus,
  catatanPesanan,
  onCatatanPesanan,
  config,
  metode,
  onMetode,
  uangDiterima,
  onUangDiterima,
  referensi,
  onReferensi,
  busy,
  onSubmit,
}: PosCartPanelProps) {
  const opsi = manualMethods.filter((m) => config?.metodeDiterima.includes(m.code));
  const tunai = metode === 'TUNAI';
  const diterima = parseAmountInput(uangDiterima);
  const kembalian = diterima === null ? null : diterima - subtotal;
  const kurang = tunai && (kembalian === null || kembalian < 0);
  const butuhReferensi = metode === 'TRANSFER' || metode === 'EDC';

  const siap = keranjang.length > 0 && metode !== null && !kurang && !busy;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Keranjang */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
        {keranjang.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-10 text-center">
            <span aria-hidden className="text-3xl">🧾</span>
            <p className="text-sm font-semibold text-warm-espresso">
              Keranjang masih kosong
            </p>
            <p className="text-xs text-warm-muted">
              Pilih menu di sebelah kiri untuk mulai menyusun pesanan.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {keranjang.map((baris) => (
              <li
                key={`${baris.item.id}|${baris.notes}`}
                className="rounded-xl bg-warm-paper p-3 shadow-sm ring-1 ring-warm-line"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-warm-espresso">
                      {baris.item.name}
                    </p>
                    <p className="text-xs text-warm-muted tabular-nums">
                      {formatRupiah(baris.item.price)} × {baris.quantity}
                    </p>
                  </div>
                  <span className="shrink-0 text-sm font-bold text-warm-espresso tabular-nums">
                    {formatRupiah(baris.item.price * baris.quantity)}
                  </span>
                </div>

                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="inline-flex items-center gap-1 rounded-full bg-warm-cream/70 p-1 ring-1 ring-warm-line">
                    <button
                      type="button"
                      aria-label={`Kurangi ${baris.item.name}`}
                      onClick={() =>
                        onUbahJumlah(baris.item.id, baris.notes, baris.quantity - 1)
                      }
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-warm-paper text-lg font-bold text-warm-subtle shadow-sm transition active:scale-90"
                    >
                      −
                    </button>
                    <span className="w-6 text-center text-sm font-bold tabular-nums text-warm-espresso">
                      {baris.quantity}
                    </span>
                    <button
                      type="button"
                      aria-label={`Tambah ${baris.item.name}`}
                      onClick={() =>
                        onUbahJumlah(baris.item.id, baris.notes, baris.quantity + 1)
                      }
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-warm-amber text-lg font-bold text-white shadow-sm transition active:scale-90"
                    >
                      +
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => onHapus(baris.item.id, baris.notes)}
                    className="rounded-lg px-2 py-1 text-xs font-semibold text-rose-700 transition hover:bg-rose-50"
                  >
                    Hapus
                  </button>
                </div>

                <input
                  type="text"
                  value={baris.notes}
                  maxLength={200}
                  onChange={(e) =>
                    onUbahCatatan(baris.item.id, baris.notes, e.target.value)
                  }
                  placeholder="Catatan item (mis. tanpa gula, extra shot)"
                  aria-label={`Catatan untuk ${baris.item.name}`}
                  className="mt-2 w-full rounded-lg border-0 bg-warm-cream/50 px-3 py-1.5 text-xs text-warm-espresso ring-1 ring-warm-line placeholder:text-warm-muted focus:outline-none focus:ring-2 focus:ring-warm-amber"
                />
              </li>
            ))}
          </ul>
        )}

        {keranjang.length > 0 && (
          <div className="mt-3">
            <label
              htmlFor="pos-catatan"
              className="mb-1 block text-xs font-semibold text-warm-subtle"
            >
              Catatan pesanan (opsional)
            </label>
            <textarea
              id="pos-catatan"
              rows={2}
              maxLength={500}
              value={catatanPesanan}
              onChange={(e) => onCatatanPesanan(e.target.value)}
              placeholder="mis. pisahkan piringnya, antar bersamaan"
              className="w-full rounded-xl border-0 bg-warm-paper px-3 py-2 text-sm text-warm-espresso shadow-sm ring-1 ring-warm-line placeholder:text-warm-muted focus:outline-none focus:ring-2 focus:ring-warm-amber"
            />
          </div>
        )}
      </div>

      {/* Pembayaran & total — selalu terlihat, tidak ikut tergulir. */}
      <div className="border-t border-warm-line bg-warm-cream/40 px-4 py-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-warm-muted">
          Metode pembayaran
        </p>

        {opsi.length === 0 ? (
          <p className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900 ring-1 ring-amber-200">
            Belum ada metode pembayaran yang aktif untuk kasir. Pemilik kafe
            perlu menyalakannya di <strong>Pengaturan Pembayaran</strong>
            sebelum pesanan bisa ditagih di sini.
          </p>
        ) : (
          <div className="mb-3 grid grid-cols-2 gap-2">
            {opsi.map((m) => (
              <button
                key={m.code}
                type="button"
                onClick={() => onMetode(m.code)}
                aria-pressed={metode === m.code}
                className={`flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-semibold transition active:scale-[0.98] ${
                  metode === m.code
                    ? 'bg-warm-amber text-white shadow-sm'
                    : 'bg-warm-paper text-warm-espresso ring-1 ring-warm-line hover:ring-warm-amber'
                }`}
              >
                <PaymentIcon name={m.icon} size={16} />
                <span className="truncate">{m.name}</span>
              </button>
            ))}
          </div>
        )}

        {tunai && (
          <div className="mb-3">
            <label
              htmlFor="pos-uang"
              className="mb-1 block text-xs font-semibold text-warm-subtle"
            >
              Uang diterima
            </label>
            <input
              id="pos-uang"
              type="text"
              inputMode="numeric"
              value={uangDiterima}
              onChange={(e) => {
                const angka = parseAmountInput(e.target.value);
                onUangDiterima(angka === null ? '' : formatThousands(angka));
              }}
              placeholder="0"
              className="w-full rounded-xl border-0 bg-warm-paper px-3 py-2.5 text-lg font-bold text-warm-espresso tabular-nums shadow-sm ring-1 ring-warm-line focus:outline-none focus:ring-2 focus:ring-warm-amber"
            />
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => onUangDiterima(formatThousands(subtotal))}
                className="rounded-lg bg-warm-paper px-2.5 py-1 text-xs font-semibold text-warm-subtle ring-1 ring-warm-line transition hover:ring-warm-amber"
              >
                Uang pas
              </button>
              {UANG_CEPAT.filter((n) => n >= subtotal).slice(0, 4).map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => onUangDiterima(formatThousands(n))}
                  className="rounded-lg bg-warm-paper px-2.5 py-1 text-xs font-semibold text-warm-subtle ring-1 ring-warm-line transition hover:ring-warm-amber"
                >
                  {formatThousands(n)}
                </button>
              ))}
            </div>
            {kembalian !== null && (
              <p
                className={`mt-2 text-sm font-semibold ${
                  kembalian < 0 ? 'text-rose-700' : 'text-warm-success'
                }`}
              >
                {kembalian < 0
                  ? `Kurang ${formatRupiah(Math.abs(kembalian))}`
                  : `Kembalian ${formatRupiah(kembalian)}`}
              </p>
            )}
          </div>
        )}

        {butuhReferensi && (
          <div className="mb-3">
            <label
              htmlFor="pos-referensi"
              className="mb-1 block text-xs font-semibold text-warm-subtle"
            >
              Nomor referensi / approval (opsional)
            </label>
            <input
              id="pos-referensi"
              type="text"
              maxLength={100}
              value={referensi}
              onChange={(e) => onReferensi(e.target.value)}
              placeholder={metode === 'EDC' ? 'Kode approval EDC' : 'Nomor referensi transfer'}
              className="w-full rounded-xl border-0 bg-warm-paper px-3 py-2 text-sm text-warm-espresso shadow-sm ring-1 ring-warm-line placeholder:text-warm-muted focus:outline-none focus:ring-2 focus:ring-warm-amber"
            />
          </div>
        )}

        <div className="mb-3 flex items-end justify-between">
          <span className="text-sm text-warm-muted">
            Total · {jumlahItem} item
          </span>
          <span className="text-2xl font-bold text-warm-espresso tabular-nums">
            {formatRupiah(subtotal)}
          </span>
        </div>

        <button
          type="button"
          onClick={onSubmit}
          disabled={!siap}
          className="w-full rounded-xl bg-warm-amber py-3 text-sm font-bold text-white shadow-sm transition hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-warm-amber focus-visible:ring-offset-2 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Menyimpan…' : 'Bayar & Kirim ke Dapur'}
        </button>
      </div>
    </div>
  );
}
