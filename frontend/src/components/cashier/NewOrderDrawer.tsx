import { useEffect, useMemo, useRef, useState } from 'react';
import type { FulfillmentType, ManualMethodCode } from '../../types/order';
import type { BuatPesananKasirInput, PaymentConfigDTO } from '../../types/api';
import { useKasirPos } from '../../hooks/useKasirPos';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { formatRupiah, parseAmountInput } from '../../lib/format';
import AlertBanner from '../common/AlertBanner';
import TablePicker from './TablePicker';
import PosCartPanel from './PosCartPanel';

interface NewOrderDrawerProps {
  cafeId: string;
  config: PaymentConfigDTO | null;
  /** Galat dari server (mis. metode belum aktif) — ditampilkan di dalam dialog. */
  error: string | null;
  busy: boolean;
  onSubmit: (input: BuatPesananKasirInput) => void;
  onClose: () => void;
}

/**
 * Buat kunci anti-kirim-ganda untuk satu keranjang.
 *
 * Dibuat di klien, sekali per dialog, dan TIDAK berubah saat kasir menekan
 * tombol berkali-kali — itulah yang membuat server bisa mengenali "ini
 * permintaan yang sama" dan mengembalikan pesanan yang sudah ada alih-alih
 * menerbitkan tagihan kedua. `crypto.randomUUID` tidak selalu tersedia di
 * peramban lama/konteks non-HTTPS, jadi ada cadangannya.
 */
function buatKunciIdempotensi(): string {
  const acak =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
  return `kasir-${Date.now().toString(36)}-${acak}`;
}

/**
 * Dialog "Pesanan Baru" — kasir menyusun pesanan lalu menagihnya sekaligus.
 *
 * Dua kolom di layar lebar (menu di kiri, keranjang di kanan) dan bertumpuk di
 * layar sempit, karena perangkat kasir bisa berupa tablet melintang maupun
 * ponsel. Yang tidak pernah berubah: keranjang dan tombol bayar selalu bisa
 * dijangkau tanpa menggulir ke ujung halaman.
 */
