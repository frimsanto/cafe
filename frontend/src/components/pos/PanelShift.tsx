import { useState } from 'react';
import { usePos } from '../../pos/PosSessionContext';
import { posApi } from '../../api/pos';
import { describeApiError } from '../../lib/apiClient';
import { formatRupiah, formatThousands, parseAmountInput } from '../../lib/format';
import KameraAbsensi, { type HasilFoto, type MasalahKamera } from './KameraAbsensi';
import { LABEL_STATUS_ABSENSI, jamSingkat } from './format';

/**
 * Panel "Shift Saya" — satu layar untuk seluruh perjalanan seorang kasir.
 *
 * Urutannya BUKAN pilihan tampilan melainkan aturan yang ditegakkan backend,
 * dan panel ini menampilkannya sebagai satu jalur menurun supaya kasir tidak
 * perlu menebak langkah berikutnya:
 *
 *   belum absen        → ambil foto, absen masuk
 *   sudah absen        → masukkan modal awal, buka shift
 *   shift berjalan     → rekap hidup, cash in/out, tutup shift
 *   shift ditutup      → ambil foto keluar, absen pulang
 *
 * Setiap langkah menyebutkan SYARATNYA saat belum terpenuhi, bukan sekadar
 * menonaktifkan tombol: "Absen masuk dulu sebelum membuka shift" jauh lebih
 * berguna daripada tombol abu-abu tanpa penjelasan.
 */
export default function PanelShift() {
  const { absensi, jadwalCocok, shift, segarkan, pakaiShift, pakaiAbsensi } = usePos();

  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);

  const jalankan = async (aksi: () => Promise<void>, gagal: string) => {
    setSibuk(true);
    setGalat(null);
    try {
      await aksi();
    } catch (err) {
      setGalat(describeApiError(err, gagal));
    } finally {
      setSibuk(false);
    }
  };

  const belumAbsen = absensi === null;
  const shiftBerjalan = shift?.status === 'AKTIF';

  return (
    <div className="space-y-4">
      {galat && (
        <p role="alert" className="rounded-xl bg-warm-danger/10 px-3 py-2 text-sm font-medium text-warm-danger">
          {galat}
        </p>
      )}
      {pesan && (
        <p className="rounded-xl bg-warm-success/10 px-3 py-2 text-sm font-medium text-warm-success">
          {pesan}
        </p>
      )}

      {belumAbsen ? (
        <LangkahAbsenMasuk
          sibuk={sibuk}
          jadwal={jadwalCocok}
          onSelesai={async (hasil) => {
            await jalankan(async () => {
              const baru = await posApi.absen('masuk', hasil);
              pakaiAbsensi(baru);
              setPesan(
                baru.status === 'LATE'
                  ? `Absen masuk tercatat — terlambat ${baru.terlambatMenit ?? 0} menit.`
                  : 'Absen masuk tercatat.',
              );
            }, 'Gagal mencatat absen masuk.');
          }}
        />
      ) : (
        <RingkasanAbsensi absensi={absensi} />
      )}

      {!belumAbsen && !shiftBerjalan && (
        <LangkahBukaShift
          sibuk={sibuk}
          namaJadwal={jadwalCocok[0]?.template.nama ?? null}
          scheduleId={jadwalCocok[0]?.id ?? null}
          onBuka={async (modalAwal, scheduleId, catatan) => {
            await jalankan(async () => {
              const baru = await posApi.bukaShift({ modalAwal, scheduleId, catatan });
              pakaiShift(baru);
              setPesan(`Shift "${baru.namaShift}" dibuka.`);
            }, 'Gagal membuka shift.');
          }}
        />
      )}

      {shiftBerjalan && shift && (
        <>
          <RekapShift shift={shift} />
          <PanelKas
            sibuk={sibuk}
            onCatat={async (jenis, nominal, alasan) => {
              await jalankan(async () => {
                const baru = await posApi.catatKas(shift.id, { jenis, nominal, alasan });
                pakaiShift(baru);
                setPesan(
                  `${jenis === 'MASUK' ? 'Uang masuk' : 'Uang keluar'} ${formatRupiah(
                    nominal,
                  )} dicatat.`,
                );
              }, 'Gagal mencatat pergerakan kas.');
            }}
          />
          <LangkahTutupShift
            sibuk={sibuk}
            seharusnya={shift.rekap.tunaiSeharusnya}
            onTutup={async (kasAktual, catatan) => {
              await jalankan(async () => {
                const ditutup = await posApi.tutupShift(shift.id, { kasAktual, catatan });
                pakaiShift(ditutup);
                const selisih = ditutup.rekap.selisih ?? 0;
                setPesan(
                  selisih === 0
                    ? 'Shift ditutup. Kas pas.'
                    : `Shift ditutup. Selisih ${formatRupiah(selisih)}.`,
                );
              }, 'Gagal menutup shift.');
            }}
          />
        </>
      )}

      {!belumAbsen && !shiftBerjalan && absensi && absensi.keluarPada === null && (
        <LangkahAbsenPulang
          sibuk={sibuk}
          onSelesai={async (hasil, catatan) => {
            await jalankan(async () => {
              const baru = await posApi.absen('pulang', { ...hasil, catatan });
              pakaiAbsensi(baru);
              await segarkan();
              setPesan(
                `Absen pulang tercatat. Durasi kerja ${Math.floor(
                  (baru.durasiMenit ?? 0) / 60,
                )} jam ${(baru.durasiMenit ?? 0) % 60} menit.`,
              );
            }, 'Gagal mencatat absen pulang.');
          }}
        />
      )}
    </div>
  );
}

