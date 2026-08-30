import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import type {
  KodeMetode,
  MetodePembayaranDTO,
  ModeMidtrans,
  PengaturanPembayaranDTO,
  StatusIntegrasiMidtrans,
} from '../types/api';
import type { KonfigurasiMetodeInput, MetodeAktifItem } from '../api/pembayaran';
import { useAuth } from '../auth/AuthContext';
import { pembayaranApi } from '../api/pembayaran';
import { describeApiError } from '../lib/apiClient';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import AppLayout from '../components/layout/AppLayout';
import AlertBanner from '../components/common/AlertBanner';
import PaymentIcon from '../components/payment/PaymentIcon';
import PaymentSummary from '../components/payment/PaymentSummary';
import StatusBadge, { type NadaBadge } from '../components/payment/StatusBadge';
import MethodCard from '../components/payment/MethodCard';
import MethodConfigDialog from '../components/payment/MethodConfigDialog';
import MidtransDialog from '../components/payment/MidtransDialog';

/**
 * Kalimat status untuk badge di kepala halaman — satu keadaan, satu kalimat.
 *
 * "Kredensial tersimpan" kini hanya muncul kalau kredensialnya memang tersimpan
 * DAN terbaca server. Dulu ia juga muncul untuk kunci yang tidak bisa dibuka
 * sama sekali, tepat di sebelah pesan yang mengatakan sebaliknya.
 */
const STATUS_ONLINE: Record<StatusIntegrasiMidtrans, { nada: NadaBadge; teks: string }> = {
  SIAP: { nada: 'hijau', teks: 'Siap menerima pembayaran' },
  KONEKSI_GAGAL: { nada: 'merah', teks: 'Koneksi gagal' },
  PERLU_DIMASUKKAN_ULANG: { nada: 'merah', teks: 'Kredensial perlu dimasukkan ulang' },
  KONFIGURASI_SERVER: { nada: 'merah', teks: 'Konfigurasi server bermasalah' },
  KREDENSIAL_TERSIMPAN: { nada: 'kuning', teks: 'Kredensial tersimpan' },
  BELUM_DIKONFIGURASI: { nada: 'abu', teks: 'Belum dikonfigurasi' },
};


/**
 * Pengaturan Pembayaran kafe (khusus OWNER).
 *
 * Susunannya mengikuti cara pemilik kafe berpikir, bukan cara data tersimpan:
 *
 *   1. Ringkasan  — "sekarang tamu saya bisa bayar pakai apa?"
 *   2. Pembayaran online pelanggan (Midtrans) — satu kartu berisi keadaan,
 *      dengan seluruh isian teknisnya disembunyikan di balik "Kelola Integrasi".
 *   3. Pembayaran di kasir — empat metode manual dengan sakelar.
 *
 * Dua hal yang sengaja tidak ada di halaman utama: Server Key (tidak pernah
 * ditampilkan di mana pun) dan kartu konfigurasi DOKU yang besar. DOKU adalah
 * gateway platform yang belum aktif untuk tenant; menampilkan panelnya hanya
 * membuat pemilik kafe mengira ada sesuatu yang perlu ia isi. Yang tersisa
 * cuma satu baris kecil di kaki halaman.
 *
 * ── Perubahan tersimpan ──
 * Sakelar metode ditahan di state lokal sampai "Simpan Perubahan" ditekan
 * (`dirty state`), sedangkan tindakan bertombol sendiri (kredensial, tes
 * koneksi, konfigurasi rinci metode) langsung dikirim — masing-masing sudah
 * punya konfirmasinya sendiri, dan menunda keduanya di satu tombol akan
 * membingungkan.
 */
