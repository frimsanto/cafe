import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { usePos } from '../../pos/PosSessionContext';
import { useAuth } from '../../auth/AuthContext';
import { formatRupiah } from '../../lib/format';
import { jamSingkat } from './format';

export type TabPos = 'KASIR' | 'SHIFT' | 'JADWAL' | 'ABSENSI' | 'RIWAYAT';

const TAB: Array<{ id: TabPos; label: string }> = [
  { id: 'KASIR', label: 'Kasir' },
  { id: 'SHIFT', label: 'Shift Saya' },
  { id: 'JADWAL', label: 'Jadwal Saya' },
  { id: 'ABSENSI', label: 'Absensi Saya' },
  { id: 'RIWAYAT', label: 'Riwayat Saya' },
];

interface Props {
  tab: TabPos;
  onTab: (tab: TabPos) => void;
  /** Jumlah pesanan yang menunggu — ditampilkan di kepala layar. */
  menunggu?: number;
  /** Status koneksi realtime dari layar kasir. */
  realtime?: 'live' | 'polling' | 'offline';
  children: ReactNode;
}

/**
 * Kerangka layar POS — menggantikan `AppLayout` untuk terminal kasir.
 *
 * ── Kenapa bukan AppLayout ──
 *
 * `AppLayout` menampilkan rel navigasi pemilik. Bagian A menuntut kasir TIDAK
 * melihatnya: layar kasir adalah POS layar penuh, dan setiap tautan ke area
 * pemilik yang tampak di sana adalah tautan yang cepat atau lambat ditekan
 * seseorang lalu berakhir di halaman 403.
 *
 * Pemilik yang membuka layar ini — ia memang boleh membantu menagih — tetap
 * mendapat satu jalan pulang: tombol "Kembali ke Dasbor" yang HANYA muncul
 * untuknya.
 */
export default function PosShell({ tab, onTab, menunggu, realtime, children }: Props) {
  const { sesi, perangkat, shift, kunci } = usePos();
  const { user } = useAuth();
  const [jam, setJam] = useState(() => new Date());

  // Jam berjalan di kepala layar: kasir memakainya untuk mencocokkan waktu
  // dengan struk dan dengan jam dinding kafe.
  useEffect(() => {
    const id = setInterval(() => setJam(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const durasiShift = shift?.status === 'AKTIF' ? hitungDurasi(shift.dibukaPada, jam) : null;

  return (
    <div className="min-h-screen bg-warm-cream">
      <header className="sticky top-0 z-30 border-b border-warm-line bg-warm-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-warm-espresso">
              {sesi?.cafeName ?? 'CafeOS'}
            </p>
            <p className="truncate text-xs text-warm-muted">
              {perangkat?.label ?? 'Terminal'} ·{' '}
              {jam.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>

          <div className="flex min-w-0 items-center gap-2">
            <span
              aria-hidden
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-warm-line/60 text-xs font-semibold text-warm-espresso"
            >
              {(sesi?.nama ?? '?').slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-warm-espresso">
                {sesi?.nama}
              </p>
              <p className="truncate text-xs text-warm-muted">
                {shift?.status === 'AKTIF'
                  ? `${shift.namaShift} · ${durasiShift} · buka ${jamSingkat(shift.dibukaPada)}`
                  : 'Belum membuka shift'}
              </p>
            </div>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {shift?.status === 'AKTIF' && (
              <span className="hidden rounded-lg bg-warm-espresso px-2.5 py-1.5 font-mono text-xs tabular-nums text-warm-cream sm:inline">
                {formatRupiah(shift.rekap.tunaiSeharusnya)}
              </span>
            )}
            {menunggu !== undefined && menunggu > 0 && (
              <span className="rounded-lg bg-warm-amber/15 px-2.5 py-1.5 text-xs font-medium text-warm-amber">
                {menunggu} menunggu
              </span>
            )}
            {realtime && <PenandaRealtime status={realtime} />}

            {/* Hanya pemilik yang punya jalan pulang ke dasbor. Kasir tidak
                pernah melihat tautan ini. */}
            {user?.role === 'OWNER' && (
              <Link
                to="/dasbor"
                className="rounded-lg border border-warm-line px-3 py-1.5 text-xs font-medium text-warm-espresso transition hover:bg-warm-line/30"
              >
                Kembali ke Dasbor
              </Link>
            )}

            <button
              type="button"
              onClick={() => void kunci()}
              className="rounded-lg border border-warm-line px-3 py-1.5 text-xs font-medium text-warm-muted transition hover:bg-warm-line/30"
            >
              Ganti Petugas
            </button>
          </div>
        </div>

        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2">
          {TAB.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => onTab(t.id)}
              aria-current={tab === t.id ? 'page' : undefined}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                tab === t.id
                  ? 'bg-warm-espresso text-warm-cream'
                  : 'text-warm-muted hover:bg-warm-espresso/5'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-4">{children}</main>
    </div>
  );
}

function PenandaRealtime({ status }: { status: 'live' | 'polling' | 'offline' }) {
  const warna =
    status === 'live'
      ? 'bg-warm-success'
      : status === 'polling'
        ? 'bg-warm-amber'
        : 'bg-warm-muted';
  const label =
    status === 'live'
      ? 'Terhubung'
      : status === 'polling'
        ? 'Memuat berkala'
        : 'Terputus';

  return (
    <span className="flex items-center gap-1.5 text-xs text-warm-muted">
      <span aria-hidden className={`h-2 w-2 rounded-full ${warna}`} />
      {label}
    </span>
  );
}

/** Durasi sejak shift dibuka, dalam bentuk `3j 20m`. */
function hitungDurasi(mulai: string, sekarang: Date): string {
  const menit = Math.max(
    0,
    Math.floor((sekarang.getTime() - new Date(mulai).getTime()) / 60_000),
  );
  return `${Math.floor(menit / 60)}j ${menit % 60}m`;
}