// ── Absen masuk ──────────────────────────────────────────────────────────────

function LangkahAbsenMasuk({
  sibuk,
  jadwal,
  onSelesai,
}: {
  sibuk: boolean;
  jadwal: ReturnType<typeof usePos>['jadwalCocok'];
  onSelesai: (input: {
    foto: Blob | null;
    diambilPada: Date | null;
    alasanPengecualian?: string | null;
  }) => Promise<void>;
}) {
  const [pengecualian, setPengecualian] = useState<MasalahKamera | null>(null);
  const [alasan, setAlasan] = useState('');
  const [galatAlasan, setGalatAlasan] = useState<string | null>(null);

  return (
    <Kartu judul="Absen Masuk" langkah={1}>
      {jadwal.length > 0 ? (
        <p className="mb-3 text-sm text-warm-muted">
          Jadwalmu: <strong>{jadwal[0].template.nama}</strong>{' '}
          {jamSingkat(jadwal[0].mulaiPada)}–{jamSingkat(jadwal[0].selesaiPada)}
          {jadwal[0].template.lewatTengahMalam && ' (lewat tengah malam)'}
        </p>
      ) : (
        <p className="mb-3 text-sm text-warm-muted">
          Tidak ada jadwal yang cocok saat ini. Kehadiranmu tetap dicatat.
        </p>
      )}

      {pengecualian === null ? (
        <KameraAbsensi
          labelAmbil="Ambil Foto Masuk"
          onPengecualian={setPengecualian}
          onSiap={(hasil: HasilFoto) =>
            void onSelesai({ foto: hasil.blob, diambilPada: hasil.diambilPada })
          }
        />
      ) : (
        <div className="space-y-3">
          {/* Foto tidak pernah dilewati diam-diam: alasannya wajib, tercatat di
              audit log, dan menunggu persetujuan pemilik. */}
          <p className="rounded-xl bg-warm-amber/10 px-3 py-2 text-sm text-warm-espresso">
            Absen tanpa foto perlu alasan. Pemilik akan melihatnya sebagai
            pengecualian yang menunggu persetujuan.
          </p>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-warm-muted">
              Alasan (wajib)
            </span>
            <textarea
              value={alasan}
              onChange={(e) => setAlasan(e.target.value)}
              rows={2}
              autoFocus
              placeholder="mis. kamera tablet rusak sejak pagi"
              className="w-full rounded-xl border border-warm-line bg-white px-3 py-2 text-sm text-warm-espresso outline-none focus:border-warm-amber"
            />
          </label>
          {galatAlasan && (
            <p role="alert" className="text-sm font-medium text-warm-danger">
              {galatAlasan}
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setPengecualian(null);
                setGalatAlasan(null);
              }}
              className="flex-1 rounded-xl border border-warm-line px-4 py-2.5 text-sm font-medium text-warm-espresso"
            >
              Coba Kamera Lagi
            </button>
            <button
              type="button"
              disabled={sibuk}
              onClick={() => {
                if (alasan.trim().length < 5) {
                  setGalatAlasan('Tulis alasan yang bisa dimengerti pemilik.');
                  return;
                }
                void onSelesai({
                  foto: null,
                  diambilPada: null,
                  alasanPengecualian: alasan.trim(),
                });
              }}
              className="flex-1 rounded-xl bg-warm-amber px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              Absen Tanpa Foto
            </button>
          </div>
        </div>
      )}
    </Kartu>
  );
}