export default function NewOrderDrawer({
  cafeId,
  config,
  error,
  busy,
  onSubmit,
  onClose,
}: NewOrderDrawerProps) {
  const pos = useKasirPos(cafeId, true);
  useBodyScrollLock();

  const [jenis, setJenis] = useState<FulfillmentType>('DINE_IN');
  const [tableId, setTableId] = useState<string | null>(null);
  const [namaTamu, setNamaTamu] = useState('');
  const [catatanPesanan, setCatatanPesanan] = useState('');
  const [cari, setCari] = useState('');
  const [kategoriAktif, setKategoriAktif] = useState<string | null>(null);
  const [metode, setMetode] = useState<ManualMethodCode | null>(null);
  const [uangDiterima, setUangDiterima] = useState('');
  const [referensi, setReferensi] = useState('');
  /** Panel yang tampil di layar sempit — menu atau keranjang. */
  const [panelHp, setPanelHp] = useState<'menu' | 'keranjang'>('menu');

  /**
   * Kunci idempotensi milik keranjang INI. Dibuat sekali saat dialog dibuka dan
   * bertahan selama dialognya hidup, termasuk saat pengiriman gagal lalu kasir
   * mencoba lagi — percobaan ulang memang harus dikenali sebagai permintaan
   * yang sama.
   */
  const kunciRef = useRef(buatKunciIdempotensi());

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  // Satu metode aktif → langsung dipilih; kasir tidak perlu satu ketukan
  // tambahan untuk memilih satu-satunya pilihan yang ada.
  useEffect(() => {
    if (metode !== null || !config) return;
    if (config.metodeDiterima.length === 1) {
      setMetode(config.metodeDiterima[0] as ManualMethodCode);
    }
  }, [config, metode]);

  const kategoriTampil = useMemo(() => {
    const kata = cari.trim().toLowerCase();
    return pos.kategori
      .filter((k) => kategoriAktif === null || k.id === kategoriAktif)
      .map((k) => ({
        ...k,
        items: kata
          ? k.items.filter((i) => i.name.toLowerCase().includes(kata))
          : k.items,
      }))
      .filter((k) => k.items.length > 0);
  }, [pos.kategori, kategoriAktif, cari]);

  const adaHasil = kategoriTampil.length > 0;
  const mejaDipilih = pos.meja.find((m) => m.id === tableId) ?? null;

  const kirim = () => {
    if (busy) return;
    if (pos.keranjang.length === 0 || metode === null) return;
    if (jenis === 'DINE_IN' && !tableId) return;

    const diterima = parseAmountInput(uangDiterima);
    // Untuk metode non-tunai, yang diterima persis sebesar tagihan. Untuk tunai,
    // angka yang benar-benar diserahkan tamu — selisihnya menjadi kembalian.
    const nominal = metode === 'TUNAI' ? (diterima ?? 0) : pos.subtotal;
    if (metode === 'TUNAI' && nominal < pos.subtotal) return;

    onSubmit({
      fulfillmentType: jenis,
      tableId: jenis === 'DINE_IN' ? tableId : null,
      customerName: namaTamu.trim() || null,
      catatan: catatanPesanan.trim() || null,
      items: pos.keranjang.map((b) => ({
        menuItemId: b.item.id,
        quantity: b.quantity,
        notes: b.notes.trim(),
      })),
      pembayaran: {
        metode,
        nominal,
        catatanKasir: null,
        referensi: referensi.trim() || null,
      },
      idempotencyKey: kunciRef.current,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center overflow-hidden bg-warm-espresso/40 backdrop-blur-sm sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pesanan-baru-title"
    >
      <div className="flex h-full w-full max-w-6xl flex-col overflow-hidden bg-warm-cream shadow-2xl sm:rounded-2xl">
        {/* Kepala */}
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-warm-line bg-warm-paper px-4 py-3">
          <div className="min-w-0">
            <h2
              id="pesanan-baru-title"
              className="truncate text-lg font-bold text-warm-espresso"
            >
              Pesanan Baru
            </h2>
            <p className="truncate text-xs text-warm-muted">
              {jenis === 'DINE_IN'
                ? mejaDipilih
                  ? `Makan di tempat · ${mejaDipilih.tableName}`
                  : 'Makan di tempat · pilih meja dulu'
                : 'Bawa pulang · nomor antrian dibuat otomatis'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup pesanan baru"
            className="shrink-0 rounded-full p-2 text-warm-muted transition hover:bg-warm-espresso/5"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </header>

        {error && (
          <div className="shrink-0 px-4 pt-3">
            <AlertBanner tone="error">{error}</AlertBanner>
          </div>
        )}
        {pos.error && (
          <div className="shrink-0 px-4 pt-3">
            <AlertBanner
              tone="error"
              action={{ label: 'Coba lagi', onClick: pos.reload }}
            >
              {pos.error}
            </AlertBanner>
          </div>
        )}

        {/* Pemilih panel — hanya di layar sempit. */}
        <div className="flex shrink-0 gap-1 border-b border-warm-line bg-warm-paper px-4 py-2 lg:hidden">
          {(['menu', 'keranjang'] as const).map((panel) => (
            <button
              key={panel}
              type="button"
              onClick={() => setPanelHp(panel)}
              aria-pressed={panelHp === panel}
              className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                panelHp === panel
                  ? 'bg-warm-amber text-white'
                  : 'text-warm-subtle hover:bg-warm-espresso/5'
              }`}
            >
              {panel === 'menu'
                ? 'Menu'
                : `Keranjang${pos.jumlahItem > 0 ? ` (${pos.jumlahItem})` : ''}`}
            </button>
          ))}
        </div>

        <div className="flex min-h-0 flex-1 lg:divide-x lg:divide-warm-line">
          {/* Kiri: jenis pesanan, meja, dan menu */}
          <section
            className={`min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-4 py-3 ${
              panelHp === 'menu' ? 'flex' : 'hidden'
            } lg:flex lg:basis-3/5`}
            data-lenis-prevent
            onTouchMove={(event) => event.stopPropagation()}
          >
            {/* Jenis pesanan */}
            <div className="mb-3 grid grid-cols-2 gap-2">
              {(
                [
                  { nilai: 'DINE_IN' as const, label: 'Makan di Tempat', ikon: '🍽️' },
                  { nilai: 'TAKEAWAY' as const, label: 'Bawa Pulang', ikon: '🥡' },
                ]
              ).map((opsi) => (
                <button
                  key={opsi.nilai}
                  type="button"
                  onClick={() => setJenis(opsi.nilai)}
                  aria-pressed={jenis === opsi.nilai}
                  className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-bold transition active:scale-[0.98] ${
                    jenis === opsi.nilai
                      ? 'bg-warm-amber text-white shadow-sm'
                      : 'bg-warm-paper text-warm-espresso ring-1 ring-warm-line hover:ring-warm-amber'
                  }`}
                >
                  <span aria-hidden>{opsi.ikon}</span>
                  {opsi.label}
                </button>
              ))}
            </div>

            {jenis === 'DINE_IN' && (
              <div className="mb-3">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-warm-muted">
                  Pilih meja
                </p>
                <TablePicker
                  tables={pos.meja}
                  selectedId={tableId}
                  onSelect={setTableId}
                />
              </div>
            )}

            <div className="mb-3">
              <label
                htmlFor="pos-nama"
                className="mb-1 block text-xs font-semibold uppercase tracking-wide text-warm-muted"
              >
                Nama pelanggan (opsional)
              </label>
              <input
                id="pos-nama"
                type="text"
                maxLength={120}
                value={namaTamu}
                onChange={(e) => setNamaTamu(e.target.value)}
                placeholder="Dipanggil saat pesanan siap"
                className="w-full rounded-xl border-0 bg-warm-paper px-3 py-2 text-sm text-warm-espresso shadow-sm ring-1 ring-warm-line placeholder:text-warm-muted focus:outline-none focus:ring-2 focus:ring-warm-amber"
              />
            </div>

            {/* Pencarian & kategori */}
            <div className="relative mb-2">
              <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-warm-muted">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="11" cy="11" r="7" />
                  <path d="m20 20-3.5-3.5" />
                </svg>
              </span>
              <input
                type="search"
                value={cari}
                onChange={(e) => setCari(e.target.value)}
                placeholder="Cari menu…"
                aria-label="Cari menu"
                className="w-full rounded-xl border-0 bg-warm-paper py-2 pl-9 pr-3 text-sm text-warm-espresso shadow-sm ring-1 ring-warm-line placeholder:text-warm-muted focus:outline-none focus:ring-2 focus:ring-warm-amber"
              />
            </div>

            {pos.kategori.length > 0 && (
              <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
                <button
                  type="button"
                  onClick={() => setKategoriAktif(null)}
                  aria-pressed={kategoriAktif === null}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    kategoriAktif === null
                      ? 'bg-warm-espresso text-warm-cream'
                      : 'bg-warm-paper text-warm-subtle ring-1 ring-warm-line'
                  }`}
                >
                  Semua
                </button>
                {pos.kategori.map((k) => (
                  <button
                    key={k.id}
                    type="button"
                    onClick={() => setKategoriAktif(k.id)}
                    aria-pressed={kategoriAktif === k.id}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                      kategoriAktif === k.id
                        ? 'bg-warm-espresso text-warm-cream'
                        : 'bg-warm-paper text-warm-subtle ring-1 ring-warm-line'
                    }`}
                  >
                    {k.name}
                  </button>
                ))}
              </div>
            )}

            {/* Papan menu */}
            {pos.loading ? (
              <div role="status" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <span className="sr-only">Memuat menu…</span>
                {Array.from({ length: 6 }, (_, i) => (
                  <div key={i} aria-hidden className="skeleton-warm h-20 rounded-xl" />
                ))}
              </div>
            ) : pos.kategori.length === 0 ? (
              <div className="rounded-xl border border-dashed border-warm-line bg-warm-paper/60 px-4 py-10 text-center">
                <span aria-hidden className="text-3xl">📋</span>
                <p className="mt-2 text-sm font-semibold text-warm-espresso">
                  Belum ada menu aktif
                </p>
                <p className="mt-1 text-xs text-warm-muted">
                  Semua menu sedang tidak tersedia. Aktifkan lewat Manajemen Menu
                  sebelum menjualnya di kasir.
                </p>
              </div>
            ) : !adaHasil ? (
              <div className="rounded-xl border border-dashed border-warm-line bg-warm-paper/60 px-4 py-10 text-center">
                <span aria-hidden className="text-3xl">🔍</span>
                <p className="mt-2 text-sm font-semibold text-warm-espresso">
                  Tidak ada menu yang cocok
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setCari('');
                    setKategoriAktif(null);
                  }}
                  className="mt-3 rounded-lg bg-warm-espresso/5 px-3 py-1.5 text-xs font-semibold text-warm-subtle transition hover:bg-warm-espresso/10"
                >
                  Reset pencarian
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {kategoriTampil.map((k) => (
                  <div key={k.id}>
                    <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-warm-muted">
                      {k.name}
                    </h3>
                    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {k.items.map((item) => (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => pos.tambah(item)}
                            className="flex h-full w-full flex-col items-start gap-1 rounded-xl bg-warm-paper px-3 py-2.5 text-left shadow-sm ring-1 ring-warm-line transition hover:ring-warm-amber active:scale-[0.98]"
                          >
                            <span className="line-clamp-2 text-sm font-semibold text-warm-espresso">
                              {item.name}
                            </span>
                            <span className="mt-auto text-xs font-bold text-warm-subtle tabular-nums">
                              {formatRupiah(item.price)}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Kanan: keranjang & pembayaran */}
          <section
            className={`min-h-0 flex-1 flex-col bg-warm-cream/60 ${
              panelHp === 'keranjang' ? 'flex' : 'hidden'
            } lg:flex lg:basis-2/5`}
          >
            <PosCartPanel
              keranjang={pos.keranjang}
              subtotal={pos.subtotal}
              jumlahItem={pos.jumlahItem}
              onUbahJumlah={pos.ubahJumlah}
              onUbahCatatan={pos.ubahCatatan}
              onHapus={pos.hapus}
              catatanPesanan={catatanPesanan}
              onCatatanPesanan={setCatatanPesanan}
              config={config}
              metode={metode}
              onMetode={setMetode}
              uangDiterima={uangDiterima}
              onUangDiterima={setUangDiterima}
              referensi={referensi}
              onReferensi={setReferensi}
              busy={busy}
              onSubmit={kirim}
            />
          </section>
        </div>

        {/* Pengingat meja — muncul hanya bila memang jadi penghalang. */}
        {jenis === 'DINE_IN' && !tableId && pos.keranjang.length > 0 && (
          <p className="shrink-0 border-t border-warm-line bg-amber-50 px-4 py-2 text-center text-xs font-semibold text-amber-900">
            Pilih meja dulu sebelum pesanan bisa dikirim ke dapur.
          </p>
        )}
      </div>
    </div>
  );
}
