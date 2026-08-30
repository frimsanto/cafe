import { useEffect, useId, useRef, useState } from 'react';
import type { MetodePembayaranDTO } from '../../types/api';
import type { KonfigurasiMetodeInput } from '../../api/pembayaran';
import { metodeInfo } from '../../data/paymentMethods';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import ModalScrollArea from '../common/ModalScrollArea';
import Switch from '../common/Switch';
import PaymentIcon from './PaymentIcon';

interface MethodConfigDialogProps {
  metode: MetodePembayaranDTO;
  busy: boolean;
  error: string | null;
  /** Unggah gambar QRIS; mengembalikan URL & public id hasil unggahan. */
  onUnggahQris: (file: File) => Promise<{ url: string; publicId: string }>;
  onSimpan: (input: KonfigurasiMetodeInput) => void;
  onTutup: () => void;
}

const KELAS_INPUT =
  'w-full rounded-xl border-0 bg-warm-cream px-3.5 py-2.5 text-sm text-warm-espresso ring-1 ring-warm-line placeholder:text-warm-muted/70 focus:outline-none focus:ring-2 focus:ring-warm-amber';

/** Baris label + isian, dengan teks bantuan opsional. */
function Kolom({
  label,
  hint,
  wajib,
  children,
}: {
  label: string;
  hint?: string;
  wajib?: boolean;
  children: (id: string) => React.ReactNode;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-warm-subtle">
        {label}
        {wajib && <span className="ml-1 text-rose-600">*</span>}
      </label>
      {children(id)}
      {hint && <p className="mt-1.5 text-xs text-warm-muted">{hint}</p>}
    </div>
  );
}

/**
 * Dialog pengaturan rinci satu metode pembayaran manual.
 *
 * Isinya berbeda per metode, dan itulah alasan dialog ini ada: menaruh gambar
 * QRIS, nomor rekening, dan label terminal EDC sekaligus di halaman utama
 * membuat halaman itu jadi formulir panjang yang menakutkan pemilik kafe,
 * padahal sebagian besar waktu ia cuma ingin menyalakan atau mematikan sesuatu.
 *
 * Satu aturan ditegakkan langsung di layar (dan diulang di server): metode
 * yang ditawarkan ke pelanggan di checkout WAJIB diverifikasi kasir. Sakelar
 * verifikasinya ikut mati dan terkunci begitu checkout dinyalakan, supaya
 * kombinasi "tamu bayar sendiri, langsung lunas, tanpa ada yang memeriksa"
 * tidak pernah bisa dipilih.
 */
