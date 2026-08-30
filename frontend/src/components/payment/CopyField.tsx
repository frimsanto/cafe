import { useEffect, useRef, useState } from 'react';
import PaymentIcon from './PaymentIcon';

interface CopyFieldProps {
  label: string;
  value: string;
  /** Keterangan kecil di bawah kolom. */
  hint?: string;
}

/**
 * Kolom teks read-only dengan tombol salin.
 *
 * Dibuat untuk URL notifikasi Midtrans, yang panjang dan harus disalin utuh —
 * sebelumnya ia dicetak sebagai `<code>` telanjang yang harus diseret manual,
 * dan satu karakter yang terlewat berarti webhook tidak pernah sampai.
 *
 * Teksnya membungkus (`break-all`) sehingga tidak pernah memaksa halaman
 * menggulir ke samping di layar sempit.
 */
export default function CopyField({ label, value, hint }: CopyFieldProps) {
  const [tersalin, setTersalin] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  const salin = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard API butuh konteks aman (https) dan izin. Kalau ditolak,
      // kita mundur ke pemilihan teks: pengguna masih bisa menekan Ctrl+C, dan
      // itu jauh lebih berguna daripada pesan galat.
      const el = document.getElementById(`copy-${label}`);
      if (el instanceof HTMLInputElement) el.select();
      return;
    }
    setTersalin(true);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setTersalin(false), 2000);
  };

  return (
    <div>
      <label
        htmlFor={`copy-${label}`}
        className="mb-1.5 block text-sm font-medium text-warm-subtle"
      >
        {label}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
        <input
          id={`copy-${label}`}
          type="text"
          readOnly
          value={value}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 rounded-xl border-0 bg-warm-cream px-3.5 py-2.5 font-mono text-xs text-warm-espresso ring-1 ring-warm-line focus:outline-none focus:ring-2 focus:ring-warm-amber"
        />
        <button
          type="button"
          onClick={() => void salin()}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-warm-espresso/10 px-4 py-2.5 text-sm font-semibold text-warm-subtle transition hover:bg-warm-espresso/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-warm-amber focus-visible:ring-offset-2"
        >
          <PaymentIcon name={tersalin ? 'check' : 'salin'} size={16} />
          {tersalin ? 'Tersalin' : 'Salin'}
        </button>
      </div>
      {/* `aria-live` supaya pemakai pembaca layar tahu penyalinan berhasil —
          perubahan label tombol saja tidak selalu diumumkan. */}
      <span className="sr-only" aria-live="polite">
        {tersalin ? `${label} tersalin ke papan klip` : ''}
      </span>
      {hint && <p className="mt-1.5 text-xs text-warm-muted">{hint}</p>}
    </div>
  );
}