function RingkasanAbsensi({
  absensi,
}: {
  absensi: NonNullable<ReturnType<typeof usePos>['absensi']>;
}) {
  return (
    <Kartu judul="Kehadiran Hari Ini" langkah={1} selesai>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <Baris label="Status" nilai={LABEL_STATUS_ABSENSI[absensi.status]} />
        <Baris label="Masuk" nilai={jamSingkat(absensi.masukPada)} />
        {absensi.terlambatMenit !== null && absensi.terlambatMenit > 0 && (
          <Baris label="Terlambat" nilai={`${absensi.terlambatMenit} menit`} tegas />
        )}
        {absensi.keluarPada && <Baris label="Pulang" nilai={jamSingkat(absensi.keluarPada)} />}
        {absensi.lemburMenit !== null && absensi.lemburMenit > 0 && (
          <Baris label="Lembur" nilai={`${absensi.lemburMenit} menit`} />
        )}
        {absensi.jadwal && <Baris label="Shift" nilai={absensi.jadwal.namaShift} />}
      </dl>
      {absensi.pengecualianFoto && (
        <p className="mt-2 rounded-lg bg-warm-amber/10 px-2.5 py-1.5 text-xs text-warm-espresso">
          Absen tanpa foto — {absensi.alasanPengecualian}
          {absensi.disetujuiPada ? ' · disetujui pemilik' : ' · menunggu persetujuan'}
        </p>
      )}
    </Kartu>
  );
}

// ── Buka shift ───────────────────────────────────────────────────────────────

function LangkahBukaShift({
  sibuk,
  namaJadwal,
  scheduleId,
  onBuka,
}: {
  sibuk: boolean;
  namaJadwal: string | null;
  scheduleId: string | null;
  onBuka: (modalAwal: number, scheduleId: string | null, catatan: string | null) => Promise<void>;
}) {
  const [modal, setModal] = useState('');
  const [catatan, setCatatan] = useState('');
  const [galat, setGalat] = useState<string | null>(null);

  const nilai = parseAmountInput(modal);

  return (
    <Kartu judul="Buka Shift" langkah={2}>
      <p className="mb-3 text-sm text-warm-muted">
        {namaJadwal
          ? `Shift ${namaJadwal}. `
          : 'Tidak ada jadwal yang cocok — shift dibuka tanpa nama jadwal. '}
        Hitung uang di laci sebelum memasukkan modal awal: angka inilah yang
        dipakai menghitung selisih saat kamu menutup shift nanti.
      </p>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-warm-muted">
          Modal awal (uang di laci sekarang)
        </span>
        <input
          value={modal}
          onChange={(e) => setModal(formatThousands(parseAmountInput(e.target.value) ?? 0))}
          inputMode="numeric"
          placeholder="0"
          className="w-full rounded-xl border border-warm-line bg-white px-3 py-2.5 text-right font-mono text-lg text-warm-espresso outline-none focus:border-warm-amber"
        />
      </label>

      <label className="mt-2 block">
        <span className="mb-1 block text-xs font-medium text-warm-muted">
          Catatan (opsional)
        </span>
        <input
          value={catatan}
          onChange={(e) => setCatatan(e.target.value)}
          className="w-full rounded-xl border border-warm-line bg-white px-3 py-2 text-sm text-warm-espresso outline-none focus:border-warm-amber"
        />
      </label>

      {galat && (
        <p role="alert" className="mt-2 text-sm font-medium text-warm-danger">
          {galat}
        </p>
      )}

      <button
        type="button"
        disabled={sibuk}
        onClick={() => {
          if (nilai === null || nilai < 0) {
            setGalat('Masukkan modal awal (boleh 0 bila laci kosong).');
            return;
          }
          setGalat(null);
          void onBuka(nilai, scheduleId, catatan.trim() || null);
        }}
        className="mt-3 w-full rounded-xl bg-warm-amber px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-95 disabled:opacity-50"
      >
        {sibuk ? 'Membuka…' : 'Buka Shift'}
      </button>
    </Kartu>
  );
}

