import { useCallback, useEffect, useState } from 'react';
import { usePos } from '../../pos/PosSessionContext';
import { posApi } from '../../api/pos';
import { PosError } from '../../lib/posClient';
import { describeApiError } from '../../lib/apiClient';
import type { PetugasRingkasDTO } from '../../types/pos';

/**
 * Layar pergantian petugas: pilih nama, masukkan PIN.
 *
 * ── Apa yang boleh terlihat di layar ini ──
 *
 * Layar ini berdiri di area kasir dan terbaca siapa saja yang lewat — tamu yang
 * mengantre, kurir, siapa pun. Karena itu daftarnya hanya nama dan peran:
 * tidak ada email, tidak ada nomor HP, dan TIDAK ADA penanda "akun ini sedang
 * terkunci" pada daftarnya. Yang terakhir itu penting — penanda semacam itu
 * memberi tahu penebak akun mana yang sedang rapuh.
 *
 * ── Penguncian ditampilkan, keberadaan akun tidak ──
 *
 * Backend menjawab PIN salah dan staf tak dikenal dengan pesan yang sama persis
 * ("PIN salah. Coba lagi."), dan layar ini meneruskannya apa adanya. Penguncian
 * memang ditampilkan lengkap dengan hitung mundurnya — tapi itu baru muncul
 * SETELAH seseorang memilih nama yang ada di daftar, jadi ia tidak membocorkan
 * apa pun yang belum diketahui.
 */
