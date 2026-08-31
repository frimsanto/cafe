import { useCallback, useEffect, useMemo, useState } from 'react';
import AppLayout from '../components/layout/AppLayout';
import AlertBanner from '../components/common/AlertBanner';
import { describeApiError } from '../lib/apiClient';
import { jadwalApi, type TemplateShiftBody } from '../api/jadwal';
import { stafApi } from '../api/staf';
import type { JadwalDTO, PenggantianDTO, TemplateShiftDTO } from '../types/pos';
import type { StafDTO } from '../types/staf';
import { jamSingkat, kunciGeser, kunciTanggal, tanggalSingkat } from '../components/pos/format';

/**
 * Jadwal Kerja (pemilik): template shift, penugasan, dan persetujuan pengganti.
 *
 * Tiga bagian dalam satu halaman karena ketiganya adalah satu pekerjaan yang
 * sama — menentukan siapa bertugas kapan. Memisahkannya ke tiga menu akan
 * membuat pemilik yang menyetujui seorang pengganti harus mencari sendiri
 * jadwal mana yang terpengaruh.
 *
 * Permintaan pengganti diletakkan PALING ATAS ketika ada yang menunggu: itu
 * satu-satunya bagian halaman ini yang menuntut keputusan hari ini.
 */
const HARI = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'];