// ── Rekap ────────────────────────────────────────────────────────────────────

function RekapShift({ shift }: { shift: NonNullable<ReturnType<typeof usePos>['shift']> }) {
  const r = shift.rekap;
  return (
    <Kartu judul={`Shift Berjalan — ${shift.namaShift}`} langkah={2} selesai>
      <p className="mb-3 text-xs text-warm-muted">
        Dibuka {jamSingkat(shift.dibukaPada)}
        {shift.terminal && ` · ${shift.terminal.label}`}
      </p>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <Baris label="Modal awal" nilai={formatRupiah(r.modalAwal)} />
        <Baris label="Penjualan tunai" nilai={formatRupiah(r.penjualanTunai)} />
        {r.kasMasuk > 0 && <Baris label="Uang masuk" nilai={formatRupiah(r.kasMasuk)} />}
        {r.kasKeluar > 0 && <Baris label="Uang keluar" nilai={`−${formatRupiah(r.kasKeluar)}`} />}
        <Baris label="Transaksi" nilai={String(r.jumlahTransaksi)} />
        {r.totalNonTunai > 0 && (
          <Baris label="Non-tunai" nilai={formatRupiah(r.totalNonTunai)} />
        )}
      </dl>

      {/* Angka yang paling sering dilihat kasir, jadi diberi ruangnya sendiri. */}
      <div className="mt-3 rounded-xl bg-warm-espresso px-4 py-3 text-warm-cream">
        <p className="text-xs opacity-80">Tunai seharusnya di laci</p>
        <p className="mt-0.5 font-mono text-xl font-semibold tabular-nums">
          {formatRupiah(r.tunaiSeharusnya)}
        </p>
      </div>

      {r.nonTunai.length > 0 && (
        <ul className="mt-2 space-y-1 text-xs text-warm-muted">
          {r.nonTunai.map((m) => (
            <li key={m.metode} className="flex justify-between">
              <span>{m.metode}</span>
              <span className="tabular-nums">
                {formatRupiah(m.total)} · {m.jumlahTransaksi}×
              </span>
            </li>
          ))}
        </ul>
      )}
    </Kartu>
  );
}

// ── Cash in / out ────────────────────────────────────────────────────────────

