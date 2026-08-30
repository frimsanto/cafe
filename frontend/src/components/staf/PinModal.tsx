import { useEffect, useState } from 'react';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';

interface Props {
  nama: string;
  sudahPunyaPin: boolean;
  busy: boolean;
  onTutup: () => void;
  onSimpan: (pin: string) => void;
}

/** Pola PIN yang paling sering dicoba penebak — ditolak di sini DAN di server. */
const POLA_LEMAH = new Set([
  '0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999',
  '1234', '4321', '0123', '3210', '1122', '1212', '2121',
  '000000', '111111', '222222', '333333', '444444', '555555',
  '666666', '777777', '888888', '999999', '123456', '654321', '121212',
]);

/**
 * Menetapkan / mengganti PIN seorang staf.
 *
 * ── Kenapa PIN lama tidak pernah ditampilkan ──
 *
 * Tidak ada tempat di sistem ini yang bisa membacanya: server hanya menyimpan
 * hash bcrypt-nya. Itu berarti "lupa PIN" selalu diselesaikan dengan MENGGANTI,
 * dan pemilik menyampaikan yang baru langsung kepada stafnya. Modal ini
 * mengatakannya terus terang alih-alih membiarkan pemilik mencari-cari tombol
 * "lihat PIN" yang memang tidak akan pernah ada.
 *
 * Diketik dua kali karena PIN salah ketik baru ketahuan saat staf berdiri di
 * depan terminal dan gagal masuk — jauh dari orang yang bisa memperbaikinya.
 */
export default function PinModal({ nama, sudahPunyaPin, busy, onTutup, onSimpan }: Props) {
  const [pin, setPin] = useState('');
  const [ulang, setUlang] = useState('');
  const [galat, setGalat] = useState<string | null>(null);

  useBodyScrollLock();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onTutup();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onTutup, busy]);

  const kirim = () => {
    setGalat(null);
    if (!/^\d{4,6}$/.test(pin)) return setGalat('PIN harus 4-6 angka.');
    if (POLA_LEMAH.has(pin)) {
      return setGalat('PIN itu terlalu mudah ditebak. Pilih kombinasi lain.');
    }
    if (pin !== ulang) return setGalat('Dua PIN yang kamu ketik berbeda.');
    onSimpan(pin);
  };

  const kolom = (
    nilai: string,
    set: (v: string) => void,
    label: string,
    autoFocus = false,
  ) => (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-warm-muted">{label}</span>
      <input
        value={nilai}
        onChange={(e) => set(e.target.value.replace(/\D/g, '').slice(0, 6))}
        // `password` supaya tidak terbaca orang lain yang berdiri di dekat
        // layar pemilik — PIN ini akan dipakai di area kasir yang ramai.
        type="password"
        inputMode="numeric"
        autoComplete="off"
        autoFocus={autoFocus}
        className="w-full rounded-xl border border-warm-line bg-white px-3 py-2.5 text-center font-mono text-lg tracking-[0.5em] text-warm-espresso outline-none focus:border-warm-amber"
      />
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-sm rounded-t-3xl bg-warm-paper shadow-xl sm:rounded-3xl">
        <header className="border-b border-warm-line px-5 py-4">
          <h2 className="text-lg font-semibold text-warm-espresso">
            {sudahPunyaPin ? 'Reset PIN' : 'Atur PIN'} — {nama}
          </h2>
          <p className="mt-1 text-xs text-warm-muted">
            {sudahPunyaPin
              ? 'PIN lama tidak bisa dibaca siapa pun, termasuk kamu. Yang bisa dilakukan adalah menggantinya.'
              : 'Dipakai untuk membuka sesi di terminal kasir, tanpa mengetik email dan kata sandi.'}
          </p>
        </header>

        <div className="space-y-3 px-5 py-4">
          {kolom(pin, setPin, 'PIN baru (4-6 angka)', true)}
          {kolom(ulang, setUlang, 'Ketik ulang')}

          {galat && (
            <p role="alert" className="text-sm font-medium text-warm-danger">
              {galat}
            </p>
          )}

          <p className="rounded-xl bg-warm-line/30 px-3 py-2 text-xs text-warm-muted">
            Sampaikan PIN ini langsung kepada {nama}. Setelah disimpan, ia tidak
            bisa ditampilkan lagi dari halaman mana pun.
          </p>
        </div>

        <footer className="flex justify-end gap-2 border-t border-warm-line px-5 py-3">
          <button
            type="button"
            onClick={onTutup}
            disabled={busy}
            className="rounded-xl px-4 py-2 text-sm font-medium text-warm-muted transition hover:bg-warm-line/30 disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={kirim}
            disabled={busy}
            className="rounded-xl bg-warm-amber px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-95 disabled:opacity-50"
          >
            {busy ? 'Menyimpan…' : 'Simpan PIN'}
          </button>
        </footer>
      </div>
    </div>
  );
}
