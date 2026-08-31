import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import type {
  FulfillmentType,
  ManualMethodCode,
  OrderSource,
} from '../types/order';
import type {
  BuatPesananKasirInput,
  CashierOrderDTO,
  TabKasir,
} from '../types/api';
import { useAuth } from '../auth/AuthContext';
import { useCashierOrders } from '../hooks/useCashierOrders';
import { usePaymentConfig } from '../hooks/usePaymentConfig';
import { pembayaranApi } from '../api/pembayaran';
import { payWithSnap } from '../lib/midtransSnap';
import { describeApiError } from '../lib/apiClient';
import { formatRupiah } from '../lib/format';
import { labelMetode } from '../data/paymentMethods';
import { labelTujuan } from '../lib/orderStatus';
import { downloadReceiptPdf } from '../lib/receipt';
import AppLayout from '../components/layout/AppLayout';
import AlertBanner from '../components/common/AlertBanner';
import OrderCard from '../components/cashier/OrderCard';
import OrderDetailDrawer from '../components/cashier/OrderDetailDrawer';
import NewOrderDrawer from '../components/cashier/NewOrderDrawer';
import PaymentModal, { type CashDetail } from '../components/cashier/PaymentModal';
import PaymentSuccessModal from '../components/cashier/PaymentSuccessModal';
import RejectPaymentModal, {
  type ModeAlasan,
} from '../components/cashier/RejectPaymentModal';
import ReceiptPrintModal from '../components/cashier/ReceiptPrintModal';

/**
 * Halaman kasir — POS lengkap untuk tiga alur pesanan.
 *
 *   A. QR meja + Midtrans  → sudah lunas saat sampai ke sini; kasir tinggal
 *      memantau dan menyerahkannya. TIDAK menunggu konfirmasi siapa pun.
 *   B. QR meja + bayar di kasir → masuk tab "Perlu Konfirmasi"; baru dikirim ke
 *      dapur setelah kasir benar-benar menerima uangnya.
 *   C. Pesan langsung di kasir → dibuat & ditagih di dialog "Pesanan Baru",
 *      tersimpan dan terkirim ke dapur dalam satu transaksi.
 *
 * Yang menyatukan ketiganya: tidak ada satu pun jalur di layar ini yang bisa
 * menerbitkan tiket dapur tanpa pembayaran yang tercatat sukses di server.
 */

const TAB: { nilai: TabKasir; label: string }[] = [
  { nilai: 'PERLU_KONFIRMASI', label: 'Perlu Konfirmasi' },
  { nilai: 'SUDAH_DIBAYAR', label: 'Sudah Dibayar' },
  { nilai: 'SEDANG_DIPROSES', label: 'Sedang Diproses' },
  { nilai: 'SELESAI', label: 'Selesai' },
  { nilai: 'SEMUA', label: 'Semua Pesanan' },
];

/** Empty state berbeda per tab — "kosong" punya arti berbeda di tiap kolom. */
const KOSONG: Record<TabKasir, { ikon: string; judul: string; pesan: string }> = {
  PERLU_KONFIRMASI: {
    ikon: '💳',
    judul: 'Tidak ada pembayaran tertunda',
    pesan:
      'Pesanan yang memilih bayar di kasir akan muncul di sini. Pesanan yang dibayar lewat Midtrans langsung masuk tab "Sudah Dibayar".',
  },
  SUDAH_DIBAYAR: {
    ikon: '✅',
    judul: 'Belum ada pesanan lunas yang menunggu dapur',
    pesan: 'Pesanan yang sudah dibayar dan sedang antre di dapur muncul di sini.',
  },
  SEDANG_DIPROSES: {
    ikon: '🍳',
    judul: 'Dapur sedang tidak mengerjakan apa pun',
    pesan:
      'Pesanan yang sedang dimasak atau sudah siap disajikan akan muncul di sini secara langsung.',
  },
  SELESAI: {
    ikon: '🧾',
    judul: 'Belum ada transaksi hari ini',
    pesan:
      'Pesanan yang sudah diserahkan atau dibatalkan hari ini akan tercatat di sini.',
  },
  SEMUA: {
    ikon: '☕',
    judul: 'Belum ada pesanan',
    pesan: 'Buat pesanan pertama lewat tombol "+ Pesanan Baru".',
  },
};

