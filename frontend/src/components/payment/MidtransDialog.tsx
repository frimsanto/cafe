import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type {
  KredensialMidtransDTO,
  ModeMidtrans,
  PengaturanPembayaranDTO,
} from '../../types/api';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import ModalScrollArea from '../common/ModalScrollArea';
import PaymentIcon from './PaymentIcon';
import StatusBadge, { type NadaBadge } from './StatusBadge';
import CopyField from './CopyField';

interface MidtransDialogProps {
  pengaturan: PengaturanPembayaranDTO;
  busy: boolean;
  error: string | null;
  info: string | null;
  onSimpanKredensial: (mode: ModeMidtrans, clientKey: string, serverKey: string) => void;
  onTesKoneksi: (mode: ModeMidtrans) => void;
  onPeriksaWebhook: (mode: ModeMidtrans) => void;
  onGantiMode: (mode: ModeMidtrans) => void;
  onPutuskan: (mode: ModeMidtrans) => void;
  onTutup: () => void;
}

const KELAS_INPUT =
  'w-full rounded-xl border-0 bg-warm-cream px-3.5 py-2.5 font-mono text-sm text-warm-espresso ring-1 ring-warm-line placeholder:font-sans placeholder:text-warm-muted/70 focus:outline-none focus:ring-2 focus:ring-warm-amber';

/** Istilah teknis + penjelasannya, dipasang sebagai `<details>` ringkas. */
function Bantuan({ judul, children }: { judul: string; children: React.ReactNode }) {
  return (
    <details className="group rounded-xl bg-warm-cream/70 px-3.5 py-2.5 ring-1 ring-warm-line">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-semibold text-warm-subtle marker:content-none focus:outline-none focus-visible:ring-2 focus-visible:ring-warm-amber">
        <PaymentIcon name="info" size={14} />
        {judul}
      </summary>
      <div className="mt-2 text-xs leading-relaxed text-warm-muted">{children}</div>
    </details>
  );
}

/**
 * Badge kredensial — SATU keadaan, satu kalimat.
 *
 * Dulu badge ini cuma membaca "kolomnya terisi", sehingga layar bisa memajang
 * "Kredensial tersimpan" berwarna hijau tepat di sebelah pesan "kredensial
 * tersimpan tidak bisa dibaca". Sekarang keempat keadaannya terpisah, dan
 * masing-masing menyiratkan tindakan yang berbeda.
 */
function badgeKredensial(k: KredensialMidtransDTO): { nada: NadaBadge; teks: string } {
  switch (k.statusKredensial) {
    case 'TERSIMPAN':
      return { nada: 'hijau', teks: 'Kredensial tersimpan' };
    case 'PERLU_DIMASUKKAN_ULANG':
      return { nada: 'merah', teks: 'Kredensial perlu dimasukkan ulang' };
    case 'KONFIGURASI_SERVER':
      return { nada: 'merah', teks: 'Server belum siap membaca kredensial' };
    default:
      return { nada: 'abu', teks: 'Belum dikonfigurasi' };
  }
}

/** Terjemahkan keadaan koneksi & webhook menjadi badge. */
function badgeKoneksi(k: KredensialMidtransDTO): { nada: NadaBadge; teks: string } {
  // Kredensial yang tak terbaca membuat hasil tes lama tidak bermakna lagi:
  // yang diuji waktu itu adalah kunci yang sekarang tidak bisa dibuka.
  if (k.statusKredensial === 'PERLU_DIMASUKKAN_ULANG') {
    return { nada: 'abu', teks: 'Belum diuji' };
  }
  if (k.statusKredensial === 'KONFIGURASI_SERVER') {
    return { nada: 'abu', teks: 'Belum diuji' };
  }
  if (k.statusKoneksi === 'BERHASIL') return { nada: 'hijau', teks: 'Koneksi berhasil' };
  if (k.statusKoneksi === 'GAGAL') return { nada: 'merah', teks: 'Koneksi gagal' };
  if (k.serverKeyTersimpan) return { nada: 'kuning', teks: 'Belum diuji' };
  return { nada: 'abu', teks: 'Belum dikonfigurasi' };
}

function badgeWebhook(k: KredensialMidtransDTO): { nada: NadaBadge; teks: string } {
  if (k.statusWebhook === 'TERVERIFIKASI') {
    return { nada: 'hijau', teks: 'Webhook terverifikasi' };
  }
  return { nada: 'kuning', teks: 'Webhook belum diperiksa' };
}

