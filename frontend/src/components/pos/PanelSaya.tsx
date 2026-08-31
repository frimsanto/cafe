import { useCallback, useEffect, useState } from 'react';
import { posApi } from '../../api/pos';
import { describeApiError } from '../../lib/apiClient';
import { formatRupiah } from '../../lib/format';
import type { AbsensiDTO, JadwalDTO, RiwayatSayaDTO } from '../../types/pos';
import {
  LABEL_STATUS_ABSENSI,
  STATUS_PERLU_PERHATIAN,
  durasiSingkat,
  jamSingkat,
  kunciGeser,
  tanggalSingkat,
} from './format';

/**
 * Tiga layar "milik saya": jadwal, absensi, riwayat transaksi.
 *
 * Ketiganya memakai sesi POS, jadi backend yang menentukan siapa "saya" — dari
 * PIN yang sudah dibuktikan, bukan dari parameter yang bisa diganti menjadi id
 * rekan sebelah. Itu sebabnya tidak satu pun panggilan di berkas ini mengirim
 * `userId`.
 */

/** Pembungkus pemuatan yang sama untuk ketiga panel. */
function useMuat<T>(ambil: () => Promise<T>): {
  data: T | null;
  memuat: boolean;
  galat: string | null;
  ulangi: () => void;
} {
  const [data, setData] = useState<T | null>(null);
  const [memuat, setMemuat] = useState(true);
  const [galat, setGalat] = useState<string | null>(null);

  const jalankan = useCallback(async () => {
    setMemuat(true);
    try {
      setData(await ambil());
      setGalat(null);
    } catch (err) {
      setGalat(describeApiError(err, 'Gagal memuat data.'));
    } finally {
      setMemuat(false);
    }
  }, [ambil]);

  useEffect(() => {
    void jalankan();
  }, [jalankan]);

  return { data, memuat, galat, ulangi: () => void jalankan() };
}

