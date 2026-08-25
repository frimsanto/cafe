import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ManualMethodCode } from '../types/order';
import type { OpsiPembayaranDTO } from '../types/api';
import { useCart } from '../cart/CartContext';
import { formatRupiah } from '../lib/format';
import { ordersApi } from '../api/orders';
import { pembayaranApi } from '../api/pembayaran';
import { payWithSnap } from '../lib/midtransSnap';
import { describeApiError } from '../lib/apiClient';
import { useTableSession } from '../table/TableSessionContext';
import ManualMethodModal from '../components/checkout/ManualMethodModal';

/** Jalur pembayaran yang bisa dipilih pelanggan di layar ini. */
type Jalur = 'MIDTRANS' | 'DOKU' | 'MANUAL';

interface JalurInfo {
  ikon: string;
  nama: string;
  keterangan: string;
  /** Label tombol bayar saat jalur ini yang dipilih. */
  tombol: string;
}

// Katalog tampilan tiap jalur. Urutan kunci di sini juga urutan tampilnya —
// gateway otomatis lebih dulu, bayar-di-kasir paling bawah, karena jalur manual
// menahan pesanan sampai ada kasir yang mengonfirmasi.
const JALUR: Record<Jalur, JalurInfo> = {
  MIDTRANS: {
    ikon: '🔵',
    nama: 'QRIS, GoPay, Virtual Account, Kartu',
    keterangan: 'Pilih metodenya di layar pembayaran yang akan terbuka.',
    tombol: 'Bayar Sekarang',
  },
  DOKU: {
    ikon: '🟣',
    nama: 'DOKU Checkout',
    keterangan: 'QRIS, Virtual Account, dan e-wallet lewat halaman DOKU.',
    tombol: 'Lanjut ke DOKU',
  },
  MANUAL: {
    ikon: '🧾',
    nama: 'Bayar di kasir',
    keterangan: 'Tunai, QRIS statis, transfer, atau kartu — dikonfirmasi kasir.',
    tombol: 'Bayar di Kasir',
  },
};

/**
 * Halaman checkout pelanggan.
 *
 * Alurnya satu rel: pesanan dicatat dulu lewat `POST /orders` (status
 * MENUNGGU_PEMBAYARAN), baru dibayar. Urutan ini penting — pesanan tercatat di
 * database sebelum uang berpindah, sehingga pembayaran yang berhasil tidak
 * pernah kehilangan pesanannya.
 *
 * Setelah pesanan ada, pelanggan memilih salah satu dari tiga jalur — yang
 * ditawarkan hanya yang memang tersedia menurut `GET .../pembayaran/opsi`:
 *   - Midtrans → popup Snap terbuka (QRIS dinamis, GoPay, VA, kartu). Aktif
 *     bila kafe menyetel kredensialnya sendiri.
 *   - DOKU Checkout → pelanggan diarahkan ke halaman bayar milik DOKU. Ini
 *     gateway platform (kredensial Fessolution), jadi tersedia untuk kafe yang
 *     tidak punya akun gateway sendiri.
 *   - Manual → pesanan dititipkan ke kasir untuk dikonfirmasi.
 *
 * Apa pun jalurnya, yang menentukan lunas adalah server: kedua jalur gateway
 * sama-sama bermuara di halaman status yang melakukan polling.
 *
 * Id pesanan yang sudah dibuat disimpan (`orderIdRef`) supaya percobaan bayar
 * berikutnya memakai pesanan yang sama — batal bayar tidak menumpuk pesanan
 * kembar di antrean kasir. Ini juga yang membuat pelanggan bebas berpindah
 * jalur (mis. gagal di DOKU lalu memilih kasir) tanpa menggandakan pesanan.
 */
