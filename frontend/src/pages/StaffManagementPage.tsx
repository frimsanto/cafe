import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { describeApiError } from '../lib/apiClient';
import { stafApi, perangkatApi } from '../api/staf';
import type { PerangkatDTO, StafDTO } from '../types/staf';
import { ROLE_LABEL } from '../types/auth';
import AppLayout from '../components/layout/AppLayout';
import AlertBanner from '../components/common/AlertBanner';
import ConfirmDialog from '../components/common/ConfirmDialog';
import StafFormModal from '../components/staf/StafFormModal';
import PinModal from '../components/staf/PinModal';
import PerangkatPanel from '../components/staf/PerangkatPanel';

/**
 * Manajemen Staf & Perangkat POS (pemilik).
 *
 * Dua daftar dalam satu halaman karena keduanya menjawab pertanyaan yang sama
 * dari sisi berbeda: SIAPA yang boleh menagih, dan DI MANA. Memisahkannya ke
 * dua menu akan membuat pemilik yang baru merekrut kasir harus mencari sendiri
 * bahwa terminalnya juga perlu didaftarkan.
 *
 * Yang tidak akan ditemukan di halaman ini: tombol hapus staf. Kasir yang
 * pernah memegang laci muncul di rekap shift dan laporan absensi berbulan-bulan
 * sesudahnya; menghapusnya membuat laporan itu menunjuk orang tanpa nama. Yang
 * dibutuhkan ketika seseorang berhenti bekerja adalah "tidak boleh masuk lagi",
 * dan itulah yang dilakukan sakelar Aktif.
 */