function waktuSingkat(iso: string | null): string {
  if (!iso) return 'belum pernah';
  return new Date(iso).toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Dialog "Kelola Integrasi" Midtrans.
 *
 * Semua isian teknis tinggal DI SINI, bukan di halaman utama. Pemilik kafe yang
 * cuma ingin menyalakan tunai tidak perlu berpapasan dengan Server Key.
 *
 * Dua mode dipisah menjadi dua tab, masing-masing dengan kredensial dan
 * statusnya sendiri. Itu bukan sekadar tata letak: sebelumnya keduanya berbagi
 * satu pasang kunci, sehingga menekan "Production" memakai kunci Sandbox yang
 * sudah tersimpan — dan pemiliknya tidak punya cara melihat bahwa itulah yang
 * terjadi.
 *
 * Server Key tidak pernah ditampilkan. Kolomnya selalu kosong saat dibuka;
 * mengisinya berarti MENGGANTI, membiarkannya berarti memakai yang lama.
 */
export default function MidtransDialog({
  pengaturan,
  busy,
  error,
  info,
  onSimpanKredensial,
  onTesKoneksi,
  onPeriksaWebhook,
  onGantiMode,
  onPutuskan,
  onTutup,
}: MidtransDialogProps) {
  const { midtrans } = pengaturan;
  const [tab, setTab] = useState<ModeMidtrans>(midtrans.modeAktif);
  const [serverKey, setServerKey] = useState('');
  const [clientKey, setClientKey] = useState('');
  const [konfirmasiProduction, setKonfirmasiProduction] = useState(false);
  const [konfirmasiPutus, setKonfirmasiPutus] = useState(false);

  const idServer = useId();
  const idClient = useId();
  const tutupRef = useRef<HTMLButtonElement>(null);

  useBodyScrollLock();

  useEffect(() => {
    tutupRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onTutup();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onTutup]);

  const kredensial = useMemo(
    () => midtrans.kredensial.find((k) => k.mode === tab),
    [midtrans.kredensial, tab],
  );

  // Berpindah tab mengosongkan kolom: kunci yang telanjur diketik untuk Sandbox
  // tidak boleh ikut terbawa ke slot Production.
  useEffect(() => {
    setServerKey('');
    setClientKey(kredensial?.clientKey ?? '');
    setKonfirmasiPutus(false);
  }, [tab, kredensial?.clientKey]);

  if (!kredensial) return null;

  const statusKredensial = badgeKredensial(kredensial);
  const koneksi = badgeKoneksi(kredensial);
  const webhook = badgeWebhook(kredensial);
  const modeAktif = midtrans.modeAktif === tab;
  const perluServerKeyBaru = !kredensial.serverKeyTersimpan;
  // Tanpa Server Key lama yang terpakai, mengubah Client Key saja tidak cukup:
  // servernya akan menolak simpanan yang tidak membawa Server Key.
  const bisaSimpan =
    serverKey.trim() !== '' ||
    (!perluServerKeyBaru && clientKey.trim() !== (kredensial.clientKey ?? ''));

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-hidden bg-warm-espresso/40 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="midtrans-title"
    >
      <button
        type="button"
        aria-label="Tutup"
        onClick={onTutup}
        className="absolute inset-0 cursor-default"
      />

      <div className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-warm-paper shadow-2xl sm:rounded-3xl">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-warm-line px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warm-amber/15 text-warm-subtle">
              <PaymentIcon name="online" size={20} />
            </span>
            <div className="min-w-0">
              <h2 id="midtrans-title" className="font-bold text-warm-espresso">
                Kelola Integrasi Midtrans
              </h2>
              <p className="text-xs text-warm-muted">
                Pembayaran online yang diverifikasi otomatis.
              </p>
            </div>
          </div>
          <button
            ref={tutupRef}
            type="button"
            onClick={onTutup}
            aria-label="Tutup"
            className="shrink-0 rounded-full p-1.5 text-warm-muted transition hover:bg-warm-espresso/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-warm-amber"
          >
            <PaymentIcon name="x" />
          </button>
        </header>

        {/* Tab mode */}
        <div
          role="tablist"
          aria-label="Mode Midtrans"
          className="flex shrink-0 gap-1 border-b border-warm-line px-5"
        >
          {(['SANDBOX', 'PRODUCTION'] as ModeMidtrans[]).map((mode) => (
            <button
              key={mode}
              role="tab"
              type="button"
              aria-selected={tab === mode}
              onClick={() => setTab(mode)}
              className={`relative -mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus-visible:ring-2 focus-visible:ring-warm-amber ${
                tab === mode
                  ? 'border-warm-amber text-warm-espresso'
                  : 'border-transparent text-warm-muted hover:text-warm-subtle'
              }`}
            >
              {mode === 'SANDBOX' ? 'Sandbox' : 'Production'}
              {midtrans.modeAktif === mode && (
                <span className="ml-2 rounded-full bg-warm-success/15 px-1.5 py-0.5 text-[10px] font-bold text-warm-success">
                  AKTIF
                </span>
              )}
            </button>
          ))}
        </div>

        <ModalScrollArea className="space-y-5 px-5 py-5">
          {error && (
            <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">
              {error}
            </p>
          )}
          {info && !error && (
            <p role="status" className="rounded-xl bg-warm-success/10 px-4 py-3 text-sm text-warm-success">
              {info}
            </p>
          )}

          {/* ── Ringkasan status mode ini ── */}
          <div className="flex flex-wrap gap-2">
            <StatusBadge nada={statusKredensial.nada}>{statusKredensial.teks}</StatusBadge>
            <StatusBadge nada={koneksi.nada}>{koneksi.teks}</StatusBadge>
            <StatusBadge nada={webhook.nada}>{webhook.teks}</StatusBadge>
          </div>

          {/* Kredensial ada tapi tak terbaca: katakan apa yang harus dilakukan,
              dan siapa yang harus melakukannya. Dua sebab, dua alamat. */}
          {kredensial.masalahKonfigurasiServer && (
            <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">
              Server CafeOS belum bisa membaca kredensial yang tersimpan karena
              kunci enkripsinya tidak tersedia. Ini pengaturan server, bukan
              kunci Midtrans-mu — <strong>jangan masukkan ulang Server Key</strong>{' '}
              sebelum pengelola server memperbaikinya.
            </p>
          )}
          {kredensial.perluDimasukkanUlang && (
            <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">
              Kredensial {tab === 'SANDBOX' ? 'Sandbox' : 'Production'} yang
              tersimpan tidak bisa dibaca lagi, jadi ia tidak dipakai untuk
              apa pun. Salin ulang Server Key dari dasbor Midtrans (Settings →
              Access Keys) lalu simpan di bawah.
            </p>
          )}

          <dl className="grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
            <div className="flex justify-between gap-3 sm:block">
              <dt className="text-warm-muted">Terakhir diuji</dt>
              <dd className="font-medium text-warm-subtle">
                {waktuSingkat(kredensial.koneksiDiperiksa)}
              </dd>
            </div>
            <div className="flex justify-between gap-3 sm:block">
              <dt className="text-warm-muted">Notifikasi terakhir masuk</dt>
              <dd className="font-medium text-warm-subtle">
                {waktuSingkat(kredensial.webhookDiperiksa)}
              </dd>
            </div>
          </dl>

          {/* Pesan tes lama disembunyikan saat kredensialnya sudah tak terbaca:
              ia menggambarkan kunci yang sekarang tidak dipakai lagi. */}
          {kredensial.koneksiPesan && kredensial.statusKredensial !== 'PERLU_DIMASUKKAN_ULANG' &&
            kredensial.statusKredensial !== 'KONFIGURASI_SERVER' && (
            <p
              className={`rounded-xl px-3.5 py-2.5 text-xs ${
                kredensial.statusKoneksi === 'GAGAL'
                  ? 'bg-rose-50 text-rose-800'
                  : 'bg-warm-cream text-warm-subtle'
              }`}
            >
              {kredensial.koneksiPesan}
            </p>
          )}

          {/* ── Kredensial ── */}
          <section className="space-y-4 border-t border-warm-line pt-5">
            <h3 className="text-sm font-bold text-warm-espresso">
              Kredensial {tab === 'SANDBOX' ? 'Sandbox' : 'Production'}
            </h3>

            <div>
              <label htmlFor={idClient} className="mb-1.5 block text-sm font-medium text-warm-subtle">
                Client Key
              </label>
              <input
                id={idClient}
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={clientKey}
                onChange={(e) => setClientKey(e.target.value)}
                placeholder="Mid-client-xxxxxxxx"
                className={KELAS_INPUT}
              />
              <Bantuan judul="Apa itu Client Key?">
                Kunci yang dipakai halaman pembayaran di HP tamu untuk membuka
                layar Midtrans. Sifatnya publik — memang terlihat di peramban —
                jadi aman disimpan apa adanya. Ambil di dasbor Midtrans →
                Settings → Access Keys, pada tab{' '}
                <strong>{tab === 'SANDBOX' ? 'Sandbox' : 'Production'}</strong>.
                Sebagian akun Sandbox memberi kunci berawalan <code>SB-</code>{' '}
                dan sebagian tidak — keduanya sama-sama benar. Tempel apa adanya.
              </Bantuan>
            </div>

            <div>
              <label htmlFor={idServer} className="mb-1.5 block text-sm font-medium text-warm-subtle">
                Server Key
                {kredensial.serverKeyTersimpan && (
                  <span className="ml-1.5 font-normal text-warm-muted">
                    (tersimpan ····{kredensial.serverKeyPetunjuk} — isi untuk mengganti)
                  </span>
                )}
              </label>
              <input
                id={idServer}
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={serverKey}
                onChange={(e) => setServerKey(e.target.value)}
                placeholder={
                  kredensial.serverKeyTersimpan
                    ? '•••••••••••••• (tersimpan)'
                    : 'Mid-server-xxxxxxxx'
                }
                className={KELAS_INPUT}
              />
              <Bantuan judul="Apa itu Server Key, dan kenapa tidak pernah ditampilkan?">
                Kunci RAHASIA yang mewakili akun Midtrans kafemu. Siapa pun yang
                memilikinya bisa membuat dan membatalkan transaksi atas namamu.
                CafeOS menyimpannya dalam bentuk terenkripsi dan tidak pernah
                mengirimkannya kembali ke layar mana pun — termasuk layar ini.
                Kalau kuncinya hilang, buat yang baru di dasbor Midtrans lalu
                tempel di sini.
              </Bantuan>
            </div>

            <button
              type="button"
              disabled={busy || !bisaSimpan}
              onClick={() => onSimpanKredensial(tab, clientKey.trim(), serverKey.trim())}
              className="w-full rounded-2xl bg-warm-amber py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-warm-amber focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-warm-line disabled:text-warm-muted"
            >
              {busy
                ? 'Menyimpan…'
                : perluServerKeyBaru
                  ? 'Simpan Kredensial'
                  : 'Ganti Kredensial'}
            </button>
          </section>

          {/* ── Pemeriksaan ── */}
          <section className="space-y-3 border-t border-warm-line pt-5">
            <h3 className="text-sm font-bold text-warm-espresso">Pemeriksaan</h3>

            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                disabled={busy || !kredensial.serverKeyTersimpan}
                onClick={() => onTesKoneksi(tab)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-warm-espresso/10 px-4 py-2.5 text-sm font-semibold text-warm-subtle transition hover:bg-warm-espresso/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-warm-amber disabled:cursor-not-allowed disabled:opacity-50"
              >
                <PaymentIcon name="putar" size={16} />
                Tes Koneksi
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => onPeriksaWebhook(tab)}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-warm-espresso/10 px-4 py-2.5 text-sm font-semibold text-warm-subtle transition hover:bg-warm-espresso/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-warm-amber disabled:cursor-not-allowed disabled:opacity-50"
              >
                <PaymentIcon name="shield" size={16} />
                Periksa Webhook
              </button>
            </div>

            <CopyField
              label="URL Notifikasi (Payment Notification URL)"
              value={midtrans.webhookUrl}
              hint="Tempel di dasbor Midtrans → Settings → Configuration. Webhook baru berstatus terverifikasi setelah notifikasi sungguhan pertama masuk ke sini."
            />

            <Bantuan judul="Apa itu webhook / URL notifikasi?">
              Alamat yang dipanggil server Midtrans untuk memberi tahu CafeOS
              bahwa sebuah pembayaran berhasil. Tanpa itu, pesanan yang sudah
              dibayar tamu bisa tidak pernah masuk ke dapur. CafeOS memeriksa
              tanda tangan setiap notifikasi, jadi orang lain tidak bisa
              mengarang notifikasi palsu ke alamat ini.
            </Bantuan>
          </section>

          {/* ── Mode aktif ── */}
          <section className="space-y-3 border-t border-warm-line pt-5">
            <h3 className="text-sm font-bold text-warm-espresso">Mode pembayaran kafe</h3>
            <p className="text-xs text-warm-muted">
              Sandbox memakai uang mainan untuk uji coba. Production memakai uang
              sungguhan dari rekening tamu.
            </p>

            {midtrans.modeAktif === 'PRODUCTION' ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-warm-success/10 px-4 py-3">
                <p className="text-sm font-medium text-warm-success">
                  Kafe ini menerima pembayaran Production.
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onGantiMode('SANDBOX')}
                  className="rounded-xl bg-warm-espresso/10 px-3.5 py-2 text-xs font-semibold text-warm-subtle transition hover:bg-warm-espresso/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-warm-amber disabled:opacity-50"
                >
                  Kembali ke Sandbox
                </button>
              </div>
            ) : midtrans.penghalangProduction.length > 0 ? (
              <div className="rounded-xl bg-amber-50 px-4 py-3 ring-1 ring-amber-200">
                <p className="text-sm font-medium text-amber-900">
                  Belum bisa mengaktifkan pembayaran Production:
                </p>
                <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-xs text-amber-800">
                  {midtrans.penghalangProduction.map((halangan) => (
                    <li key={halangan}>{halangan}</li>
                  ))}
                </ul>
              </div>
            ) : konfirmasiProduction ? (
              // Konfirmasi ditampilkan DI TEMPAT, bukan lewat `window.confirm`:
              // yang perlu dibaca pemilik adalah daftar akibatnya, dan dialog
              // bawaan peramban tidak bisa memuat itu dengan layak.
              <div className="rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200">
                <p className="flex items-start gap-2 text-sm font-bold text-amber-900">
                  <PaymentIcon name="alert" size={16} className="mt-0.5 shrink-0" />
                  Aktifkan pembayaran dengan uang sungguhan?
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-amber-800">
                  Setelah ini, setiap pembayaran tamu memotong saldo rekening
                  atau kartu mereka betulan, dan dananya masuk ke akun Midtrans
                  Production kafemu. Pastikan kamu sudah mencoba satu transaksi
                  di Sandbox sampai berhasil.
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setKonfirmasiProduction(false)}
                    className="flex-1 rounded-xl bg-white/70 px-3.5 py-2 text-xs font-semibold text-amber-900 transition hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
                  >
                    Batal
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setKonfirmasiProduction(false);
                      onGantiMode('PRODUCTION');
                    }}
                    className="flex-1 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-amber-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2 disabled:opacity-50"
                  >
                    Ya, aktifkan Production
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={() => setKonfirmasiProduction(true)}
                className="w-full rounded-2xl bg-warm-espresso px-4 py-2.5 text-sm font-semibold text-warm-paper transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-warm-amber focus-visible:ring-offset-2 disabled:opacity-50"
              >
                Aktifkan Pembayaran Production
              </button>
            )}
          </section>

          {/* ── Putuskan integrasi ── */}
          {kredensial.serverKeyTersimpan && (
            <section className="border-t border-warm-line pt-5">
              {konfirmasiPutus ? (
                <div className="rounded-xl bg-rose-50 p-4 ring-1 ring-rose-200">
                  <p className="text-sm font-bold text-rose-900">
                    Putuskan integrasi {tab === 'SANDBOX' ? 'Sandbox' : 'Production'}?
                  </p>
                  <p className="mt-1.5 text-xs leading-relaxed text-rose-800">
                    Kredensialnya dihapus dari CafeOS.
                    {modeAktif &&
                      ' Karena ini mode yang sedang aktif, tamu tidak akan bisa membayar online sampai kamu memasukkannya lagi.'}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setKonfirmasiPutus(false)}
                      className="flex-1 rounded-xl bg-white/70 px-3.5 py-2 text-xs font-semibold text-rose-900 transition hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setKonfirmasiPutus(false);
                        onPutuskan(tab);
                      }}
                      className="flex-1 rounded-xl bg-rose-600 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-rose-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 disabled:opacity-50"
                    >
                      Ya, putuskan
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setKonfirmasiPutus(true)}
                  className="text-sm font-semibold text-rose-700 underline-offset-2 transition hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:opacity-50"
                >
                  Putuskan Integrasi {tab === 'SANDBOX' ? 'Sandbox' : 'Production'}
                </button>
              )}
            </section>
          )}
        </ModalScrollArea>
      </div>
    </div>
  );
}