export default function CheckoutPage() {
  const { lines, totalItems, totalAmount, clearCart } = useCart();
  const { table } = useTableSession();
  const navigate = useNavigate();

  const [opsi, setOpsi] = useState<OpsiPembayaranDTO | null>(null);
  const [opsiError, setOpsiError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [jalur, setJalur] = useState<Jalur | null>(null);

  /** Pesanan yang sudah terlanjur dibuat di server pada percobaan sebelumnya. */
  const orderIdRef = useRef<string | null>(null);

  // Kalau keranjang kosong (mis. halaman dibuka langsung), balik ke menu.
  // Keranjang yang dikosongkan SETELAH pesanan dibuat tidak dihitung — saat itu
  // kita memang sedang berpindah ke halaman status, bukan tersesat di checkout.
  useEffect(() => {
    if (lines.length === 0 && !orderIdRef.current) {
      navigate('/menu', { replace: true });
    }
  }, [lines.length, navigate]);

  // Metode yang tersedia di kafe ini — menentukan Midtrans atau fallback manual.
  useEffect(() => {
    const cafeId = table?.cafeId;
    if (!cafeId) return;
    let cancelled = false;

    pembayaranApi
      .opsi(cafeId)
      .then((data) => {
        if (cancelled) return;
        setOpsi(data);
        setOpsiError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setOpsiError(
          describeApiError(err, 'Gagal memuat metode pembayaran kafe ini.'),
        );
      });

    return () => {
      cancelled = true;
    };
  }, [table?.cafeId]);

  // Jalur yang benar-benar bisa dipakai di kafe ini. Midtrans & DOKU muncul
  // hanya bila gateway-nya aktif; manual hanya bila kafe memang menerima metode
  // manual. Daftar kosong = kafe belum bisa menagih apa pun.
  const tersedia = useMemo<Jalur[]>(() => {
    if (!opsi) return [];
    const daftar: Jalur[] = [];
    if (opsi.midtransAktif) daftar.push('MIDTRANS');
    if (opsi.dokuAktif) daftar.push('DOKU');
    if (opsi.metodeDiterima.length > 0) daftar.push('MANUAL');
    return daftar;
  }, [opsi]);

  // Pilihan awal jatuh ke jalur teratas yang tersedia. Pilihan pelanggan
  // dipertahankan selama masih tersedia — supaya opsi yang datang belakangan
  // (mis. `opsi` di-fetch ulang) tidak diam-diam memindahkan pilihannya.
  useEffect(() => {
    setJalur((prev) => (prev && tersedia.includes(prev) ? prev : (tersedia[0] ?? null)));
  }, [tersedia]);

  /** Buat pesanan bila belum ada; pakai ulang bila percobaan sebelumnya gagal. */
  const pastikanOrder = useCallback(async (): Promise<string> => {
    if (orderIdRef.current) return orderIdRef.current;
    if (!table) throw new Error('Meja belum dikenali. Pindai ulang QR di meja kamu.');

    const created = await ordersApi.create(
      table.cafeId,
      table.tableId,
      lines.map((line) => ({
        menuItemId: line.item.id,
        quantity: line.quantity,
        notes: line.notes,
      })),
    );
    orderIdRef.current = created.id;
    return created.id;
  }, [table, lines]);

  /** Pindah ke halaman status pesanan; keranjang dikosongkan di sini. */
  const keStatus = useCallback(
    (orderId: string, status?: 'sukses' | 'menunggu') => {
      clearCart();
      navigate(`/pesanan/${orderId}${status ? `?status=${status}` : ''}`, {
        replace: true,
      });
    },
    [clearCart, navigate],
  );

  /** Jalur utama: buat transaksi Snap lalu buka popup Midtrans. */
  const bayarMidtrans = async () => {
    setError(null);
    setBusy(true);
    try {
      const orderId = await pastikanOrder();
      const tx = await pembayaranApi.buatMidtrans(orderId);

      if (!tx.clientKey) {
        setError(
          'Pembayaran online kafe ini belum lengkap dikonfigurasi. Silakan bayar di kasir.',
        );
        return;
      }

      payWithSnap({
        snapToken: tx.snapToken,
        clientKey: tx.clientKey,
        isProduction: tx.isProduction,
        onSuccess: () => keStatus(orderId, 'sukses'),
        onPending: () => keStatus(orderId, 'menunggu'),
        // Snap sudah tertutup saat callback ini jalan — pelanggan tetap di
        // checkout dan bisa mencoba lagi dengan pesanan yang sama.
        onError: () =>
          setError('Pembayaran gagal diproses. Silakan coba lagi.'),
        // Popup ditutup sendiri: pesanan sudah ada, jadi arahkan ke halamannya.
        onClose: () => keStatus(orderId),
      });
    } catch (err) {
      setError(describeApiError(err, 'Pembayaran gagal dimulai. Coba lagi.'));
    } finally {
      setBusy(false);
    }
  };

  /**
   * Jalur DOKU: terbitkan tagihan lalu tinggalkan aplikasi menuju halaman bayar
   * milik DOKU.
   *
   * Halaman status didorong ke riwayat SEBELUM berpindah. Urutan ini yang
   * membuat tombol "kembali" dari halaman DOKU mendarat di status pesanan yang
   * sudah melakukan polling — bukan di checkout dengan keranjang yang telanjur
   * dikosongkan. `busy` sengaja tidak dilepas pada jalur sukses: halaman memang
   * sedang ditinggalkan, dan tombolnya harus tetap mati sampai itu terjadi.
   */
  const bayarDoku = async () => {
    setError(null);
    setBusy(true);
    try {
      const orderId = await pastikanOrder();
      const tagihan = await pembayaranApi.buatDoku(orderId);
      keStatus(orderId, 'menunggu');
      window.location.assign(tagihan.paymentUrl);
    } catch (err) {
      setError(describeApiError(err, 'Pembayaran DOKU gagal dimulai. Coba lagi.'));
      setBusy(false);
    }
  };

  /** Jalur manual: pesanan dititipkan ke kasir untuk dikonfirmasi. */
  const kirimKeKasir = async (_metode: ManualMethodCode) => {
    setError(null);
    setBusy(true);
    try {
      const orderId = await pastikanOrder();
      setManualOpen(false);
      keStatus(orderId);
    } catch (err) {
      setError(describeApiError(err, 'Pesanan gagal dikirim. Coba lagi.'));
    } finally {
      setBusy(false);
    }
  };

  const handleBayar = () => {
    if (busy) return;
    if (!table) {
      setError('Meja belum dikenali. Pindai ulang QR di meja kamu.');
      return;
    }
    if (!opsi) {
      setError(opsiError ?? 'Metode pembayaran belum siap. Tunggu sebentar.');
      return;
    }
    if (!jalur) {
      setError('Kafe ini belum menerima pembayaran. Hubungi kasir.');
      return;
    }
    if (jalur === 'MIDTRANS') void bayarMidtrans();
    else if (jalur === 'DOKU') void bayarDoku();
    else setManualOpen(true);
  };

  if (lines.length === 0) return null;

  const tombolLabel = busy
    ? 'Memproses…'
    : jalur
      ? JALUR[jalur].tombol
      : 'Bayar Sekarang';

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col bg-slate-100 shadow-xl">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <button
          type="button"
          onClick={() => navigate('/keranjang')}
          aria-label="Kembali ke keranjang"
          className="rounded-full p-1.5 text-slate-600 transition hover:bg-slate-100"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-bold text-slate-900">Pembayaran</h1>
          <p className="text-xs text-slate-500">
            {table ? `${table.cafeName} · ${table.tableName}` : 'Meja belum dikenali'}
          </p>
        </div>
      </header>

      <main className="flex-1 space-y-5 px-4 py-4">
        {error && (
          <p
            role="alert"
            className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700"
          >
            {error}
          </p>
        )}

        {opsiError && !error && (
          <p
            role="alert"
            className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800"
          >
            {opsiError}
          </p>
        )}

        {/* Ringkasan pesanan */}
        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
            Ringkasan Pesanan
          </h2>
          <ul className="divide-y divide-slate-100">
            {lines.map((line) => (
              <li key={line.item.id} className="flex justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-800">
                    <span className="text-brand-700">{line.quantity}×</span>{' '}
                    {line.item.name}
                  </p>
                  {line.notes && (
                    <p className="truncate text-xs italic text-slate-400">
                      “{line.notes}”
                    </p>
                  )}
                </div>
                <span className="shrink-0 font-medium text-slate-700 tabular-nums">
                  {formatRupiah(line.item.price * line.quantity)}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* Cara bayar — pelanggan memilih di antara jalur yang tersedia */}
        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
            Pilih metode pembayaran
          </h2>
          {!opsi ? (
            <div className="h-16 animate-pulse rounded-xl bg-slate-100" />
          ) : tersedia.length === 0 ? (
            <div className="flex items-center gap-3 rounded-2xl bg-amber-50 p-3.5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white text-xl shadow-sm">
                🧾
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">Belum ada metode aktif</p>
                <p className="text-sm text-slate-600">
                  Kafe ini belum menyiapkan cara pembayaran. Hubungi kasir.
                </p>
              </div>
            </div>
          ) : (
            <div role="radiogroup" aria-label="Metode pembayaran" className="grid gap-2">
              {tersedia.map((kode) => {
                const info = JALUR[kode];
                const dipilih = jalur === kode;
                return (
                  <button
                    key={kode}
                    type="button"
                    role="radio"
                    aria-checked={dipilih}
                    disabled={busy}
                    onClick={() => {
                      setJalur(kode);
                      setError(null);
                    }}
                    className={`flex w-full items-center gap-3 rounded-2xl border-2 p-3.5 text-left transition disabled:cursor-not-allowed ${
                      dipilih
                        ? 'border-brand-500 bg-brand-50/40 ring-2 ring-brand-100'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xl">
                      {info.ikon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-slate-900">{info.nama}</span>
                      <span className="block text-sm text-slate-500">{info.keterangan}</span>
                    </span>
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                        dipilih ? 'border-brand-600 bg-brand-600' : 'border-slate-300'
                      }`}
                    >
                      {dipilih && <span className="h-2 w-2 rounded-full bg-white" />}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </main>

      {/* Total + bayar */}
      <footer className="sticky bottom-0 border-t border-slate-200 bg-white px-4 pb-5 pt-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-sm text-slate-500">Total ({totalItems} item)</span>
          <span className="text-xl font-bold text-slate-900 tabular-nums">
            {formatRupiah(totalAmount)}
          </span>
        </div>
        <button
          type="button"
          onClick={handleBayar}
          disabled={busy || !jalur}
          className="w-full rounded-2xl bg-brand-600 py-3.5 text-center font-semibold text-white shadow-sm transition hover:bg-brand-700 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {tombolLabel}
        </button>
      </footer>

      {manualOpen && opsi && (
        <ManualMethodModal
          metodeDiterima={opsi.metodeDiterima}
          amount={totalAmount}
          busy={busy}
          error={error}
          onConfirm={(metode) => void kirimKeKasir(metode)}
          onClose={() => setManualOpen(false)}
        />
      )}
    </div>
  );
}
