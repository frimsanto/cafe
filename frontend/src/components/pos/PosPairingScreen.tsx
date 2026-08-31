import { useState } from 'react';
import { usePos } from '../../pos/PosSessionContext';
import { describeApiError } from '../../lib/apiClient';

/**
 * Layar pemasangan terminal.
 *
 * Muncul ketika peramban ini belum punya cookie perangkat yang sah — terminal
 * baru, cookie terhapus, atau perangkat yang dicabut pemilik. Ketiganya sengaja
 * TIDAK dibedakan di layar: memberi tahu pemegang kredensial yang dicabut bahwa
 * miliknya "pernah sah" tidak menolong siapa pun kecuali dirinya.
 *
 * ── Yang diketik di sini adalah KODE, bukan token ──
 *
 * Sebelumnya layar ini meminta token 64 heksadesimal, dan itu tidak pernah
 * berhasil sekalipun di produksi: tidak ada manusia yang bisa membawa 64
 * karakter acak dari layar pemilik ke tablet kasir tanpa salah. Kode pemasangan
 * pendek, berjarak, dan memaafkan tiga salah ketik klasik (O↔0, I↔1, L↔1) —
 * server yang menormalkannya, jadi mengetik `O` saat layar menampilkan `0`
 * tetap berhasil.
 */
export default function PosPairingScreen() {
  const { pasang, galat: galatKonteks } = usePos();
  const [kode, setKode] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  const kirim = async () => {
    const bersih = kode.trim();
    if (bersih === '') {
      setGalat('Masukkan kode pemasangan dari halaman Manajemen Staf.');
      return;
    }
    setSibuk(true);
    setGalat(null);
    try {
      await pasang(bersih);
    } catch (err) {
      setGalat(describeApiError(err, 'Kode pemasangan tidak dikenali.'));
    } finally {
      setSibuk(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-warm-cream px-4">
      <div className="w-full max-w-md rounded-3xl border border-warm-line bg-warm-paper p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-warm-espresso">Pasang Terminal</h1>
        <p className="mt-1.5 text-sm text-warm-muted">
          Perangkat ini belum dikenali sebagai terminal kasir. Mintalah pemilik
          membuka <strong>Manajemen Staf → Terminal POS</strong>, mendaftarkan
          terminal, lalu membacakan kode pemasangannya.
        </p>

        <label className="mt-5 block">
          <span className="mb-1 block text-xs font-medium text-warm-muted">
            Kode pemasangan
          </span>
          <input
            value={kode}
            onChange={(e) => setKode(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !sibuk) void kirim();
            }}
            autoFocus
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            // `inputMode` bukan `type="number"`: kodenya memuat huruf, dan
            // tablet kasir harus memunculkan papan ketik yang memuat keduanya.
            inputMode="text"
            placeholder="KSR-XXXX-XXXX"
            className="w-full rounded-xl border border-warm-line bg-white px-3 py-3 text-center font-mono text-xl tracking-[0.2em] text-warm-espresso outline-none focus:border-warm-amber"
          />
        </label>

        <p className="mt-1.5 text-xs text-warm-muted">
          Tanda hubung boleh ikut diketik atau tidak. Kode berlaku 15 menit dan
          hanya sekali pakai.
        </p>

        {(galat ?? galatKonteks) && (
          <p role="alert" className="mt-2 text-sm font-medium text-warm-danger">
            {galat ?? galatKonteks}
          </p>
        )}

        <button
          type="button"
          onClick={() => void kirim()}
          disabled={sibuk}
          className="mt-4 w-full rounded-xl bg-warm-espresso px-4 py-3 text-sm font-semibold text-warm-cream transition hover:opacity-90 disabled:opacity-50"
        >
          {sibuk ? 'Memasang…' : 'Pasang Terminal'}
        </button>
      </div>
    </div>
  );
}