function Bingkai({
  judul,
  keterangan,
  memuat,
  galat,
  ulangi,
  kosong,
  children,
}: {
  judul: string;
  keterangan?: string;
  memuat: boolean;
  galat: string | null;
  ulangi: () => void;
  kosong: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-warm-line bg-warm-paper p-4">
      <h2 className="text-sm font-semibold text-warm-espresso">{judul}</h2>
      {keterangan && <p className="mt-0.5 text-xs text-warm-muted">{keterangan}</p>}

      <div className="mt-3">
        {memuat ? (
          <div className="space-y-2" aria-busy="true">
            <span className="sr-only">Memuat…</span>
            {[0, 1].map((i) => (
              <div key={i} className="skeleton-warm h-14 rounded-xl" />
            ))}
          </div>
        ) : galat ? (
          <div role="alert" className="text-center">
            <p className="text-sm font-medium text-warm-danger">{galat}</p>
            <button
              type="button"
              onClick={ulangi}
              className="mt-2 rounded-xl border border-warm-line px-3 py-1.5 text-sm font-medium text-warm-espresso"
            >
              Coba lagi
            </button>
          </div>
        ) : kosong ? (
          <p className="py-6 text-center text-sm text-warm-muted">Belum ada data.</p>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

// ── Jadwal Saya ──────────────────────────────────────────────────────────────

export function JadwalSaya() {
  const ambil = useCallback(() => posApi.jadwalSaya(kunciGeser(-1), kunciGeser(30)), []);
  const { data, memuat, galat, ulangi } = useMuat<JadwalDTO[]>(ambil);
  const jadwal = data ?? [];

  return (
    <Bingkai
      judul="Jadwal Saya"
      keterangan="30 hari ke depan"
      memuat={memuat}
      galat={galat}
      ulangi={ulangi}
      kosong={jadwal.length === 0}
    >
      <ul className="space-y-2">
        {jadwal.map((j) => (
          <li
            key={j.id}
            className={`rounded-xl border border-warm-line bg-white px-3.5 py-2.5 ${
              j.status === 'DIBATALKAN' ? 'opacity-50' : ''
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-warm-espresso">{j.template.nama}</p>
                <p className="text-xs text-warm-muted">
                  {tanggalSingkat(j.mulaiPada)} · {jamSingkat(j.mulaiPada)}–
                  {jamSingkat(j.selesaiPada)}
                  {/* Shift lintas tengah malam disebutkan terang-terangan —
                      kalau tidak, "22.00–06.00" terbaca seperti salah tulis. */}
                  {j.template.lewatTengahMalam && ' (+1 hari)'}
                </p>
              </div>
              {j.terminal && (
                <span className="shrink-0 rounded-md bg-warm-line/50 px-1.5 py-0.5 text-xs text-warm-muted">
                  {j.terminal.label}
                </span>
              )}
              {j.status === 'DIBATALKAN' && (
                <span className="shrink-0 text-xs text-warm-muted">Dibatalkan</span>
              )}
            </div>
            {j.catatan && <p className="mt-1 text-xs text-warm-muted">{j.catatan}</p>}
          </li>
        ))}
      </ul>
    </Bingkai>
  );
}

// ── Absensi Saya ─────────────────────────────────────────────────────────────

export function AbsensiSaya() {
  const ambil = useCallback(() => posApi.absensiSaya(kunciGeser(-30), kunciGeser(0)), []);
  const { data, memuat, galat, ulangi } = useMuat<AbsensiDTO[]>(ambil);
  const absensi = data ?? [];

  return (
    <Bingkai
      judul="Absensi Saya"
      keterangan="30 hari terakhir"
      memuat={memuat}
      galat={galat}
      ulangi={ulangi}
      kosong={absensi.length === 0}
    >
      <ul className="space-y-2">
        {absensi.map((a) => (
          <li key={a.id} className="rounded-xl border border-warm-line bg-white px-3.5 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-medium text-warm-espresso">
                {tanggalSingkat(a.masukPada)}
                {a.jadwal && (
                  <span className="ml-1.5 text-xs font-normal text-warm-muted">
                    {a.jadwal.namaShift}
                  </span>
                )}
              </p>
              <span
                className={`rounded-md px-1.5 py-0.5 text-xs font-medium ${
                  STATUS_PERLU_PERHATIAN.has(a.status)
                    ? 'bg-warm-amber/15 text-warm-amber'
                    : 'bg-warm-line/50 text-warm-muted'
                }`}
              >
                {LABEL_STATUS_ABSENSI[a.status]}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-warm-muted">
              {jamSingkat(a.masukPada)} – {jamSingkat(a.keluarPada)} ·{' '}
              {durasiSingkat(a.durasiMenit)}
              {a.terlambatMenit !== null && a.terlambatMenit > 0 && (
                <span className="text-warm-amber"> · terlambat {a.terlambatMenit}m</span>
              )}
              {a.lemburMenit !== null && a.lemburMenit > 0 && (
                <span> · lembur {a.lemburMenit}m</span>
              )}
            </p>
            {a.pengecualianFoto && (
              <p className="mt-1 text-xs text-warm-amber">
                Tanpa foto — {a.alasanPengecualian}
                {a.disetujuiPada ? ' (disetujui)' : ' (menunggu persetujuan)'}
              </p>
            )}
          </li>
        ))}
      </ul>
    </Bingkai>
  );
}

// ── Riwayat Saya ─────────────────────────────────────────────────────────────

export function RiwayatSaya() {
  const ambil = useCallback(() => posApi.riwayatSaya(), []);
  const { data, memuat, galat, ulangi } = useMuat<RiwayatSayaDTO>(ambil);
  const pesanan = data?.pesanan ?? [];

  return (
    <Bingkai
      judul="Riwayat Saya"
      keterangan={
        data?.bolehLihatShiftLama === false
          ? 'Shift yang sedang berjalan saja — pemilik membatasi riwayat lama.'
          : 'Transaksi yang kamu proses pada beberapa shift terakhir.'
      }
      memuat={memuat}
      galat={galat}
      ulangi={ulangi}
      kosong={pesanan.length === 0}
    >
      <ul className="space-y-2">
        {pesanan.map((p) => (
          <li key={p.id} className="rounded-xl border border-warm-line bg-white px-3.5 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-warm-espresso">
                  {p.queueNumber !== null && p.queueNumber !== undefined
                    ? `A-${String(p.queueNumber).padStart(3, '0')}`
                    : p.id.slice(0, 8)}
                  {p.tableName && (
                    <span className="ml-1.5 text-xs font-normal text-warm-muted">
                      {p.tableName}
                    </span>
                  )}
                </p>
                <p className="text-xs text-warm-muted">
                  {jamSingkat(p.createdAt)} · {p.metodePembayaran ?? '—'}
                </p>
              </div>
              <span className="shrink-0 font-mono text-sm tabular-nums text-warm-espresso">
                {formatRupiah(p.totalAmount)}
              </span>
            </div>
          </li>
        ))}
      </ul>

      {/* Angka yang TIDAK ada di sini disebutkan dengan sengaja: kasir tidak
          pernah melihat omzet kafe atau transaksi rekannya (Bagian K). */}
      {pesanan.length > 0 && (
        <p className="mt-3 text-xs text-warm-muted">
          Hanya transaksi yang kamu proses sendiri. Omzet kafe dan transaksi
          kasir lain tidak ditampilkan di sini.
        </p>
      )}
    </Bingkai>
  );
}