export default function StaffManagementPage() {
  const { user } = useAuth();

  const [staf, setStaf] = useState<StafDTO[]>([]);
  const [perangkat, setPerangkat] = useState<PerangkatDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [formUntuk, setFormUntuk] = useState<StafDTO | 'baru' | null>(null);
  const [pinUntuk, setPinUntuk] = useState<StafDTO | null>(null);
  const [nonaktifkan, setNonaktifkan] = useState<StafDTO | null>(null);
  const [sibuk, setSibuk] = useState(false);

  const [notice, setNotice] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  const muat = useCallback(async () => {
    setLoading(true);
    try {
      const [daftarStaf, daftarPerangkat] = await Promise.all([
        stafApi.daftar(),
        perangkatApi.daftar(),
      ]);
      setStaf(daftarStaf);
      setPerangkat(daftarPerangkat);
      setLoadError(null);
    } catch (err) {
      setLoadError(describeApiError(err, 'Gagal memuat data staf.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void muat();
  }, [muat]);

  const ringkasan = useMemo(() => {
    const aktif = staf.filter((s) => s.aktif);
    return {
      total: staf.length,
      aktif: aktif.length,
      hadir: aktif.filter((s) => s.hadirSejak).length,
      pegangLaci: aktif.filter((s) => s.shiftAktif).length,
      tanpaPin: aktif.filter((s) => !s.punyaPin).length,
      terkunci: aktif.filter((s) => s.pinTerkunci).length,
    };
  }, [staf]);

  /** Bungkus tindakan: satu tempat untuk status sibuk, pesan, dan muat ulang. */
  const jalankan = async (
    aksi: () => Promise<unknown>,
    pesanBerhasil: string,
    pesanGagal: string,
  ): Promise<boolean> => {
    setSibuk(true);
    setErrorText(null);
    try {
      await aksi();
      await muat();
      setNotice(pesanBerhasil);
      return true;
    } catch (err) {
      setErrorText(describeApiError(err, pesanGagal));
      return false;
    } finally {
      setSibuk(false);
    }
  };

  return (
    <AppLayout
      title="Manajemen Staf"
      subtitle={`Siapa yang boleh menagih di ${user?.cafeName ?? 'kafe ini'}, dan dari terminal mana.`}
      actions={
        <button
          type="button"
          onClick={() => setFormUntuk('baru')}
          className="flex items-center gap-1.5 rounded-lg bg-warm-amber px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-95"
        >
          <span aria-hidden>+</span>
          Tambah Staf
        </button>
      }
    >
      {loadError && (
        <div className="mt-4">
          <AlertBanner tone="error" action={{ label: 'Coba lagi', onClick: () => void muat() }}>
            {loadError}
          </AlertBanner>
        </div>
      )}
      {errorText && (
        <div className="mt-4">
          <AlertBanner tone="error" onClose={() => setErrorText(null)}>
            {errorText}
          </AlertBanner>
        </div>
      )}
      {notice && (
        <div className="mt-4">
          <AlertBanner tone="success" onClose={() => setNotice(null)}>
            {notice}
          </AlertBanner>
        </div>
      )}

      {/* Angka yang menuntut tindakan diletakkan berdampingan dengan angka
          biasa, supaya "tiga orang belum punya PIN" tidak perlu dicari. */}
      <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KartuAngka label="Staf aktif" nilai={ringkasan.aktif} dari={ringkasan.total} />
        <KartuAngka label="Sedang hadir" nilai={ringkasan.hadir} />
        <KartuAngka label="Memegang laci" nilai={ringkasan.pegangLaci} />
        <KartuAngka
          label="Belum punya PIN"
          nilai={ringkasan.tanpaPin}
          perluTindakan={ringkasan.tanpaPin > 0}
        />
        <KartuAngka
          label="PIN terkunci"
          nilai={ringkasan.terkunci}
          perluTindakan={ringkasan.terkunci > 0}
        />
        <KartuAngka
          label="Terminal aktif"
          nilai={perangkat.filter((p) => p.aktif).length}
        />
      </section>

      <section className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-warm-muted">
          Staf
        </h2>

        {loading ? (
          <div className="mt-3 space-y-2" aria-busy="true">
            <span className="sr-only">Memuat daftar staf…</span>
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton-warm h-20 rounded-2xl" />
            ))}
          </div>
        ) : staf.length === 0 ? (
          <div className="mt-3 flex flex-col items-center justify-center rounded-2xl border border-dashed border-warm-line bg-warm-paper/60 px-6 py-16 text-center">
            <span className="text-4xl" aria-hidden>
              👥
            </span>
            <h3 className="mt-3 text-lg font-semibold text-warm-espresso">
              Belum ada staf lain
            </h3>
            <p className="mt-1 max-w-sm text-sm text-warm-muted">
              Tambahkan kasir supaya mereka bisa membuka shift dengan PIN sendiri,
              tanpa memakai akunmu.
            </p>
          </div>
        ) : (
          <ul className="mt-3 space-y-2">
            {staf.map((s) => (
              <BarisStaf
                key={s.id}
                staf={s}
                sibuk={sibuk}
                onEdit={() => setFormUntuk(s)}
                onPin={() => setPinUntuk(s)}
                onBukaKunci={() =>
                  void jalankan(
                    () => stafApi.bukaKunciPin(s.id),
                    `PIN ${s.name} dibuka kembali.`,
                    'Gagal membuka kunci PIN.',
                  )
                }
                onUbahAktif={() => {
                  if (s.aktif) setNonaktifkan(s);
                  else
                    void jalankan(
                      () => stafApi.ubahAktif(s.id, true),
                      `${s.name} diaktifkan kembali.`,
                      'Gagal mengaktifkan staf.',
                    );
                }}
              />
            ))}
          </ul>
        )}
      </section>

      <PerangkatPanel
        perangkat={perangkat}
        loading={loading}
        sibuk={sibuk}
        onDaftarkan={(label) =>
          perangkatApi.daftarkan(label).then(async (hasil) => {
            await muat();
            return hasil;
          })
        }
        onCabut={(p) =>
          jalankan(
            () => perangkatApi.cabut(p.id),
            `Terminal "${p.label}" dicabut.`,
            'Gagal mencabut terminal.',
          )
        }
      />

      {formUntuk && (
        <StafFormModal
          staf={formUntuk === 'baru' ? null : formUntuk}
          busy={sibuk}
          onTutup={() => setFormUntuk(null)}
          onSimpan={async (body) => {
            const berhasil = await jalankan(
              () =>
                formUntuk === 'baru'
                  ? stafApi.tambah(body)
                  : stafApi.perbarui(formUntuk.id, body),
              formUntuk === 'baru' ? 'Staf baru ditambahkan.' : 'Data staf diperbarui.',
              'Gagal menyimpan data staf.',
            );
            if (berhasil) setFormUntuk(null);
          }}
        />
      )}

      {pinUntuk && (
        <PinModal
          nama={pinUntuk.name}
          sudahPunyaPin={pinUntuk.punyaPin}
          busy={sibuk}
          onTutup={() => setPinUntuk(null)}
          onSimpan={async (pin) => {
            const berhasil = await jalankan(
              () => stafApi.aturPin(pinUntuk.id, pin),
              `PIN ${pinUntuk.name} disimpan. Sampaikan langsung kepadanya — PIN tidak bisa dibaca lagi dari sini.`,
              'Gagal menyimpan PIN.',
            );
            if (berhasil) setPinUntuk(null);
          }}
        />
      )}

      {nonaktifkan && (
        <ConfirmDialog
          title={`Nonaktifkan ${nonaktifkan.name}?`}
          confirmLabel="Nonaktifkan"
          busy={sibuk}
          onCancel={() => setNonaktifkan(null)}
          onConfirm={() => {
            void jalankan(
              () => stafApi.ubahAktif(nonaktifkan.id, false),
              `${nonaktifkan.name} dinonaktifkan.`,
              'Gagal menonaktifkan staf.',
            ).then((berhasil) => {
              if (berhasil) setNonaktifkan(null);
            });
          }}
          message={
            <>
              Ia tidak bisa masuk lagi dan namanya hilang dari layar pergantian
              petugas. Seluruh riwayat transaksi, shift, dan absensinya tetap
              utuh — dan kamu bisa mengaktifkannya lagi kapan saja.
            </>
          }
        />
      )}
    </AppLayout>
  );
}