function PanelKas({
  sibuk,
  onCatat,
}: {
  sibuk: boolean;
  onCatat: (jenis: 'MASUK' | 'KELUAR', nominal: number, alasan: string) => Promise<void>;
}) {
  const [buka, setBuka] = useState(false);
  const [jenis, setJenis] = useState<'MASUK' | 'KELUAR'>('KELUAR');
  const [nominal, setNominal] = useState('');
  const [alasan, setAlasan] = useState('');
  const [galat, setGalat] = useState<string | null>(null);

  if (!buka) {
    return (
      <button
        type="button"
        onClick={() => setBuka(true)}
        className="w-full rounded-2xl border border-dashed border-warm-line px-4 py-3 text-sm font-medium text-warm-muted transition hover:bg-warm-line/20"
      >
        + Catat uang masuk / keluar laci
      </button>
    );
  }

  const angka = parseAmountInput(nominal);

  return (
    <Kartu judul="Pergerakan Kas">
      <p className="mb-3 text-sm text-warm-muted">
        Uang yang berpindah di luar penjualan. Tanpa dicatat di sini, ia akan
        muncul sebagai selisih kas saat penutupan.
      </p>

      <div className="mb-3 flex gap-2">
        {(['MASUK', 'KELUAR'] as const).map((j) => (
          <button
            key={j}
            type="button"
            onClick={() => setJenis(j)}
            className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition ${
              jenis === j
                ? 'border-warm-amber bg-warm-amber/10 text-warm-espresso'
                : 'border-warm-line text-warm-muted hover:bg-warm-line/20'
            }`}
          >
            {j === 'MASUK' ? 'Uang Masuk' : 'Uang Keluar'}
          </button>
        ))}
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-warm-muted">Nominal</span>
        <input
          value={nominal}
          onChange={(e) => setNominal(formatThousands(parseAmountInput(e.target.value) ?? 0))}
          inputMode="numeric"
          className="w-full rounded-xl border border-warm-line bg-white px-3 py-2.5 text-right font-mono text-lg text-warm-espresso outline-none focus:border-warm-amber"
        />
      </label>

      <label className="mt-2 block">
        <span className="mb-1 block text-xs font-medium text-warm-muted">
          Alasan (wajib)
        </span>
        <input
          value={alasan}
          onChange={(e) => setAlasan(e.target.value)}
          placeholder="mis. beli es batu"
          className="w-full rounded-xl border border-warm-line bg-white px-3 py-2 text-sm text-warm-espresso outline-none focus:border-warm-amber"
        />
      </label>

      {galat && (
        <p role="alert" className="mt-2 text-sm font-medium text-warm-danger">
          {galat}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => setBuka(false)}
          className="flex-1 rounded-xl border border-warm-line px-4 py-2.5 text-sm font-medium text-warm-muted"
        >
          Batal
        </button>
        <button
          type="button"
          disabled={sibuk}
          onClick={() => {
            if (angka === null || angka <= 0) {
              setGalat('Nominal harus lebih dari nol.');
              return;
            }
            if (alasan.trim().length < 3) {
              setGalat('Alasan wajib diisi — uang yang berpindah harus bisa dijelaskan.');
              return;
            }
            setGalat(null);
            void onCatat(jenis, angka, alasan.trim()).then(() => {
              setNominal('');
              setAlasan('');
              setBuka(false);
            });
          }}
          className="flex-1 rounded-xl bg-warm-amber px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          Catat
        </button>
      </div>
    </Kartu>
  );
}

// ── Tutup shift ──────────────────────────────────────────────────────────────

function LangkahTutupShift({
  sibuk,
  seharusnya,
  onTutup,
}: {
  sibuk: boolean;
  seharusnya: number;
  onTutup: (kasAktual: number, catatan: string | null) => Promise<void>;
}) {
  const [buka, setBuka] = useState(false);
  const [aktual, setAktual] = useState('');
  const [catatan, setCatatan] = useState('');
  const [galat, setGalat] = useState<string | null>(null);

  const angka = parseAmountInput(aktual);
  const selisih = angka === null ? null : angka - seharusnya;

  if (!buka) {
    return (
      <button
        type="button"
        onClick={() => setBuka(true)}
        className="w-full rounded-2xl border border-warm-line bg-warm-paper px-4 py-3 text-sm font-semibold text-warm-espresso transition hover:bg-warm-line/20"
      >
        Tutup Shift & Hitung Kas
      </button>
    );
  }

  return (
    <Kartu judul="Tutup Shift" langkah={3}>
      <p className="mb-3 text-sm text-warm-muted">
        Hitung seluruh uang di laci, lalu masukkan jumlahnya. Angka ini yang akan
        dibandingkan dengan tunai seharusnya.
      </p>

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-warm-muted">
          Tunai aktual di laci
        </span>
        <input
          value={aktual}
          onChange={(e) => setAktual(formatThousands(parseAmountInput(e.target.value) ?? 0))}
          inputMode="numeric"
          autoFocus
          className="w-full rounded-xl border border-warm-line bg-white px-3 py-2.5 text-right font-mono text-lg text-warm-espresso outline-none focus:border-warm-amber"
        />
      </label>

      {/* Selisih dihitung di layar SEBELUM dikirim: kasir melihat akibat
          angkanya sambil masih bisa menghitung ulang. */}
      {selisih !== null && (
        <div
          className={`mt-2 rounded-xl px-3 py-2 text-sm ${
            selisih === 0
              ? 'bg-warm-success/10 text-warm-success'
              : 'bg-warm-amber/10 text-warm-espresso'
          }`}
        >
          {selisih === 0 ? (
            'Kas pas dengan hitungan sistem.'
          ) : (
            <>
              Selisih <strong>{formatRupiah(selisih)}</strong>{' '}
              {selisih > 0 ? '(lebih)' : '(kurang)'} — jelaskan di catatan.
            </>
          )}
        </div>
      )}

      <label className="mt-2 block">
        <span className="mb-1 block text-xs font-medium text-warm-muted">
          Catatan {selisih !== null && selisih !== 0 ? '(wajib bila ada selisih)' : '(opsional)'}
        </span>
        <textarea
          value={catatan}
          onChange={(e) => setCatatan(e.target.value)}
          rows={2}
          className="w-full rounded-xl border border-warm-line bg-white px-3 py-2 text-sm text-warm-espresso outline-none focus:border-warm-amber"
        />
      </label>

      {galat && (
        <p role="alert" className="mt-2 text-sm font-medium text-warm-danger">
          {galat}
        </p>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => setBuka(false)}
          className="flex-1 rounded-xl border border-warm-line px-4 py-2.5 text-sm font-medium text-warm-muted"
        >
          Batal
        </button>
        <button
          type="button"
          disabled={sibuk}
          onClick={() => {
            if (angka === null || angka < 0) {
              setGalat('Masukkan jumlah uang yang kamu hitung di laci.');
              return;
            }
            if (selisih !== 0 && catatan.trim().length < 3) {
              setGalat('Selisih kas wajib disertai catatan.');
              return;
            }
            setGalat(null);
            void onTutup(angka, catatan.trim() || null);
          }}
          className="flex-1 rounded-xl bg-warm-amber px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
        >
          {sibuk ? 'Menutup…' : 'Tutup Shift'}
        </button>
      </div>
    </Kartu>
  );
}

// ── Absen pulang ─────────────────────────────────────────────────────────────

function LangkahAbsenPulang({
  sibuk,
  onSelesai,
}: {
  sibuk: boolean;
  onSelesai: (
    input: { foto: Blob | null; diambilPada: Date | null; alasanPengecualian?: string | null },
    catatan: string | null,
  ) => Promise<void>;
}) {
  const [pengecualian, setPengecualian] = useState<MasalahKamera | null>(null);
  const [alasan, setAlasan] = useState('');

  return (
    <Kartu judul="Absen Pulang" langkah={4}>
      <p className="mb-3 text-sm text-warm-muted">
        Shiftmu sudah ditutup. Ambil foto keluar untuk menutup kehadiran hari ini.
      </p>

      {pengecualian === null ? (
        <KameraAbsensi
          labelAmbil="Ambil Foto Keluar"
          onPengecualian={setPengecualian}
          onSiap={(hasil: HasilFoto) =>
            void onSelesai({ foto: hasil.blob, diambilPada: hasil.diambilPada }, null)
          }
        />
      ) : (
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-warm-muted">
              Alasan tanpa foto (wajib)
            </span>
            <textarea
              value={alasan}
              onChange={(e) => setAlasan(e.target.value)}
              rows={2}
              autoFocus
              className="w-full rounded-xl border border-warm-line bg-white px-3 py-2 text-sm text-warm-espresso outline-none focus:border-warm-amber"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPengecualian(null)}
              className="flex-1 rounded-xl border border-warm-line px-4 py-2.5 text-sm font-medium text-warm-espresso"
            >
              Coba Kamera Lagi
            </button>
            <button
              type="button"
              disabled={sibuk || alasan.trim().length < 5}
              onClick={() =>
                void onSelesai(
                  { foto: null, diambilPada: null, alasanPengecualian: alasan.trim() },
                  null,
                )
              }
              className="flex-1 rounded-xl bg-warm-amber px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              Absen Pulang
            </button>
          </div>
        </div>
      )}
    </Kartu>
  );
}

// ── Bagian bersama ───────────────────────────────────────────────────────────

function Kartu({
  judul,
  langkah,
  selesai,
  children,
}: {
  judul: string;
  langkah?: number;
  selesai?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-warm-line bg-warm-paper p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-warm-espresso">
        {langkah !== undefined && (
          <span
            aria-hidden
            className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${
              selesai ? 'bg-warm-success text-white' : 'bg-warm-amber text-white'
            }`}
          >
            {selesai ? '✓' : langkah}
          </span>
        )}
        {judul}
      </h2>
      {children}
    </section>
  );
}

function Baris({ label, nilai, tegas }: { label: string; nilai: string; tegas?: boolean }) {
  return (
    <>
      <dt className="text-warm-muted">{label}</dt>
      <dd
        className={`text-right tabular-nums ${
          tegas ? 'font-semibold text-warm-amber' : 'text-warm-espresso'
        }`}
      >
        {nilai}
      </dd>
    </>
  );
}
