import { useState } from 'react';
import { usePos } from '../../pos/PosSessionContext';
import { describeApiError } from '../../lib/apiClient';

/**
 * Layar pemasangan terminal.
 *
 * Muncul ketika peramban ini belum punya cookie perangkat yang sah — terminal
 * baru, cookie terhapus, atau perangkat yang dicabut pemilik. Ketiganya sengaja
 * TIDAK dibedakan di layar: memberi tahu pemegang token yang dicabut bahwa
 * tokennya "pernah sah" tidak menolong siapa pun kecuali dirinya.
 *
 * Tokennya diketik/ditempel sekali, lalu ditukar dengan cookie HttpOnly yang
 * tidak bisa dibaca JavaScript. Sesudah itu tidak ada tempat di aplikasi ini
 * yang memegang token perangkat — termasuk kode kita sendiri.
 */
export default function PosPairingScreen() {
  const { pasang, galat: galatKonteks } = usePos();
  const [token, setToken] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  const kirim = async () => {
    const bersih = token.trim();
    if (bersih === '') {
      setGalat('Tempelkan token terminal dari halaman Manajemen Staf.');
      return;
    }
    setSibuk(true);
    setGalat(null);
    try {
      await pasang(bersih);
    } catch (err) {
      setGalat(describeApiError(err, 'Token terminal tidak dikenali.'));
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
          terminal baru, lalu menyalin tokennya ke sini.
        </p>

        <label className="mt-5 block">
          <span className="mb-1 block text-xs font-medium text-warm-muted">
            Token terminal
          </span>
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            placeholder="Tempelkan token di sini"
            className="w-full rounded-xl border border-warm-line bg-white px-3 py-2.5 font-mono text-sm text-warm-espresso outline-none focus:border-warm-amber"
          />
        </label>

        {(galat ?? galatKonteks) && (
          <p role="alert" className="mt-2 text-sm font-medium text-warm-danger">
            {galat ?? galatKonteks}
          </p>
        )}

        <button
          type="button"
          onClick={() => void kirim()}
          disabled={sibuk}
          className="mt-4 w-full rounded-xl bg-warm-amber px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-95 disabled:opacity-50"
        >
          {sibuk ? 'Memasang…' : 'Pasang Terminal'}
        </button>

        <p className="mt-4 rounded-xl bg-warm-line/30 px-3 py-2 text-xs text-warm-muted">
          Token hanya diketik sekali. Sesudah terpasang ia tersimpan sebagai
          cookie yang tidak bisa dibaca halaman mana pun, dan tidak akan diminta
          lagi kecuali pemilik mencabut terminal ini.
        </p>
      </div>
    </div>
  );
}