export default function PosLockScreen() {
  const { perangkat, masuk } = usePos();

  const [petugas, setPetugas] = useState<PetugasRingkasDTO[]>([]);
  const [memuat, setMemuat] = useState(true);
  const [galatMuat, setGalatMuat] = useState<string | null>(null);

  const [dipilih, setDipilih] = useState<PetugasRingkasDTO | null>(null);
  const [pin, setPin] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);
  /** Detik tersisa penguncian; null bila tidak terkunci. */
  const [kunciDetik, setKunciDetik] = useState<number | null>(null);

  const muat = useCallback(async () => {
    setMemuat(true);
    try {
      setPetugas(await posApi.petugas());
      setGalatMuat(null);
    } catch (err) {
      setGalatMuat(describeApiError(err, 'Gagal memuat daftar petugas.'));
    } finally {
      setMemuat(false);
    }
  }, []);

  useEffect(() => {
    void muat();
  }, [muat]);

  // Hitung mundur penguncian — kasir melihat berapa lama lagi harus menunggu,
  // alih-alih menekan tombol berulang kali dan mendapat pesan yang sama.
  useEffect(() => {
    if (kunciDetik === null || kunciDetik <= 0) return;
    const id = setInterval(() => {
      setKunciDetik((n) => (n === null || n <= 1 ? null : n - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [kunciDetik]);

  const kembali = () => {
    setDipilih(null);
    setPin('');
    setGalat(null);
    setKunciDetik(null);
  };

  const kirim = async () => {
    if (!dipilih || pin.length < 4 || kunciDetik !== null) return;
    setSibuk(true);
    setGalat(null);
    try {
      await masuk(dipilih.id, pin);
    } catch (err) {
      setPin('');
      if (err instanceof PosError && err.status === 409) {
        // Pesan penguncian membawa sisa detiknya; diambil untuk hitung mundur.
        const cocok = /(\d+)\s*detik/.exec(err.message);
        setKunciDetik(cocok ? Number(cocok[1]) : 60);
        setGalat(err.message);
      } else {
        setGalat(describeApiError(err, 'PIN salah. Coba lagi.'));
      }
    } finally {
      setSibuk(false);
    }
  };

  const tekanAngka = (angka: string) => {
    if (kunciDetik !== null) return;
    setGalat(null);
    setPin((p) => (p.length >= 6 ? p : p + angka));
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-warm-cream px-4 py-8">
      <header className="mb-6 text-center">
        <p className="text-xs uppercase tracking-wide text-warm-muted">
          {perangkat?.label ?? 'Terminal Kasir'}
        </p>
        <h1 className="mt-1 text-xl font-semibold text-warm-espresso">
          {dipilih ? `Masukkan PIN — ${dipilih.name}` : 'Siapa yang bertugas?'}
        </h1>
      </header>

      <div className="w-full max-w-md rounded-3xl border border-warm-line bg-warm-paper p-5 shadow-sm">
        {!dipilih ? (
          <>
            {memuat ? (
              <div className="space-y-2" aria-busy="true">
                <span className="sr-only">Memuat daftar petugas…</span>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="skeleton-warm h-14 rounded-2xl" />
                ))}
              </div>
            ) : galatMuat ? (
              <div role="alert" className="text-center">
                <p className="text-sm font-medium text-warm-danger">{galatMuat}</p>
                <button
                  type="button"
                  onClick={() => void muat()}
                  className="mt-3 rounded-xl border border-warm-line px-4 py-2 text-sm font-medium text-warm-espresso"
                >
                  Coba lagi
                </button>
              </div>
            ) : petugas.length === 0 ? (
              <p className="py-8 text-center text-sm text-warm-muted">
                Belum ada staf yang punya PIN. Mintalah pemilik menetapkan PIN di
                halaman Manajemen Staf.
              </p>
            ) : (
              <ul className="space-y-2">
                {petugas.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => setDipilih(p)}
                      className="flex w-full items-center gap-3 rounded-2xl border border-warm-line bg-white px-4 py-3 text-left transition hover:border-warm-amber hover:bg-warm-amber/5"
                    >
                      <span
                        aria-hidden
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warm-line/50 text-sm font-semibold text-warm-espresso"
                      >
                        {p.name.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-warm-espresso">
                          {p.name}
                        </span>
                        <span className="block text-xs text-warm-muted">
                          {p.role === 'OWNER' ? 'Pemilik' : 'Kasir'}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <>
            {/* Titik-titik, bukan angkanya: PIN diketik di layar yang terlihat
                antrean tamu. */}
            <div className="flex justify-center gap-2.5 py-2" aria-hidden>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <span
                  key={i}
                  className={`h-3 w-3 rounded-full transition ${
                    i < pin.length ? 'bg-warm-amber' : 'bg-warm-line'
                  }`}
                />
              ))}
            </div>
            <label className="sr-only" htmlFor="pin-pos">
              PIN
            </label>
            <input
              id="pin-pos"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void kirim();
              }}
              type="password"
              inputMode="numeric"
              autoComplete="off"
              autoFocus
              disabled={kunciDetik !== null}
              className="sr-only"
            />

            {galat && (
              <p role="alert" className="mt-2 text-center text-sm font-medium text-warm-danger">
                {galat}
              </p>
            )}
            {kunciDetik !== null && (
              <p className="mt-1 text-center text-sm font-medium text-warm-amber">
                Coba lagi dalam {kunciDetik} detik.
              </p>
            )}

            {/* Papan angka: terminal kasir sering layar sentuh tanpa papan
                ketik fisik. */}
            <div className="mt-4 grid grid-cols-3 gap-2">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => tekanAngka(a)}
                  disabled={kunciDetik !== null}
                  className="rounded-xl border border-warm-line bg-white py-4 text-lg font-semibold text-warm-espresso transition hover:bg-warm-line/30 disabled:opacity-40"
                >
                  {a}
                </button>
              ))}
              <button
                type="button"
                onClick={kembali}
                className="rounded-xl border border-warm-line py-4 text-sm font-medium text-warm-muted transition hover:bg-warm-line/30"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => tekanAngka('0')}
                disabled={kunciDetik !== null}
                className="rounded-xl border border-warm-line bg-white py-4 text-lg font-semibold text-warm-espresso transition hover:bg-warm-line/30 disabled:opacity-40"
              >
                0
              </button>
              <button
                type="button"
                onClick={() => setPin((p) => p.slice(0, -1))}
                disabled={kunciDetik !== null}
                className="rounded-xl border border-warm-line py-4 text-sm font-medium text-warm-muted transition hover:bg-warm-line/30 disabled:opacity-40"
              >
                Hapus
              </button>
            </div>

            <button
              type="button"
              onClick={() => void kirim()}
              disabled={sibuk || pin.length < 4 || kunciDetik !== null}
              className="mt-3 w-full rounded-xl bg-warm-amber px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-95 disabled:opacity-50"
            >
              {sibuk ? 'Memeriksa…' : 'Masuk'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
