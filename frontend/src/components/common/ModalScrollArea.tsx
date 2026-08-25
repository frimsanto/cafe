import type { ReactNode } from 'react';

interface ModalScrollAreaProps {
  /** Kelas tambahan, mis. padding atau jarak antar kolom isian. */
  className?: string;
  children: ReactNode;
}

/**
 * Badan modal yang bisa digulir sendiri, di antara kepala dan tombol yang diam.
 *
 * `data-lenis-prevent` wajib ada: Lenis (smooth scroll global di `App.tsx`)
 * menangkap wheel & touch di seluruh halaman lalu `preventDefault()` — tanpa
 * penanda ini, menggulir di dalam modal justru menggeser halaman di belakangnya
 * meski modal sudah punya `overflow-y-auto`.
 *
 * `overscroll-contain` menahan gulir agar tidak merambat ke halaman saat isi
 * modal sudah mentok di ujung atas/bawah, dan `min-h-0` membuat elemen ini
 * benar-benar menyusut di dalam induk `flex flex-col` (bawaan flex item adalah
 * `min-height: auto`, yang membuatnya melar dan gulirnya hilang).
 *
 * Kelas `modal-scroll-area` hanya dipakai aturan `@media print` di `index.css`
 * agar isi yang lebih tinggi dari layar tidak terpotong saat dicetak.
 */
export default function ModalScrollArea({
  className = '',
  children,
}: ModalScrollAreaProps) {
  return (
    <div
      data-lenis-prevent
      // Lapis kedua selain `data-lenis-prevent`, khusus sentuhan: Lenis
      // memasang `touchmove` di `window`, sedangkan React memasang penangannya
      // di wadah root — menghentikan rambatan di sini membuat event tidak
      // pernah sampai ke Lenis, apa pun hasil penelusuran penandanya.
      onTouchMove={(event) => event.stopPropagation()}
      className={`modal-scroll-area min-h-0 flex-1 overflow-y-auto overscroll-contain ${className}`}
    >
      {children}
    </div>
  );
}