function KartuAngka({
  label,
  nilai,
  dari,
  perluTindakan,
}: {
  label: string;
  nilai: number;
  dari?: number;
  perluTindakan?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border px-3.5 py-3 ${
        perluTindakan
          ? 'border-warm-amber/40 bg-warm-amber/5'
          : 'border-warm-line bg-warm-paper/60'
      }`}
    >
      <p className="text-xs text-warm-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold text-warm-espresso">
        {nilai}
        {dari !== undefined && (
          <span className="text-sm font-normal text-warm-muted"> / {dari}</span>
        )}
      </p>
    </div>
  );
}

function BarisStaf({
  staf,
  sibuk,
  onEdit,
  onPin,
  onBukaKunci,
  onUbahAktif,
}: {
  staf: StafDTO;
  sibuk: boolean;
  onEdit: () => void;
  onPin: () => void;
  onBukaKunci: () => void;
  onUbahAktif: () => void;
}) {
  return (
    <li
      className={`rounded-2xl border border-warm-line bg-warm-paper/60 p-3.5 ${
        staf.aktif ? '' : 'opacity-60'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-warm-espresso">{staf.name}</span>
            <span className="rounded-md bg-warm-line/50 px-1.5 py-0.5 text-xs text-warm-muted">
              {ROLE_LABEL[staf.role]}
            </span>
            {!staf.aktif && (
              <span className="rounded-md bg-warm-line/50 px-1.5 py-0.5 text-xs text-warm-muted">
                Nonaktif
              </span>
            )}
            {staf.shiftAktif && (
              <span className="rounded-md bg-warm-success/15 px-1.5 py-0.5 text-xs font-medium text-warm-success">
                Memegang laci · {staf.shiftAktif.namaShift}
              </span>
            )}
            {staf.hadirSejak && !staf.shiftAktif && (
              <span className="rounded-md bg-warm-line/50 px-1.5 py-0.5 text-xs text-warm-muted">
                Hadir
              </span>
            )}
          </div>
          <p className="mt-0.5 truncate text-sm text-warm-muted">
            {staf.email}
            {staf.phone && ` · ${staf.phone}`}
          </p>

          {/* Keadaan PIN ditulis sebagai kalimat, bukan ikon: "belum punya PIN"
              berarti orang ini tidak bisa membuka shift sama sekali, dan itu
              tidak boleh hanya tersirat dari lencana abu-abu. */}
          {!staf.punyaPin ? (
            <p className="mt-1 text-xs font-medium text-warm-amber">
              Belum punya PIN — belum bisa membuka sesi di terminal.
            </p>
          ) : staf.pinTerkunci ? (
            <p className="mt-1 text-xs font-medium text-warm-amber">
              PIN terkunci karena percobaan gagal berulang.
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {staf.pinTerkunci && (
            <button
              type="button"
              disabled={sibuk}
              onClick={onBukaKunci}
              className="rounded-lg border border-warm-amber/40 px-2.5 py-1.5 text-xs font-medium text-warm-amber transition hover:bg-warm-amber/10 disabled:opacity-50"
            >
              Buka kunci
            </button>
          )}
          <button
            type="button"
            disabled={sibuk}
            onClick={onPin}
            className="rounded-lg border border-warm-line px-2.5 py-1.5 text-xs font-medium text-warm-espresso transition hover:bg-warm-line/30 disabled:opacity-50"
          >
            {staf.punyaPin ? 'Reset PIN' : 'Atur PIN'}
          </button>
          <button
            type="button"
            disabled={sibuk}
            onClick={onEdit}
            className="rounded-lg border border-warm-line px-2.5 py-1.5 text-xs font-medium text-warm-espresso transition hover:bg-warm-line/30 disabled:opacity-50"
          >
            Ubah
          </button>
          <button
            type="button"
            disabled={sibuk}
            onClick={onUbahAktif}
            className="rounded-lg border border-warm-line px-2.5 py-1.5 text-xs font-medium text-warm-muted transition hover:bg-warm-line/30 disabled:opacity-50"
          >
            {staf.aktif ? 'Nonaktifkan' : 'Aktifkan'}
          </button>
        </div>
      </div>
    </li>
  );
}