export default function MethodConfigDialog({
  metode,
  busy,
  error,
  onUnggahQris,
  onSimpan,
  onTutup,
}: MethodConfigDialogProps) {
  const info = metodeInfo(metode.metode);

  const [tersediaDiKasir, setTersediaDiKasir] = useState(metode.tersediaDiKasir);
  const [tersediaDiCheckout, setTersediaDiCheckout] = useState(metode.tersediaDiCheckout);
  const [wajibVerifikasi, setWajibVerifikasi] = useState(metode.wajibVerifikasiKasir);
  const [instruksi, setInstruksi] = useState(metode.instruksi ?? '');

  const [qrisUrl, setQrisUrl] = useState(metode.qrisImageUrl ?? '');
  const [qrisPublicId, setQrisPublicId] = useState<string | null>(null);
  const [merchant, setMerchant] = useState(metode.qrisMerchantName ?? '');
  const [nmid, setNmid] = useState(metode.qrisNmid ?? '');
  const [mengunggah, setMengunggah] = useState(false);
  const [galatUnggah, setGalatUnggah] = useState<string | null>(null);

  const [bankNama, setBankNama] = useState(metode.bankNama ?? '');
  const [bankRek, setBankRek] = useState(metode.bankNomorRekening ?? '');
  const [bankAtasNama, setBankAtasNama] = useState(metode.bankAtasNama ?? '');
  const [batasWaktu, setBatasWaktu] = useState(
    metode.batasWaktuMenit === null ? '' : String(metode.batasWaktuMenit),
  );

  const [edcProvider, setEdcProvider] = useState(metode.edcProvider ?? '');
  const [edcTerminal, setEdcTerminal] = useState(metode.edcTerminalLabel ?? '');

  const berkasRef = useRef<HTMLInputElement>(null);
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

  const pilihBerkas = async (file: File) => {
    setGalatUnggah(null);
    setMengunggah(true);
    try {
      const hasil = await onUnggahQris(file);
      setQrisUrl(hasil.url);
      setQrisPublicId(hasil.publicId);
    } catch (err) {
      setGalatUnggah(
        err instanceof Error ? err.message : 'Gambar QRIS gagal diunggah. Coba lagi.',
      );
    } finally {
      setMengunggah(false);
      // Kosongkan agar memilih berkas yang SAMA lagi tetap memicu `onChange`.
      if (berkasRef.current) berkasRef.current.value = '';
    }
  };

  /** Checkout dinyalakan → verifikasi kasir ikut wajib, dan tidak bisa dimatikan. */
  const ubahCheckout = (nilai: boolean) => {
    setTersediaDiCheckout(nilai);
    if (nilai) setWajibVerifikasi(true);
  };

  const simpan = () => {
    const menit = batasWaktu.trim() === '' ? null : Number(batasWaktu);
    onSimpan({
      tersediaDiKasir,
      tersediaDiCheckout,
      wajibVerifikasiKasir: tersediaDiCheckout ? true : wajibVerifikasi,
      instruksi: instruksi.trim() || null,
      ...(metode.metode === 'QRIS_STATIS' && {
        qrisImageUrl: qrisUrl || null,
        ...(qrisPublicId ? { qrisImagePublicId: qrisPublicId } : {}),
        qrisMerchantName: merchant.trim() || null,
        qrisNmid: nmid.trim() || null,
      }),
      ...(metode.metode === 'TRANSFER' && {
        bankNama: bankNama.trim() || null,
        bankNomorRekening: bankRek.trim() || null,
        bankAtasNama: bankAtasNama.trim() || null,
        batasWaktuMenit: menit !== null && Number.isFinite(menit) ? menit : null,
      }),
      ...(metode.metode === 'EDC' && {
        edcProvider: edcProvider.trim() || null,
        edcTerminalLabel: edcTerminal.trim() || null,
      }),
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-hidden bg-warm-espresso/40 backdrop-blur-sm sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="atur-metode-title"
    >
      <button
        type="button"
        aria-label="Tutup"
        onClick={onTutup}
        className="absolute inset-0 cursor-default"
      />

      <div className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-warm-paper shadow-2xl sm:rounded-3xl">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-warm-line px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-warm-amber/15 text-warm-subtle">
              <PaymentIcon name={info?.icon ?? 'tunai'} size={20} />
            </span>
            <div className="min-w-0">
              <h2 id="atur-metode-title" className="font-bold text-warm-espresso">
                Atur {info?.name ?? metode.metode}
              </h2>
              <p className="truncate text-xs text-warm-muted">{info?.description}</p>
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

        <ModalScrollArea className="space-y-5 px-5 py-5">
          {error && (
            <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800">
              {error}
            </p>
          )}

          {/* ── QRIS statis ── */}
          {metode.metode === 'QRIS_STATIS' && (
            <>
              <div>
                <span className="mb-1.5 block text-sm font-medium text-warm-subtle">
                  Gambar QRIS <span className="text-rose-600">*</span>
                </span>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  <div className="flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-warm-cream ring-1 ring-warm-line">
                    {qrisUrl ? (
                      <img
                        src={qrisUrl}
                        alt="Pratinjau QRIS statis kafe"
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <PaymentIcon name="qris" size={36} className="text-warm-muted" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <input
                      ref={berkasRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="sr-only"
                      id="unggah-qris"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void pilihBerkas(file);
                      }}
                    />
                    <label
                      htmlFor="unggah-qris"
                      className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-warm-espresso/10 px-4 py-2.5 text-sm font-semibold text-warm-subtle transition hover:bg-warm-espresso/20 focus-within:ring-2 focus-within:ring-warm-amber"
                    >
                      <PaymentIcon name="unggah" size={16} />
                      {mengunggah
                        ? 'Mengunggah…'
                        : qrisUrl
                          ? 'Ganti gambar'
                          : 'Pilih gambar'}
                    </label>
                    <p className="mt-2 text-xs text-warm-muted">
                      JPG, PNG, atau WEBP · maksimal 5 MB. Foto stiker QRIS di
                      kasir sudah cukup — pastikan seluruh kode terlihat dan
                      tidak buram.
                    </p>
                    {galatUnggah && (
                      <p role="alert" className="mt-2 text-xs font-medium text-rose-700">
                        {galatUnggah}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <Kolom label="Nama merchant" wajib hint="Nama yang muncul di aplikasi tamu saat memindai.">
                {(id) => (
                  <input
                    id={id}
                    type="text"
                    value={merchant}
                    onChange={(e) => setMerchant(e.target.value)}
                    placeholder="mis. Kopi Senja"
                    className={KELAS_INPUT}
                  />
                )}
              </Kolom>

              <Kolom label="NMID (opsional)" hint="Nomor identitas merchant QRIS, tertera di stiker.">
                {(id) => (
                  <input
                    id={id}
                    type="text"
                    value={nmid}
                    onChange={(e) => setNmid(e.target.value)}
                    placeholder="ID1020012345678"
                    className={KELAS_INPUT}
                  />
                )}
              </Kolom>
            </>
          )}

          {/* ── Transfer bank ── */}
          {metode.metode === 'TRANSFER' && (
            <>
              <Kolom label="Nama bank" wajib>
                {(id) => (
                  <input
                    id={id}
                    type="text"
                    value={bankNama}
                    onChange={(e) => setBankNama(e.target.value)}
                    placeholder="mis. BCA"
                    className={KELAS_INPUT}
                  />
                )}
              </Kolom>

              <Kolom label="Nomor rekening" wajib>
                {(id) => (
                  <input
                    id={id}
                    type="text"
                    inputMode="numeric"
                    value={bankRek}
                    onChange={(e) => setBankRek(e.target.value)}
                    placeholder="1234567890"
                    className={`${KELAS_INPUT} font-mono tabular-nums`}
                  />
                )}
              </Kolom>

              <Kolom label="Atas nama" wajib>
                {(id) => (
                  <input
                    id={id}
                    type="text"
                    value={bankAtasNama}
                    onChange={(e) => setBankAtasNama(e.target.value)}
                    placeholder="mis. PT Kopi Senja"
                    className={KELAS_INPUT}
                  />
                )}
              </Kolom>

              <Kolom
                label="Batas waktu pembayaran (menit)"
                hint="Kosongkan bila tidak ada batas. Minimal 5 menit."
              >
                {(id) => (
                  <input
                    id={id}
                    type="number"
                    min={5}
                    value={batasWaktu}
                    onChange={(e) => setBatasWaktu(e.target.value)}
                    placeholder="60"
                    className={`${KELAS_INPUT} tabular-nums`}
                  />
                )}
              </Kolom>
            </>
          )}

          {/* ── EDC ── */}
          {metode.metode === 'EDC' && (
            <>
              <Kolom label="Bank / provider EDC (opsional)">
                {(id) => (
                  <input
                    id={id}
                    type="text"
                    value={edcProvider}
                    onChange={(e) => setEdcProvider(e.target.value)}
                    placeholder="mis. BCA"
                    className={KELAS_INPUT}
                  />
                )}
              </Kolom>

              <Kolom label="Label mesin / terminal (opsional)" hint="Membantu mencocokkan struk EDC dengan mesinnya.">
                {(id) => (
                  <input
                    id={id}
                    type="text"
                    value={edcTerminal}
                    onChange={(e) => setEdcTerminal(e.target.value)}
                    placeholder="mis. EDC Kasir 1"
                    className={KELAS_INPUT}
                  />
                )}
              </Kolom>
            </>
          )}

          <Kolom
            label="Instruksi pembayaran (opsional)"
            hint="Ditampilkan ke tamu dan kasir saat metode ini dipilih."
          >
            {(id) => (
              <textarea
                id={id}
                rows={3}
                value={instruksi}
                onChange={(e) => setInstruksi(e.target.value)}
                placeholder="mis. Tunjukkan bukti transfer ke kasir sebelum pesanan dibuat."
                className={`${KELAS_INPUT} resize-y`}
              />
            )}
          </Kolom>

          {/* ── Ketersediaan ── */}
          <fieldset className="rounded-2xl bg-warm-cream p-4 ring-1 ring-warm-line">
            <legend className="px-1 text-sm font-semibold text-warm-espresso">
              Tersedia di mana
            </legend>

            <div className="mt-2 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-warm-espresso">Kasir</p>
                  <p className="text-xs text-warm-muted">
                    Muncul di layar kasir saat menagih pesanan.
                  </p>
                </div>
                <Switch
                  checked={tersediaDiKasir}
                  onChange={setTersediaDiKasir}
                  label="Tersedia di kasir"
                />
              </div>

              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-warm-espresso">
                    Checkout pelanggan
                  </p>
                  <p className="text-xs text-warm-muted">
                    {metode.bolehDiCheckout
                      ? 'Tamu bisa memilihnya sendiri di HP. Pesanannya menunggu verifikasi kasir.'
                      : 'Metode ini butuh kasir yang hadir, jadi tidak bisa dipakai tamu sendiri.'}
                  </p>
                </div>
                <Switch
                  checked={tersediaDiCheckout}
                  onChange={ubahCheckout}
                  disabled={!metode.bolehDiCheckout}
                  label="Tersedia di checkout pelanggan"
                />
              </div>

              <div className="flex items-start justify-between gap-3 border-t border-warm-line pt-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-warm-espresso">
                    Wajib verifikasi kasir
                  </p>
                  <p className="text-xs text-warm-muted">
                    {tersediaDiCheckout
                      ? 'Terkunci menyala: metode yang tampil di checkout selalu harus diperiksa kasir.'
                      : 'Pesanan tidak dianggap lunas sebelum kasir menekan Terima.'}
                  </p>
                </div>
                <Switch
                  checked={tersediaDiCheckout ? true : wajibVerifikasi}
                  onChange={setWajibVerifikasi}
                  disabled={tersediaDiCheckout}
                  label="Wajib verifikasi kasir"
                />
              </div>
            </div>
          </fieldset>
        </ModalScrollArea>

        <footer className="flex shrink-0 gap-3 border-t border-warm-line px-5 py-4">
          <button
            type="button"
            onClick={onTutup}
            disabled={busy}
            className="flex-1 rounded-2xl bg-warm-espresso/10 py-3 font-semibold text-warm-subtle transition hover:bg-warm-espresso/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-warm-amber disabled:opacity-60"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={simpan}
            disabled={busy || mengunggah}
            className="flex-1 rounded-2xl bg-warm-amber py-3 font-semibold text-white shadow-sm transition hover:brightness-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-warm-amber focus-visible:ring-offset-2 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-warm-line disabled:text-warm-muted"
          >
            {busy ? 'Menyimpan…' : 'Simpan Pengaturan'}
          </button>
        </footer>
      </div>
    </div>
  );
}