export default function PaymentSettingsPage() {
  const { user } = useAuth();

  const [pengaturan, setPengaturan] = useState<PengaturanPembayaranDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  /** Salinan sakelar yang sedang disunting; null berarti belum ada perubahan. */
  const [draf, setDraf] = useState<MetodePembayaranDTO[] | null>(null);

  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ nada: 'success' | 'error'; pesan: string } | null>(
    null,
  );

  const [aturMetode, setAturMetode] = useState<KodeMetode | null>(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [dialogInfo, setDialogInfo] = useState<string | null>(null);
  const [midtransOpen, setMidtransOpen] = useState(false);

  /** Menahan permintaan simpan kedua saat yang pertama masih berjalan. */
  const sedangKirim = useRef(false);

  const muat = useCallback(async (diamDiam = false) => {
    if (!diamDiam) setLoading(true);
    try {
      const data = await pembayaranApi.getSettings();
      setPengaturan(data);
      setLoadError(null);
    } catch (err) {
      setLoadError(describeApiError(err, 'Gagal memuat pengaturan pembayaran.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void muat();
  }, [muat]);

  // Toast sukses menghilang sendiri; toast galat tidak — pengguna harus sempat
  // membacanya, dan kegagalan menyimpan bukan sesuatu yang boleh lewat begitu
  // saja.
  useEffect(() => {
    if (toast?.nada !== 'success') return;
    const timer = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  const metodeTampil = draf ?? pengaturan?.metode ?? [];

  /**
   * Ada perubahan yang belum disimpan?
   *
   * Dibandingkan lapangan per lapangan dengan data server, bukan sekadar
   * "pernah menyentuh sakelar": pengguna yang menyalakan lalu mematikan lagi
   * tidak seharusnya ditahan tombol simpan yang menyala tanpa alasan.
   */
  const adaPerubahan = useMemo(() => {
    if (!draf || !pengaturan) return false;
    return draf.some((d) => {
      const asli = pengaturan.metode.find((m) => m.metode === d.metode);
      return (
        !asli ||
        asli.aktif !== d.aktif ||
        asli.tersediaDiKasir !== d.tersediaDiKasir ||
        asli.tersediaDiCheckout !== d.tersediaDiCheckout ||
        asli.wajibVerifikasiKasir !== d.wajibVerifikasiKasir
      );
    });
  }, [draf, pengaturan]);

  useUnsavedChanges(
    adaPerubahan,
    'Ada perubahan metode pembayaran yang belum disimpan. Yakin mau meninggalkan halaman ini?',
  );

  if (user && user.role !== 'OWNER') return <Navigate to="/kasir" replace />;
  if (!user) return <Navigate to="/login" replace />;

  const ubahAktif = (kode: KodeMetode, aktif: boolean) => {
    setDraf((prev) =>
      (prev ?? pengaturan?.metode ?? []).map((m) =>
        m.metode === kode ? { ...m, aktif } : m,
      ),
    );
    setToast(null);
  };

  const simpan = async () => {
    if (!draf || sedangKirim.current) return;
    sedangKirim.current = true;
    setSaving(true);
    setToast(null);

    const payload: MetodeAktifItem[] = draf.map((m) => ({
      metode: m.metode,
      aktif: m.aktif,
      tersediaDiKasir: m.tersediaDiKasir,
      // Metode yang dimatikan tidak boleh tetap tampil di checkout tamu.
      tersediaDiCheckout: m.aktif && m.tersediaDiCheckout,
      wajibVerifikasiKasir: m.wajibVerifikasiKasir,
    }));

    try {
      const hasil = await pembayaranApi.simpanMetode(payload);
      setPengaturan(hasil);
      // Draf dibuang HANYA setelah server menerima. Pada kegagalan, suntingan
      // pengguna tetap di layar — memaksanya mengulang dari awal karena
      // jaringan sempat putus adalah cara tercepat kehilangan kepercayaannya.
      setDraf(null);
      setToast({ nada: 'success', pesan: 'Metode pembayaran tersimpan.' });
    } catch (err) {
      setToast({
        nada: 'error',
        pesan: describeApiError(err, 'Gagal menyimpan metode pembayaran.'),
      });
    } finally {
      setSaving(false);
      sedangKirim.current = false;
    }
  };

  // ── Aksi dialog konfigurasi metode ──

  const simpanKonfigurasi = async (kode: KodeMetode, input: KonfigurasiMetodeInput) => {
    setDialogBusy(true);
    setDialogError(null);
    try {
      await pembayaranApi.simpanKonfigurasiMetode(kode, input);
      await muat(true);
      setAturMetode(null);
      setToast({ nada: 'success', pesan: 'Pengaturan metode tersimpan.' });
    } catch (err) {
      setDialogError(describeApiError(err, 'Gagal menyimpan pengaturan metode.'));
    } finally {
      setDialogBusy(false);
    }
  };

  // ── Aksi dialog Midtrans ──

  const jalankan = async (
    aksi: () => Promise<PengaturanPembayaranDTO>,
    pesanSukses: string,
  ) => {
    setDialogBusy(true);
    setDialogError(null);
    setDialogInfo(null);
    try {
      setPengaturan(await aksi());
      setDialogInfo(pesanSukses);
    } catch (err) {
      setDialogError(describeApiError(err, 'Tindakan gagal dijalankan.'));
    } finally {
      setDialogBusy(false);
    }
  };

  const tesKoneksi = async (mode: ModeMidtrans) => {
    setDialogBusy(true);
    setDialogError(null);
    setDialogInfo(null);
    try {
      const hasil = await pembayaranApi.tesKoneksi(mode);
      setPengaturan(hasil.pengaturan);
      if (hasil.berhasil) setDialogInfo(hasil.pesan);
      else setDialogError(hasil.pesan);
    } catch (err) {
      setDialogError(describeApiError(err, 'Tes koneksi gagal dijalankan.'));
    } finally {
      setDialogBusy(false);
    }
  };

  const periksaWebhook = async (mode: ModeMidtrans) => {
    setDialogBusy(true);
    setDialogError(null);
    setDialogInfo(null);
    try {
      const hasil = await pembayaranApi.statusWebhook(mode);
      await muat(true);
      setDialogInfo(
        hasil.status === 'TERVERIFIKASI'
          ? 'Webhook terverifikasi — notifikasi Midtrans sudah pernah sampai ke CafeOS.'
          : 'Belum ada notifikasi Midtrans yang masuk. Pastikan URL notifikasi sudah ditempel di dasbor Midtrans, lalu lakukan satu transaksi uji.',
      );
    } catch (err) {
      setDialogError(describeApiError(err, 'Gagal memeriksa status webhook.'));
    } finally {
      setDialogBusy(false);
    }
  };

  // ── Render ──

  const metodeDialog = aturMetode
    ? (pengaturan?.metode.find((m) => m.metode === aturMetode) ?? null)
    : null;

  const statusOnline: { nada: NadaBadge; teks: string } = !pengaturan
    ? { nada: 'abu', teks: 'Memuat…' }
    : STATUS_ONLINE[pengaturan.midtrans.statusIntegrasi];

  return (
    <AppLayout title="Pengaturan" subtitle="Metode & integrasi pembayaran kafe">
      <div className="mb-5 flex gap-1 border-b border-warm-line">
        <span className="border-b-2 border-warm-amber px-4 py-2.5 text-sm font-semibold text-warm-espresso">
          Pembayaran
        </span>
      </div>

      {loadError && (
        <div className="mb-5">
          <AlertBanner
            tone="error"
            title="Gagal memuat"
            action={{ label: 'Coba lagi', onClick: () => void muat() }}
          >
            {loadError}
          </AlertBanner>
        </div>
      )}

      {loading ? (
        <div className="grid gap-4">
          <div aria-hidden className="skeleton-warm h-20 rounded-2xl" />
          <div aria-hidden className="skeleton-warm h-40 rounded-2xl" />
          <div aria-hidden className="skeleton-warm h-72 rounded-2xl" />
          <span className="sr-only" role="status">
            Memuat pengaturan pembayaran…
          </span>
        </div>
      ) : !pengaturan ? null : (
        // Lebar dinaikkan dari `max-w-2xl` ke `max-w-5xl`: di layar desktop,
        // halaman lama menyisakan dua pertiga layar kosong sementara isinya
        // berdesakan dalam satu kolom sempit.
        <div className="max-w-5xl space-y-6 pb-28">
          {toast && (
            <AlertBanner
              tone={toast.nada === 'success' ? 'success' : 'error'}
              onClose={() => setToast(null)}
            >
              {toast.pesan}
            </AlertBanner>
          )}

          {/* ── A. Ringkasan ── */}
          <PaymentSummary pengaturan={pengaturan} />

          {/* ── B. Pembayaran online pelanggan ── */}
          <section aria-labelledby="judul-online">
            <h2 id="judul-online" className="mb-2 text-base font-bold text-warm-espresso">
              Pembayaran Online
            </h2>
            <p className="mb-3 text-sm text-warm-muted">
              Tamu membayar sendiri dari HP-nya, dan sistem yang memastikan
              uangnya masuk — tanpa kasir memeriksa apa pun.
            </p>

            <article className="rounded-2xl bg-warm-paper p-5 shadow-sm ring-1 ring-warm-line">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 items-start gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-warm-amber/15 text-warm-subtle">
                    <PaymentIcon name="online" size={22} />
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-bold text-warm-espresso">Midtrans</h3>
                    <p className="mt-0.5 text-sm text-warm-muted">
                      Pembayaran online yang diverifikasi otomatis melalui
                      Midtrans — QRIS dinamis, GoPay, Virtual Account, dan kartu.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setDialogError(null);
                    setDialogInfo(null);
                    setMidtransOpen(true);
                  }}
                  className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-warm-espresso/10 px-4 py-2.5 text-sm font-semibold text-warm-subtle transition hover:bg-warm-espresso/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-warm-amber focus-visible:ring-offset-2"
                >
                  <PaymentIcon name="sunting" size={16} />
                  Kelola Integrasi
                </button>
              </div>

              <dl className="mt-4 grid gap-x-6 gap-y-3 border-t border-warm-line pt-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-warm-muted">
                    Status
                  </dt>
                  <dd className="mt-1">
                    <StatusBadge nada={statusOnline.nada}>{statusOnline.teks}</StatusBadge>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-warm-muted">
                    Mode
                  </dt>
                  <dd className="mt-1">
                    <StatusBadge
                      nada={pengaturan.midtrans.modeAktif === 'PRODUCTION' ? 'hijau' : 'abu'}
                      ikon="shield"
                    >
                      {pengaturan.midtrans.modeAktif === 'PRODUCTION'
                        ? 'Production (uang sungguhan)'
                        : 'Sandbox (uji coba)'}
                    </StatusBadge>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-warm-muted">
                    Webhook
                  </dt>
                  <dd className="mt-1">
                    {(() => {
                      const aktif = pengaturan.midtrans.kredensial.find(
                        (k) => k.mode === pengaturan.midtrans.modeAktif,
                      );
                      const ok = aktif?.statusWebhook === 'TERVERIFIKASI';
                      return (
                        <StatusBadge nada={ok ? 'hijau' : 'kuning'}>
                          {ok ? 'Terverifikasi' : 'Belum diperiksa'}
                        </StatusBadge>
                      );
                    })()}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-warm-muted">
                    Kredensial
                  </dt>
                  <dd className="mt-1 text-sm text-warm-subtle">
                    {pengaturan.midtrans.kredensial
                      .filter((k) => k.serverKeyTersimpan)
                      .map((k) => (k.mode === 'SANDBOX' ? 'Sandbox' : 'Production'))
                      .join(' & ') || 'Belum ada'}
                  </dd>
                </div>
                <div className="sm:col-span-2 lg:col-span-1">
                  <dt className="text-xs font-semibold uppercase tracking-wide text-warm-muted">
                    Terakhir diperiksa
                  </dt>
                  <dd className="mt-1 text-sm text-warm-subtle">
                    {(() => {
                      const aktif = pengaturan.midtrans.kredensial.find(
                        (k) => k.mode === pengaturan.midtrans.modeAktif,
                      );
                      return aktif?.koneksiDiperiksa
                        ? new Date(aktif.koneksiDiperiksa).toLocaleString('id-ID', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : 'Belum pernah';
                    })()}
                  </dd>
                </div>
              </dl>
            </article>
          </section>

          {/* ── C. Pembayaran di kasir ── */}
          <section aria-labelledby="judul-kasir">
            <h2 id="judul-kasir" className="mb-2 text-base font-bold text-warm-espresso">
              Pembayaran di Kasir
            </h2>
            <p className="mb-3 text-sm text-warm-muted">
              Metode yang uangnya diterima langsung oleh kasir. Semuanya butuh
              seseorang menekan “Terima” sebelum pesanan dianggap lunas.
            </p>

            <div className="grid gap-3 lg:grid-cols-2">
              {metodeTampil.map((metode) => (
                <MethodCard
                  key={metode.metode}
                  metode={metode}
                  disabled={saving}
                  onToggle={(aktif) => ubahAktif(metode.metode, aktif)}
                  onAtur={() => {
                    setDialogError(null);
                    setAturMetode(metode.metode);
                  }}
                />
              ))}
            </div>
          </section>

          {/* ── D. DOKU — satu baris, bukan panel ── */}
          <section
            aria-label="Gateway lain"
            className="flex flex-wrap items-center gap-3 rounded-2xl bg-warm-cream/60 px-4 py-3 text-sm ring-1 ring-warm-line"
          >
            <PaymentIcon name="info" size={16} className="text-warm-muted" />
            <span className="text-warm-subtle">DOKU Checkout</span>
            <StatusBadge nada="abu" ikon={null} size="sm">
              Segera hadir
            </StatusBadge>
            <span className="text-xs text-warm-muted">
              Gateway platform — tidak ada yang perlu kamu setel.
            </span>
          </section>
        </div>
      )}

      {/* ── E. Action bar simpan ──
          DIRENDER hanya saat ada perubahan, bukan digeser keluar layar dengan
          transform. Bar yang cuma tergeser tetap ada di pohon dokumen: tombol
          "Simpan Perubahan"-nya masih bisa dijangkau Tab dan masih dibacakan
          pembaca layar, padahal tidak ada apa pun untuk disimpan. */}
      {!loading && pengaturan && adaPerubahan && (
        <div
          role="region"
          aria-label="Perubahan belum disimpan"
          className="animate-slide-up fixed inset-x-0 bottom-0 z-30 border-t border-warm-line bg-warm-paper/95 backdrop-blur md:left-[60px]"
        >
          <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
            <p className="flex items-center gap-2 text-sm text-warm-subtle">
              <PaymentIcon name="alert" size={16} className="text-amber-600" />
              Ada perubahan yang belum disimpan.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setDraf(null);
                  setToast(null);
                }}
                disabled={saving}
                className="rounded-xl bg-warm-espresso/10 px-4 py-2.5 text-sm font-semibold text-warm-subtle transition hover:bg-warm-espresso/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-warm-amber disabled:opacity-50"
              >
                Batalkan
              </button>
              <button
                type="button"
                onClick={() => void simpan()}
                disabled={saving || !adaPerubahan}
                className="inline-flex items-center gap-2 rounded-xl bg-warm-amber px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-warm-amber focus-visible:ring-offset-2 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-warm-line disabled:text-warm-muted"
              >
                {saving && (
                  <PaymentIcon name="putar" size={16} className="animate-spin" />
                )}
                {saving ? 'Menyimpan…' : 'Simpan Perubahan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {metodeDialog && (
        <MethodConfigDialog
          metode={metodeDialog}
          busy={dialogBusy}
          error={dialogError}
          onUnggahQris={(file) => pembayaranApi.unggahQris(file)}
          onSimpan={(input) => void simpanKonfigurasi(metodeDialog.metode, input)}
          onTutup={() => {
            setAturMetode(null);
            setDialogError(null);
          }}
        />
      )}

      {midtransOpen && pengaturan && (
        <MidtransDialog
          pengaturan={pengaturan}
          busy={dialogBusy}
          error={dialogError}
          info={dialogInfo}
          onSimpanKredensial={(mode, clientKey, serverKey) =>
            void jalankan(
              () =>
                pembayaranApi.simpanKredensial(mode, {
                  clientKey,
                  ...(serverKey ? { serverKey } : {}),
                }),
              // Server menguji kunci baru ke endpoint mode ini segera setelah
              // menyimpannya, dan mengembalikan pengaturan yang sudah memuat
              // hasilnya — badge di dialog ini berubah tanpa perlu refresh.
              'Kredensial tersimpan dan langsung diuji ke Midtrans. Lihat status koneksi di bawah.',
            )
          }
          onTesKoneksi={(mode) => void tesKoneksi(mode)}
          onPeriksaWebhook={(mode) => void periksaWebhook(mode)}
          onGantiMode={(mode) =>
            void jalankan(
              () => pembayaranApi.setMode(mode),
              mode === 'PRODUCTION'
                ? 'Mode Production aktif. Pembayaran tamu kini memakai uang sungguhan.'
                : 'Kembali ke mode Sandbox. Pembayaran tamu memakai uang uji coba.',
            )
          }
          onPutuskan={(mode) =>
            void jalankan(
              () => pembayaranApi.putusKredensial(mode),
              'Integrasi diputus. Kredensialnya sudah dihapus dari CafeOS.',
            )
          }
          onTutup={() => {
            setMidtransOpen(false);
            setDialogError(null);
            setDialogInfo(null);
          }}
        />
      )}
    </AppLayout>
  );
}