export default function JadwalPage() {
  const [template, setTemplate] = useState<TemplateShiftDTO[]>([]);
  const [jadwal, setJadwal] = useState<JadwalDTO[]>([]);
  const [pengganti, setPengganti] = useState<PenggantianDTO[]>([]);
  const [staf, setStaf] = useState<StafDTO[]>([]);

  const [memuat, setMemuat] = useState(true);
  const [galatMuat, setGalatMuat] = useState<string | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [pesan, setPesan] = useState<string | null>(null);
  const [sibuk, setSibuk] = useState(false);

  const [formTemplate, setFormTemplate] = useState<TemplateShiftDTO | 'baru' | null>(null);

  const muat = useCallback(async () => {
    setMemuat(true);
    try {
      const [t, j, p, s] = await Promise.all([
        jadwalApi.daftarTemplate(),
        jadwalApi.daftar(kunciGeser(-7), kunciGeser(30)),
        jadwalApi.pengganti(),
        stafApi.daftar(),
      ]);
      setTemplate(t);
      setJadwal(j);
      setPengganti(p);
      setStaf(s);
      setGalatMuat(null);
    } catch (err) {
      setGalatMuat(describeApiError(err, 'Gagal memuat jadwal.'));
    } finally {
      setMemuat(false);
    }
  }, []);

  useEffect(() => {
    void muat();
  }, [muat]);

  const jalankan = async (aksi: () => Promise<unknown>, berhasil: string, gagal: string) => {
    setSibuk(true);
    setGalat(null);
    try {
      await aksi();
      await muat();
      setPesan(berhasil);
      return true;
    } catch (err) {
      setGalat(describeApiError(err, gagal));
      return false;
    } finally {
      setSibuk(false);
    }
  };

  const menunggu = useMemo(
    () => pengganti.filter((p) => p.status === 'PENDING_APPROVAL'),
    [pengganti],
  );

  return (
    <AppLayout
      title="Jadwal Kerja"
      subtitle="Pola shift, siapa bertugas kapan, dan persetujuan pengganti."
      actions={
        <button
          type="button"
          onClick={() => setFormTemplate('baru')}
          className="rounded-lg bg-warm-amber px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-95"
        >
          + Template Shift
        </button>
      }
    >
      {galatMuat && (
        <div className="mt-4">
          <AlertBanner tone="error" action={{ label: 'Coba lagi', onClick: () => void muat() }}>
            {galatMuat}
          </AlertBanner>
        </div>
      )}
      {galat && (
        <div className="mt-4">
          <AlertBanner tone="error" onClose={() => setGalat(null)}>
            {galat}
          </AlertBanner>
        </div>
      )}
      {pesan && (
        <div className="mt-4">
          <AlertBanner tone="success" onClose={() => setPesan(null)}>
            {pesan}
          </AlertBanner>
        </div>
      )}

      {/* Yang menuntut keputusan hari ini diletakkan paling atas. */}
      {menunggu.length > 0 && (
        <section className="mt-5 rounded-2xl border border-warm-amber/40 bg-warm-amber/5 p-4">
          <h2 className="text-sm font-semibold text-warm-espresso">
            {menunggu.length} permintaan pengganti menunggu persetujuanmu
          </h2>
          <ul className="mt-3 space-y-2">
            {menunggu.map((p) => (
              <BarisPengganti
                key={p.id}
                pengganti={p}
                sibuk={sibuk}
                onPutuskan={(setuju, alasan) =>
                  void jalankan(
                    () => jadwalApi.putuskanPengganti(p.id, setuju, alasan),
                    setuju
                      ? `${p.staffPengganti.nama} disetujui menggantikan ${p.staffTerjadwal.nama}.`
                      : 'Permintaan pengganti ditolak.',
                    'Gagal memutuskan permintaan.',
                  )
                }
              />
            ))}
          </ul>
        </section>
      )}

      <section className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-warm-muted">
          Template Shift
        </h2>
        {memuat ? (
          <div className="mt-3 skeleton-warm h-20 rounded-2xl" />
        ) : template.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-warm-line px-4 py-8 text-center text-sm text-warm-muted">
            Belum ada template. Buat pola shift (mis. Pagi 07:00–15:00) sebelum
            menugaskan staf.
          </p>
        ) : (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {template.map((t) => (
              <li
                key={t.id}
                className={`rounded-2xl border border-warm-line bg-warm-paper p-3.5 ${
                  t.aktif ? '' : 'opacity-60'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-warm-espresso">{t.nama}</p>
                    <p className="text-sm text-warm-muted">
                      {t.jamMulai}–{t.jamSelesai}
                      {/* Disebutkan terang-terangan: "22:00–06:00" tanpa
                          penanda terbaca seperti salah tulis. */}
                      {t.lewatTengahMalam && (
                        <span className="text-warm-amber"> (+1 hari)</span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-warm-muted">
                      Toleransi {t.toleransiTerlambatMenit} menit ·{' '}
                      {t.hariBerlaku.length === 0
                        ? 'setiap hari'
                        : t.hariBerlaku.map((h) => HARI[h - 1]).join(', ')}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFormTemplate(t)}
                    className="shrink-0 rounded-lg border border-warm-line px-2.5 py-1 text-xs font-medium text-warm-espresso"
                  >
                    Ubah
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <FormPenugasan
        template={template.filter((t) => t.aktif)}
        staf={staf.filter((s) => s.aktif && s.role !== 'DAPUR')}
        sibuk={sibuk}
        onTetapkan={(body) =>
          jalankan(
            () => jadwalApi.tetapkan(body),
            'Jadwal ditetapkan.',
            'Gagal menetapkan jadwal.',
          )
        }
      />

      <section className="mt-6">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-warm-muted">
          Jadwal 30 Hari
        </h2>
        {memuat ? (
          <div className="mt-3 skeleton-warm h-24 rounded-2xl" />
        ) : jadwal.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-warm-line px-4 py-8 text-center text-sm text-warm-muted">
            Belum ada penugasan.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {jadwal.map((j) => (
              <li
                key={j.id}
                className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warm-line bg-warm-paper px-3.5 py-2.5 ${
                  j.status === 'DIBATALKAN' ? 'opacity-50' : ''
                }`}
              >
                <div className="min-w-0">
                  <p className="font-medium text-warm-espresso">
                    {j.staf.nama}
                    <span className="ml-1.5 text-sm font-normal text-warm-muted">
                      {j.template.nama}
                    </span>
                  </p>
                  <p className="text-xs text-warm-muted">
                    {tanggalSingkat(j.mulaiPada)} · {jamSingkat(j.mulaiPada)}–
                    {jamSingkat(j.selesaiPada)}
                    {j.template.lewatTengahMalam && ' (+1 hari)'}
                    {j.terminal && ` · ${j.terminal.label}`}
                  </p>
                </div>
                {j.status === 'DIJADWALKAN' && (
                  <button
                    type="button"
                    disabled={sibuk}
                    onClick={() =>
                      void jalankan(
                        () => jadwalApi.batalkan(j.id, 'dibatalkan pemilik'),
                        'Jadwal dibatalkan.',
                        'Gagal membatalkan jadwal.',
                      )
                    }
                    className="shrink-0 rounded-lg border border-warm-line px-2.5 py-1 text-xs font-medium text-warm-muted disabled:opacity-50"
                  >
                    Batalkan
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {formTemplate && (
        <FormTemplate
          template={formTemplate === 'baru' ? null : formTemplate}
          sibuk={sibuk}
          onTutup={() => setFormTemplate(null)}
          onSimpan={async (body) => {
            const ok = await jalankan(
              () =>
                jadwalApi.simpanTemplate(
                  body,
                  formTemplate === 'baru' ? undefined : formTemplate.id,
                ),
              'Template shift disimpan.',
              'Gagal menyimpan template.',
            );
            if (ok) setFormTemplate(null);
          }}
        />
      )}
    </AppLayout>
  );
}

// ── Penggantian ──────────────────────────────────────────────────────────────

function BarisPengganti({
  pengganti,
  sibuk,
  onPutuskan,
}: {
  pengganti: PenggantianDTO;
  sibuk: boolean;
  onPutuskan: (setuju: boolean, alasan: string | null) => void;
}) {
  const [menolak, setMenolak] = useState(false);
  const [alasan, setAlasan] = useState('');

  return (
    <li className="rounded-xl border border-warm-line bg-white px-3.5 py-3">
      <p className="text-sm text-warm-espresso">
        <strong>{pengganti.staffPengganti.nama}</strong> menggantikan{' '}
        <strong>{pengganti.staffTerjadwal.nama}</strong> — {pengganti.jadwal.namaShift},{' '}
        {pengganti.jadwal.tanggal}
      </p>
      <p className="mt-0.5 text-xs text-warm-muted">Alasan: {pengganti.alasan}</p>

      {menolak ? (
        <div className="mt-2 space-y-2">
          <input
            value={alasan}
            onChange={(e) => setAlasan(e.target.value)}
            autoFocus
            placeholder="Alasan penolakan (wajib)"
            className="w-full rounded-lg border border-warm-line px-3 py-1.5 text-sm outline-none focus:border-warm-amber"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setMenolak(false)}
              className="rounded-lg border border-warm-line px-3 py-1.5 text-xs font-medium text-warm-muted"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={sibuk || alasan.trim().length < 3}
              onClick={() => onPutuskan(false, alasan.trim())}
              className="rounded-lg bg-warm-danger px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
            >
              Tolak
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            disabled={sibuk}
            onClick={() => onPutuskan(true, null)}
            className="rounded-lg bg-warm-amber px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            Setujui
          </button>
          <button
            type="button"
            disabled={sibuk}
            onClick={() => setMenolak(true)}
            className="rounded-lg border border-warm-line px-3 py-1.5 text-xs font-medium text-warm-muted disabled:opacity-50"
          >
            Tolak
          </button>
        </div>
      )}
    </li>
  );
}

// ── Penugasan ────────────────────────────────────────────────────────────────

function FormPenugasan({
  template,
  staf,
  sibuk,
  onTetapkan,
}: {
  template: TemplateShiftDTO[];
  staf: StafDTO[];
  sibuk: boolean;
  onTetapkan: (body: {
    templateId: string;
    userId: string;
    tanggal: string;
  }) => Promise<boolean>;
}) {
  const [templateId, setTemplateId] = useState('');
  const [userId, setUserId] = useState('');
  const [tanggal, setTanggal] = useState(kunciTanggal(new Date()));

  if (template.length === 0 || staf.length === 0) return null;

  return (
    <section className="mt-6 rounded-2xl border border-warm-line bg-warm-paper p-4">
      <h2 className="text-sm font-semibold text-warm-espresso">Tugaskan Staf</h2>
      <div className="mt-3 grid gap-2 sm:grid-cols-4">
        <select
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          className="rounded-xl border border-warm-line bg-white px-3 py-2 text-sm text-warm-espresso outline-none focus:border-warm-amber"
        >
          <option value="">Pilih shift…</option>
          {template.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nama} ({t.jamMulai}–{t.jamSelesai})
            </option>
          ))}
        </select>

        <select
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          className="rounded-xl border border-warm-line bg-white px-3 py-2 text-sm text-warm-espresso outline-none focus:border-warm-amber"
        >
          <option value="">Pilih staf…</option>
          {staf.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <input
          type="date"
          value={tanggal}
          onChange={(e) => setTanggal(e.target.value)}
          className="rounded-xl border border-warm-line bg-white px-3 py-2 text-sm text-warm-espresso outline-none focus:border-warm-amber"
        />

        <button
          type="button"
          disabled={sibuk || !templateId || !userId || !tanggal}
          onClick={() => {
            void onTetapkan({ templateId, userId, tanggal }).then((ok) => {
              if (ok) setUserId('');
            });
          }}
          className="rounded-xl bg-warm-amber px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          Tugaskan
        </button>
      </div>
      <p className="mt-2 text-xs text-warm-muted">
        Bentrok jadwal ditolak otomatis — termasuk shift malam yang berakhir di
        hari berikutnya.
      </p>
    </section>
  );
}

// ── Form template ────────────────────────────────────────────────────────────

function FormTemplate({
  template,
  sibuk,
  onTutup,
  onSimpan,
}: {
  template: TemplateShiftDTO | null;
  sibuk: boolean;
  onTutup: () => void;
  onSimpan: (body: TemplateShiftBody) => void;
}) {
  const [nama, setNama] = useState(template?.nama ?? '');
  const [jamMulai, setJamMulai] = useState(template?.jamMulai ?? '07:00');
  const [jamSelesai, setJamSelesai] = useState(template?.jamSelesai ?? '15:00');
  const [toleransi, setToleransi] = useState(template?.toleransiTerlambatMenit ?? 10);
  const [hari, setHari] = useState<number[]>(template?.hariBerlaku ?? []);
  const [aktif, setAktif] = useState(template?.aktif ?? true);
  const [nonstop, setNonstop] = useState(
    template ? template.lewatTengahMalam && template.jamMulai === template.jamSelesai : false,
  );
  const [galat, setGalat] = useState<string | null>(null);

  // Diturunkan, bukan disetel: jam selesai yang lebih kecil dari jam mulai PASTI
  // melewati tengah malam. Yang tidak bisa diturunkan hanyalah shift 24 jam,
  // dan itulah satu-satunya yang dipilih manusia.
  const lewatTengahMalam = jamSelesai < jamMulai || (jamSelesai === jamMulai && nonstop);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-md rounded-t-3xl bg-warm-paper shadow-xl sm:rounded-3xl">
        <header className="border-b border-warm-line px-5 py-4">
          <h2 className="text-lg font-semibold text-warm-espresso">
            {template ? `Ubah ${template.nama}` : 'Template Shift Baru'}
          </h2>
        </header>

        <div className="space-y-3 px-5 py-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-warm-muted">Nama shift</span>
            <input
              value={nama}
              onChange={(e) => setNama(e.target.value)}
              autoFocus
              placeholder="mis. Pagi"
              className="w-full rounded-xl border border-warm-line bg-white px-3 py-2 text-sm outline-none focus:border-warm-amber"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-warm-muted">Mulai</span>
              <input
                type="time"
                value={jamMulai}
                onChange={(e) => setJamMulai(e.target.value)}
                className="w-full rounded-xl border border-warm-line bg-white px-3 py-2 text-sm outline-none focus:border-warm-amber"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-warm-muted">Selesai</span>
              <input
                type="time"
                value={jamSelesai}
                onChange={(e) => setJamSelesai(e.target.value)}
                className="w-full rounded-xl border border-warm-line bg-white px-3 py-2 text-sm outline-none focus:border-warm-amber"
              />
            </label>
          </div>

          {jamSelesai < jamMulai && (
            <p className="rounded-lg bg-warm-amber/10 px-2.5 py-1.5 text-xs text-warm-espresso">
              Shift ini melewati tengah malam — berakhir di hari berikutnya.
            </p>
          )}
          {jamSelesai === jamMulai && (
            <label className="flex items-start gap-2 rounded-lg bg-warm-amber/10 px-2.5 py-2 text-xs text-warm-espresso">
              <input
                type="checkbox"
                checked={nonstop}
                onChange={(e) => setNonstop(e.target.checked)}
                className="mt-0.5 accent-warm-amber"
              />
              <span>
                Jam mulai dan selesai sama. Centang bila ini shift 24 jam; kalau
                bukan, perbaiki salah satu jamnya.
              </span>
            </label>
          )}

          <label className="block">
            <span className="mb-1 block text-xs font-medium text-warm-muted">
              Toleransi terlambat (menit)
            </span>
            <input
              type="number"
              min={0}
              max={240}
              value={toleransi}
              onChange={(e) => setToleransi(Number(e.target.value))}
              className="w-full rounded-xl border border-warm-line bg-white px-3 py-2 text-sm outline-none focus:border-warm-amber"
            />
          </label>

          <div>
            <span className="mb-1 block text-xs font-medium text-warm-muted">
              Hari berlaku (kosong = setiap hari)
            </span>
            <div className="flex flex-wrap gap-1.5">
              {HARI.map((h, i) => {
                const iso = i + 1;
                const dipilih = hari.includes(iso);
                return (
                  <button
                    key={h}
                    type="button"
                    onClick={() =>
                      setHari((k) =>
                        dipilih ? k.filter((x) => x !== iso) : [...k, iso].sort(),
                      )
                    }
                    className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
                      dipilih
                        ? 'border-warm-amber bg-warm-amber/10 text-warm-espresso'
                        : 'border-warm-line text-warm-muted'
                    }`}
                  >
                    {h}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-warm-espresso">
            <input
              type="checkbox"
              checked={aktif}
              onChange={(e) => setAktif(e.target.checked)}
              className="accent-warm-amber"
            />
            Aktif (bisa ditugaskan)
          </label>

          {galat && (
            <p role="alert" className="text-sm font-medium text-warm-danger">
              {galat}
            </p>
          )}
        </div>

        <footer className="flex justify-end gap-2 border-t border-warm-line px-5 py-3">
          <button
            type="button"
            onClick={onTutup}
            disabled={sibuk}
            className="rounded-xl px-4 py-2 text-sm font-medium text-warm-muted disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="button"
            disabled={sibuk}
            onClick={() => {
              if (nama.trim() === '') return setGalat('Nama shift wajib diisi.');
              if (jamSelesai === jamMulai && !nonstop) {
                return setGalat(
                  'Jam mulai dan selesai sama. Centang "shift 24 jam" atau perbaiki jamnya.',
                );
              }
              setGalat(null);
              onSimpan({
                nama: nama.trim(),
                jamMulai,
                jamSelesai,
                lewatTengahMalam,
                toleransiTerlambatMenit: toleransi,
                hariBerlaku: hari,
                aktif,
              });
            }}
            className="rounded-xl bg-warm-amber px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {sibuk ? 'Menyimpan…' : 'Simpan'}
          </button>
        </footer>
      </div>
    </div>
  );
}
