import { useState } from 'react';
import type { PerangkatBaruDTO, PerangkatDTO } from '../../types/staf';
import { describeApiError } from '../../lib/apiClient';

interface Props {
  perangkat: PerangkatDTO[];
  loading: boolean;
  sibuk: boolean;
  onDaftarkan: (label: string) => Promise<PerangkatBaruDTO>;
  onCabut: (p: PerangkatDTO) => void;
}

/**
 * Daftar terminal POS milik kafe.
 *
 * ── Token yang hanya muncul sekali ──
 *
 * Saat sebuah terminal didaftarkan, servernya mengembalikan token SEKALI dan
 * sesudah itu hanya menyimpan hash-nya. Panel ini karena itu menahan token yang
 * baru terbit di layar sampai pemilik menutupnya sendiri — bukan hilang begitu
 * daftarnya di-refresh. Kalau tokennya telanjur hilang, jalan keluarnya bukan
 * "tampilkan lagi" (tidak ada yang bisa) melainkan cabut lalu daftarkan ulang,
 * dan panel ini mengatakannya.
 */
export default function PerangkatPanel({
  perangkat,
  loading,
  sibuk,
  onDaftarkan,
  onCabut,
}: Props) {
  const [label, setLabel] = useState('');
  const [tokenBaru, setTokenBaru] = useState<PerangkatBaruDTO | null>(null);
  const [galat, setGalat] = useState<string | null>(null);
  const [mendaftar, setMendaftar] = useState(false);
  const [tersalin, setTersalin] = useState(false);

  const daftarkan = async () => {
    const bersih = label.trim();
    if (bersih === '') return setGalat('Nama terminal wajib diisi.');

    setMendaftar(true);
    setGalat(null);
    try {
      const hasil = await onDaftarkan(bersih);
      setTokenBaru(hasil);
      setLabel('');
      setTersalin(false);
    } catch (err) {
      setGalat(describeApiError(err, 'Gagal mendaftarkan terminal.'));
    } finally {
      setMendaftar(false);
    }
  };

  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-warm-muted">
        Terminal POS
      </h2>
      <p className="mt-1 text-sm text-warm-muted">
        Perangkat yang dipercaya menagih di kafe ini. Kasir cukup memasukkan PIN
        di terminal terdaftar — tanpa mengetik email dan kata sandi tiap
        pergantian.
      </p>

      {tokenBaru && (
        <div className="mt-3 rounded-2xl border border-warm-amber/40 bg-warm-amber/5 p-4">
          <h3 className="text-sm font-semibold text-warm-espresso">
            Token untuk &ldquo;{tokenBaru.perangkat.label}&rdquo;
          </h3>
          <p className="mt-1 text-xs text-warm-muted">
            Muncul <strong>sekali ini saja</strong>. Buka CafeOS di terminal itu,
            lalu tempelkan token ini di layar pemasangan. Kalau hilang, cabut
            terminalnya dan daftarkan ulang.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-white px-3 py-2 font-mono text-xs text-warm-espresso">
              {tokenBaru.token}
            </code>
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(tokenBaru.token).then(
                  () => setTersalin(true),
                  () => setTersalin(false),
                );
              }}
              className="shrink-0 rounded-lg border border-warm-line bg-white px-3 py-2 text-xs font-medium text-warm-espresso transition hover:bg-warm-line/30"
            >
              {tersalin ? 'Tersalin' : 'Salin'}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setTokenBaru(null)}
            className="mt-2 text-xs font-medium text-warm-muted underline"
          >
            Sudah saya simpan — tutup
          </button>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="mis. Kasir Depan"
          className="min-w-0 flex-1 rounded-xl border border-warm-line bg-white px-3 py-2 text-sm text-warm-espresso outline-none focus:border-warm-amber"
        />
        <button
          type="button"
          onClick={() => void daftarkan()}
          disabled={mendaftar || sibuk}
          className="rounded-xl border border-warm-line px-4 py-2 text-sm font-medium text-warm-espresso transition hover:bg-warm-line/30 disabled:opacity-50"
        >
          {mendaftar ? 'Mendaftarkan…' : 'Daftarkan Terminal'}
        </button>
      </div>
      {galat && (
        <p role="alert" className="mt-1.5 text-sm font-medium text-warm-danger">
          {galat}
        </p>
      )}

      {loading ? (
        <div className="mt-3 skeleton-warm h-16 rounded-2xl" />
      ) : perangkat.length === 0 ? (
        <p className="mt-3 rounded-2xl border border-dashed border-warm-line px-4 py-6 text-center text-sm text-warm-muted">
          Belum ada terminal terdaftar.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {perangkat.map((p) => (
            <li
              key={p.id}
              className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warm-line bg-warm-paper/60 px-3.5 py-3 ${
                p.aktif ? '' : 'opacity-60'
              }`}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-warm-espresso">{p.label}</span>
                  {!p.aktif && (
                    <span className="rounded-md bg-warm-line/50 px-1.5 py-0.5 text-xs text-warm-muted">
                      Dicabut
                    </span>
                  )}
                  {p.shiftAktif && (
                    <span className="rounded-md bg-warm-success/15 px-1.5 py-0.5 text-xs font-medium text-warm-success">
                      {p.shiftAktif.kasir} sedang bertugas
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-warm-muted">
                  {p.terakhirDipakai
                    ? `Terakhir dipakai ${new Date(p.terakhirDipakai).toLocaleString('id-ID')}`
                    : 'Belum pernah dipakai'}
                </p>
              </div>

              {p.aktif && (
                <button
                  type="button"
                  disabled={sibuk}
                  onClick={() => onCabut(p)}
                  className="rounded-lg border border-warm-line px-2.5 py-1.5 text-xs font-medium text-warm-muted transition hover:bg-warm-line/30 disabled:opacity-50"
                >
                  Cabut
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
