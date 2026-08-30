import { useId } from 'react';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Label yang dibacakan pembaca layar. Wajib — sakelar tanpa nama tak terpakai. */
  label: string;
  /** Tampilkan label di samping sakelar; bila false hanya untuk pembaca layar. */
  showLabel?: boolean;
  disabled?: boolean;
  /** Penjelasan tambahan; dirujuk `aria-describedby`. */
  describedBy?: string;
}

/**
 * Sakelar hidup/mati bergaya "Cafe Ambient".
 *
 * Dibangun di atas `<input type="checkbox">` yang disembunyikan secara visual —
 * bukan `<div role="switch">` — sehingga papan ketik dan pembaca layar bekerja
 * tanpa satu baris pun kode tambahan. `peer-*` Tailwind yang menggambar keadaan
 * aktif dan cincin fokusnya.
 *
 * Rel dan kenopnya sengaja SAMA-SAMA anak langsung `<label>`, bersaudara dengan
 * input. Varian `peer-*` Tailwind menghasilkan selektor saudara (`~`), jadi
 * kenop yang bersarang di dalam rel tidak akan pernah ikut bergeser saat
 * sakelar dinyalakan.
 *
 * Menggantikan kotak centang kecil di halaman pengaturan lama: metode
 * pembayaran adalah sesuatu yang DINYALAKAN dan DIMATIKAN, dan sakelar
 * menyampaikan itu tanpa perlu dibaca dua kali.
 */
export default function Switch({
  checked,
  onChange,
  label,
  showLabel = false,
  disabled = false,
  describedBy,
}: SwitchProps) {
  const id = useId();

  return (
    <label
      htmlFor={id}
      className={`relative inline-flex select-none items-center gap-2.5 ${
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
      }`}
    >
      <input
        id={id}
        type="checkbox"
        role="switch"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        aria-describedby={describedBy}
        onChange={(e) => onChange(e.target.checked)}
      />

      {/* Rel */}
      <span
        aria-hidden="true"
        className="h-6 w-11 shrink-0 rounded-full bg-warm-espresso/20 transition-colors peer-checked:bg-warm-success peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-warm-amber"
      />

      {/* Kenop — saudara rel, bukan anaknya (lihat catatan di atas). */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-0.5 top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow-sm transition-transform duration-200 peer-checked:translate-x-5"
      />

      <span className={showLabel ? 'text-sm font-medium text-warm-espresso' : 'sr-only'}>
        {label}
      </span>
    </label>
  );
}