interface CashierPageProps {
  /**
   * Dirender TANPA kerangka pemilik (`AppLayout`).
   *
   * Dipakai saat halaman ini menjadi tab "Kasir" di dalam `PosShell` — layar
   * terminal POS yang sudah punya kepala, jam berjalan, dan navigasinya
   * sendiri. Bagian A menuntut kasir tidak melihat rel navigasi pemilik, dan
   * dua kerangka yang bertumpuk juga akan menampilkan dua judul "Kasir".
   */
  embedded?: boolean;
}

export default function CashierPage({ embedded = false }: CashierPageProps = {}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const cafeId = user?.cafeId ?? '';
  const kasir = useCashierOrders(cafeId);
  const { config, error: configError } = usePaymentConfig(cafeId);

  /** Pesanan yang dialog pembayarannya sedang terbuka. */
  const [payingOrder, setPayingOrder] = useState<CashierOrderDTO | null>(null);
  /** Pesanan yang sedang ditolak/dibatalkan, beserta jenis keputusannya. */
  const [alasanUntuk, setAlasanUntuk] = useState<{
    order: CashierOrderDTO;
    mode: ModeAlasan;
  } | null>(null);
  const [alasanError, setAlasanError] = useState<string | null>(null);
  const [alasanBusy, setAlasanBusy] = useState(false);
  /** Pesanan yang detailnya sedang dibuka. */
  const [detailOrder, setDetailOrder] = useState<CashierOrderDTO | null>(null);
  /** Dialog "Pesanan Baru" terbuka. */
  const [posOpen, setPosOpen] = useState(false);
  const [posError, setPosError] = useState<string | null>(null);
  const [posBusy, setPosBusy] = useState(false);
  /** Pembayaran yang baru berhasil — dasar notifikasi sukses & cetak struk. */
  const [paidResult, setPaidResult] = useState<{
    order: CashierOrderDTO;
    cash: CashDetail | null;
  } | null>(null);
  /** Struk yang sedang dipratinjau untuk dicetak. */
  const [receipt, setReceipt] = useState<{
    order: CashierOrderDTO;
    cash: CashDetail | null;
  } | null>(null);
  const [printing, setPrinting] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [printError, setPrintError] = useState<string | null>(null);
  /** Kegagalan konfirmasi pembayaran — ditampilkan di dalam dialog / halaman. */
  const [paymentError, setPaymentError] = useState<string | null>(null);
  /** Permintaan pembayaran (manual/Midtrans) sedang diproses. */
  const [paymentBusy, setPaymentBusy] = useState(false);
  const [aksiError, setAksiError] = useState<string | null>(null);

  // Satu jam bersama untuk seluruh kartu — label "lama menunggu" ikut berdetak.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!confirmation) return;
    const timer = setTimeout(() => setConfirmation(null), 4000);
    return () => clearTimeout(timer);
  }, [confirmation]);

  // Detail yang sedang terbuka ikut mutakhir saat daftarnya diperbarui —
  // tanpa ini, kasir membaca total lama sementara tamunya menambah pesanan.
  useEffect(() => {
    if (!detailOrder) return;
    const terbaru = kasir.orders.find((o) => o.id === detailOrder.id);
    if (terbaru && terbaru !== detailOrder) setDetailOrder(terbaru);
  }, [kasir.orders, detailOrder]);

  if (!user) return <Navigate to="/login" replace />;

  const ringkasan = kasir.summary;

  const handleManualConfirm = async (
    metode: ManualMethodCode,
    nominal: number,
    catatan: string | null,
    cash: CashDetail | null,
    referensi: string | null,
  ) => {
    if (!payingOrder) return;
    setPaymentError(null);
    setPaymentBusy(true);
    try {
      const paid = await kasir.markPaidManual(
        payingOrder.id,
        metode,
        nominal,
        catatan,
        referensi,
      );
      setPayingOrder(null);
      setDetailOrder(null);
      setPaidResult({ order: paid, cash });
      setConfirmation(
        `${labelTujuan(paid)} ditandai lunas (${labelMetode(metode)}). Pesanan dikirim ke dapur.`,
      );
    } catch (err) {
      // Modal dibiarkan terbuka agar kasir bisa langsung mencoba lagi.
      setPaymentError(describeApiError(err, 'Pembayaran gagal dikonfirmasi.'));
    } finally {
      setPaymentBusy(false);
    }
  };

  /**
   * Tolak pengajuan pembayaran, atau batalkan pesanannya sama sekali.
   *
   * Modal dibiarkan terbuka bila gagal — kasir sudah mengetik alasannya, dan
   * memaksanya mengulang karena jaringan sempat putus tidak masuk akal.
   */
  const handleAlasan = async (alasan: string) => {
    if (!alasanUntuk) return;
    setAlasanError(null);
    setAlasanBusy(true);
    try {
      const { order, mode } = alasanUntuk;
      const tujuan = labelTujuan(order);
      if (mode === 'TOLAK') {
        await kasir.rejectManual(order.id, alasan);
        setConfirmation(
          `Pembayaran ${tujuan} ditolak. Pesanannya kembali menunggu pembayaran.`,
        );
      } else {
        await kasir.cancelOrder(order.id, alasan);
        setConfirmation(`Pesanan ${tujuan} dibatalkan.`);
      }
      setAlasanUntuk(null);
      setDetailOrder(null);
    } catch (err) {
      setAlasanError(describeApiError(err, 'Tindakan gagal disimpan.'));
    } finally {
      setAlasanBusy(false);
    }
  };

  const handleSelesai = async (order: CashierOrderDTO) => {
    setAksiError(null);
    try {
      await kasir.completeOrder(order.id);
      setDetailOrder(null);
      setConfirmation(`${labelTujuan(order)} ditandai sudah diserahkan.`);
    } catch (err) {
      setAksiError(describeApiError(err, 'Pesanan gagal ditandai selesai.'));
    }
  };

  /**
   * Simpan pesanan yang disusun kasir.
   *
   * `posBusy` menutup pintu ganda di sisi layar; kunci idempotensi yang dibawa
   * `input` menutupnya di sisi server. Keduanya perlu: yang pertama mencegah
   * dua permintaan terkirim, yang kedua menangani dua permintaan yang terlanjur
   * terkirim (mis. dari dua tab kasir sekaligus).
   */
  const handleBuatPesanan = async (input: BuatPesananKasirInput) => {
    if (posBusy) return;
    setPosError(null);
    setPosBusy(true);
    try {
      const dibuat = await kasir.createOrder(input);
      setPosOpen(false);
      const kembalian = dibuat.pembayaranManual?.kembalian ?? 0;
      setPaidResult({
        order: dibuat,
        cash:
          input.pembayaran.metode === 'TUNAI'
            ? { received: input.pembayaran.nominal, change: kembalian }
            : null,
      });
      setConfirmation(
        `Pesanan ${labelTujuan(dibuat)} tersimpan dan dikirim ke dapur.`,
      );
    } catch (err) {
      setPosError(describeApiError(err, 'Pesanan gagal disimpan.'));
    } finally {
      setPosBusy(false);
    }
  };

  const handleMidtrans = async () => {
    if (!payingOrder) return;
    setPaymentError(null);
    setPaymentBusy(true);
    try {
      const tx = await pembayaranApi.buatMidtrans(payingOrder.id);
      if (!tx.clientKey) {
        setPaymentError('Client Key Midtrans belum diisi di Pengaturan.');
        return;
      }
      payWithSnap({
        snapToken: tx.snapToken,
        clientKey: tx.clientKey,
        isProduction: tx.isProduction,
        onSuccess: (r) => navigate(`/pembayaran/${r.order_id ?? tx.orderId}?status=sukses`),
        onPending: (r) => navigate(`/pembayaran/${r.order_id ?? tx.orderId}?status=menunggu`),
        onError: () => setPaymentError('Pembayaran gagal, coba lagi.'),
        onClose: () => setPaymentError('Pembayaran dibatalkan.'),
      });
      // Popup Snap mengambil alih layar — tutup modal pemilihan.
      setPayingOrder(null);
    } catch (err) {
      setPaymentError(describeApiError(err, 'Gagal membuat transaksi Midtrans.'));
    } finally {
      setPaymentBusy(false);
    }
  };

  /**
   * Unduh struk sebagai PDF. Identitas kafe diambil dari sesi pengguna supaya
   * struk selalu memakai nama kafe (tenant) yang benar.
   */
  const handleDownloadPdf = async () => {
    if (!receipt || printing) return;
    setPrinting(true);
    setPrintError(null);
    try {
      await downloadReceiptPdf(
        receipt.order,
        { id: receipt.order.cafeId, name: user?.cafeName ?? 'CafeOS', tagline: '' },
        receipt.cash,
      );
    } catch {
      setPrintError('Struk PDF gagal dibuat. Coba lagi.');
    } finally {
      setPrinting(false);
    }
  };

  const hitunganTab: Record<TabKasir, number | null> = {
    PERLU_KONFIRMASI: ringkasan?.perluKonfirmasi ?? null,
    SUDAH_DIBAYAR: ringkasan?.sudahDibayar ?? null,
    SEDANG_DIPROSES: ringkasan?.sedangDiproses ?? null,
    SELESAI: ringkasan?.selesaiHariIni ?? null,
    SEMUA: null,
  };

  const adaFilter =
    kasir.filter.fulfillmentType !== null || kasir.filter.orderSource !== null;

  const isi = (
    <>
      <div className="space-y-4">
        {/* Kepala: angka, tombol utama, pencarian, filter */}
        <section className="rounded-2xl bg-warm-paper p-4 shadow-sm ring-1 ring-warm-line">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <dl aria-label="Ringkasan kasir" className="flex flex-wrap gap-x-6 gap-y-2">
              <div>
                <dt className="text-xs text-warm-muted">Perlu diproses</dt>
                <dd className="text-2xl font-bold text-warm-espresso tabular-nums">
                  {ringkasan ? ringkasan.perluKonfirmasi : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-warm-muted">Di dapur</dt>
                <dd className="text-2xl font-bold text-warm-espresso tabular-nums">
                  {ringkasan ? ringkasan.sudahDibayar + ringkasan.sedangDiproses : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-warm-muted">
                  Pembayaran hari ini
                  {ringkasan ? ` · ${ringkasan.transaksiHariIni} transaksi` : ''}
                </dt>
                <dd className="text-2xl font-bold text-warm-espresso tabular-nums">
                  {ringkasan ? formatRupiah(ringkasan.totalHariIni) : '—'}
                </dd>
              </div>
            </dl>

            <button
              type="button"
              onClick={() => {
                setPosError(null);
                setPosOpen(true);
              }}
              className="rounded-xl bg-warm-amber px-5 py-3 text-sm font-bold text-white shadow-sm transition hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-warm-amber focus-visible:ring-offset-2 active:scale-95"
            >
              + Pesanan Baru
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[14rem] flex-1">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-warm-muted">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
              </span>
              <input
                type="search"
                value={kasir.filter.q}
                onChange={(event) => kasir.setQuery(event.target.value)}
                placeholder="Cari kode pesanan, nomor antrian, meja, atau nama tamu…"
                aria-label="Cari pesanan"
                className="w-full rounded-xl border-0 bg-warm-cream/60 py-2.5 pl-10 pr-4 text-sm text-warm-espresso ring-1 ring-warm-line placeholder:text-warm-muted focus:outline-none focus:ring-2 focus:ring-warm-amber"
              />
            </div>

            <select
              value={kasir.filter.fulfillmentType ?? ''}
              onChange={(e) =>
                kasir.setFilter({
                  fulfillmentType: (e.target.value || null) as FulfillmentType | null,
                })
              }
              aria-label="Filter jenis pesanan"
              className="rounded-xl border-0 bg-warm-cream/60 px-3 py-2.5 text-sm font-medium text-warm-espresso ring-1 ring-warm-line focus:outline-none focus:ring-2 focus:ring-warm-amber"
            >
              <option value="">Semua jenis</option>
              <option value="DINE_IN">Makan di Tempat</option>
              <option value="TAKEAWAY">Bawa Pulang</option>
            </select>

            <select
              value={kasir.filter.orderSource ?? ''}
              onChange={(e) =>
                kasir.setFilter({
                  orderSource: (e.target.value || null) as OrderSource | null,
                })
              }
              aria-label="Filter sumber pesanan"
              className="rounded-xl border-0 bg-warm-cream/60 px-3 py-2.5 text-sm font-medium text-warm-espresso ring-1 ring-warm-line focus:outline-none focus:ring-2 focus:ring-warm-amber"
            >
              <option value="">Semua sumber</option>
              <option value="TABLE_QR">QR Meja</option>
              <option value="CASHIER">Kasir</option>
            </select>
          </div>
        </section>

        {/* Tab */}
        <div
          role="tablist"
          aria-label="Kelompok pesanan"
          className="flex gap-1 overflow-x-auto rounded-2xl bg-warm-paper p-1.5 shadow-sm ring-1 ring-warm-line"
        >
          {TAB.map((tab) => {
            const aktif = kasir.filter.tab === tab.nilai;
            const jumlah = hitunganTab[tab.nilai];
            return (
              <button
                key={tab.nilai}
                type="button"
                role="tab"
                aria-selected={aktif}
                onClick={() => kasir.setTab(tab.nilai)}
                className={`shrink-0 rounded-xl px-3.5 py-2 text-sm font-semibold transition ${
                  aktif
                    ? 'bg-warm-espresso text-warm-cream'
                    : 'text-warm-subtle hover:bg-warm-espresso/5'
                }`}
              >
                {tab.label}
                {jumlah !== null && jumlah > 0 && (
                  <span
                    className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[11px] tabular-nums ${
                      aktif ? 'bg-warm-cream/20' : 'bg-warm-espresso/10'
                    }`}
                  >
                    {jumlah}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {!kasir.loading && kasir.error && (
          <AlertBanner
            tone="error"
            title="Gagal memuat daftar pesanan"
            action={{ label: 'Coba lagi', onClick: kasir.reload }}
          >
            {kasir.error}
          </AlertBanner>
        )}

        {/* Realtime menyerah setelah beberapa percobaan. Daftar tetap jalan
            lewat polling, jadi ini peringatan — bukan galat yang memblokir. */}
        {kasir.realtimeStatus === 'offline' && (
          <AlertBanner
            tone="warning"
            title="Pembaruan langsung terputus"
            action={{ label: 'Sambungkan ulang', onClick: kasir.retryRealtime }}
          >
            Daftar tetap diperbarui otomatis tiap beberapa detik, hanya tidak
            seketika. Pembayaran dan cetak struk tidak terpengaruh.
          </AlertBanner>
        )}

        {configError && (
          <AlertBanner tone="warning">
            Konfigurasi pembayaran gagal dimuat — metode mungkin belum lengkap.{' '}
            {configError}
          </AlertBanner>
        )}

        {config && config.metodeDiterima.length === 0 && !config.midtransAktif && (
          <AlertBanner tone="warning" title="Belum ada metode pembayaran aktif">
            Kasir belum bisa menagih apa pun. Pemilik kafe perlu menyalakan
            minimal satu metode di halaman Pengaturan Pembayaran.
          </AlertBanner>
        )}

        {paymentError && !payingOrder && (
          <AlertBanner tone="error" onClose={() => setPaymentError(null)}>
            {paymentError}
          </AlertBanner>
        )}

        {aksiError && (
          <AlertBanner tone="error" onClose={() => setAksiError(null)}>
            {aksiError}
          </AlertBanner>
        )}

        {printError && (
          <AlertBanner tone="error" onClose={() => setPrintError(null)}>
            {printError}
          </AlertBanner>
        )}

        {confirmation && (
          <AlertBanner tone="success" onClose={() => setConfirmation(null)}>
            {confirmation}
          </AlertBanner>
        )}

        {/* Daftar */}
        {kasir.loading ? (
          <div role="status" className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            <span className="sr-only">Memuat daftar pesanan…</span>
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} aria-hidden className="skeleton-warm h-56 rounded-2xl" />
            ))}
          </div>
        ) : kasir.orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-warm-line bg-warm-paper/60 px-6 py-20 text-center">
            <span aria-hidden className="text-4xl">
              {kasir.filter.q || adaFilter ? '🔍' : KOSONG[kasir.filter.tab].ikon}
            </span>
            <h2 className="mt-3 text-lg font-semibold text-warm-espresso">
              {kasir.filter.q || adaFilter
                ? 'Tidak ada pesanan yang cocok'
                : KOSONG[kasir.filter.tab].judul}
            </h2>
            <p className="mt-1 max-w-md text-sm text-warm-muted">
              {kasir.filter.q || adaFilter
                ? 'Coba ubah kata kunci atau kosongkan filternya.'
                : KOSONG[kasir.filter.tab].pesan}
            </p>
            {(kasir.filter.q || adaFilter) && (
              <button
                type="button"
                onClick={() => {
                  kasir.setQuery('');
                  kasir.setFilter({ fulfillmentType: null, orderSource: null });
                }}
                className="mt-4 rounded-lg bg-warm-espresso/5 px-4 py-2 text-sm font-semibold text-warm-subtle transition hover:bg-warm-espresso/10"
              >
                Reset pencarian & filter
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
            {kasir.orders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                now={now}
                onDetail={setDetailOrder}
                onPay={setPayingOrder}
                onTolak={(o) => {
                  setAlasanError(null);
                  setAlasanUntuk({ order: o, mode: 'TOLAK' });
                }}
                onBatal={(o) => {
                  setAlasanError(null);
                  setAlasanUntuk({ order: o, mode: 'BATAL' });
                }}
                onSelesai={(o) => void handleSelesai(o)}
              />
            ))}
          </div>
        )}
      </div>

      {posOpen && (
        <NewOrderDrawer
          cafeId={cafeId}
          config={config}
          error={posError}
          busy={posBusy}
          onSubmit={(input) => void handleBuatPesanan(input)}
          onClose={() => {
            setPosOpen(false);
            setPosError(null);
          }}
        />
      )}

      {detailOrder && (
        <OrderDetailDrawer
          order={detailOrder}
          onClose={() => setDetailOrder(null)}
          onPay={setPayingOrder}
          onTolak={(o) => {
            setAlasanError(null);
            setAlasanUntuk({ order: o, mode: 'TOLAK' });
          }}
          onBatal={(o) => {
            setAlasanError(null);
            setAlasanUntuk({ order: o, mode: 'BATAL' });
          }}
          onSelesai={(o) => void handleSelesai(o)}
          onCetak={(o) => {
            setReceipt({ order: o, cash: null });
            setDetailOrder(null);
          }}
        />
      )}

      {payingOrder && config && (
        <PaymentModal
          order={payingOrder}
          config={config}
          busy={paymentBusy}
          error={paymentError}
          onManualConfirm={handleManualConfirm}
          onMidtrans={() => void handleMidtrans()}
          onClose={() => {
            setPayingOrder(null);
            setPaymentError(null);
          }}
        />
      )}

      {alasanUntuk && (
        <RejectPaymentModal
          order={alasanUntuk.order}
          mode={alasanUntuk.mode}
          busy={alasanBusy}
          error={alasanError}
          onTolak={(alasan) => void handleAlasan(alasan)}
          onTutup={() => {
            setAlasanUntuk(null);
            setAlasanError(null);
          }}
        />
      )}

      {paidResult && (
        <PaymentSuccessModal
          order={paidResult.order}
          change={paidResult.cash?.change ?? null}
          onPrint={() => {
            setReceipt(paidResult);
            setPaidResult(null);
          }}
          onClose={() => setPaidResult(null)}
        />
      )}

      {receipt && (
        <ReceiptPrintModal
          order={receipt.order}
          cafeName={user.cafeName}
          cash={receipt.cash}
          downloading={printing}
          onDownloadPdf={() => void handleDownloadPdf()}
          onClose={() => setReceipt(null)}
        />
      )}
    </>
  );

  // Di dalam terminal POS, kerangkanya sudah disediakan `PosShell` — lengkap
  // dengan nama kasir, shift berjalan, dan tombol Ganti Petugas. Yang dibutuhkan
  // dari sini hanya isinya.
  if (embedded) return isi;

  return (
    <AppLayout
      title="Kasir"
      subtitle={
        ringkasan
          ? `${ringkasan.perluKonfirmasi} perlu diproses · ${formatRupiah(
              ringkasan.totalHariIni,
            )} hari ini`
          : 'Memuat ringkasan…'
      }
    >
      {isi}
    </AppLayout>
  );
}
