import { useEffect } from 'react';

/**
 * Berapa banyak lapisan (modal/drawer) yang sedang mengunci gulir. Dihitung
 * karena satu modal bisa memunculkan modal lain di atasnya — mis. dialog
 * konfirmasi hapus di atas formulir. Kunci baru dilepas setelah lapisan
 * terakhir tertutup.
 */
let lockCount = 0;

/** Pengembali gaya `body` ke keadaan sebelum dikunci. */
let restore: (() => void) | null = null;

/**
 * Dipancarkan ke `window` saat lapisan kunci pertama dibuka dan saat lapisan
 * terakhir ditutup — bukan pada setiap modal. `App.tsx` mendengarkannya untuk
 * menghentikan/melanjutkan Lenis; lihat catatan di sana.
 */
export const MODAL_OPEN_EVENT = 'modal:open';
export const MODAL_CLOSE_EVENT = 'modal:close';

/**
 * Apakah ada modal/drawer yang sedang mengunci gulir. Dipakai `App.tsx` agar
 * Lenis yang baru dipasang (mis. saat StrictMode menjalankan efek dua kali,
 * atau setelah HMR) ikut berhenti walau event `modal:open` sudah lewat.
 */
export function isScrollLocked() {
  return lockCount > 0;
}

/**
 * Mengunci gulir halaman selama modal/drawer terbuka, supaya roda mouse dan
 * sentuhan menggulirkan isi modal — bukan halaman di belakangnya.
 *
 * Lebar bilah gulir yang hilang diganti `padding-right` pada `body` agar tata
 * letak di belakang modal tidak melompat ke kanan saat modal dibuka.
 *
 * @param active Kunci hanya aktif saat bernilai `true` — memudahkan pemakaian
 *   pada komponen yang selalu ter-render, seperti laci navigasi.
 */
export function useBodyScrollLock(active = true) {
  useEffect(() => {
    if (!active) return;

    if (lockCount === 0) {
      const { body } = document;
      const previousOverflow = body.style.overflow;
      const previousPaddingRight = body.style.paddingRight;
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

      body.style.overflow = 'hidden';
      if (scrollbarWidth > 0) {
        body.style.paddingRight = `${scrollbarWidth}px`;
      }

      restore = () => {
        body.style.overflow = previousOverflow;
        body.style.paddingRight = previousPaddingRight;
      };

      window.dispatchEvent(new CustomEvent(MODAL_OPEN_EVENT));
    }

    lockCount += 1;

    return () => {
      lockCount -= 1;
      if (lockCount === 0) {
        restore?.();
        restore = null;
        // Setelah `body` pulih, supaya Lenis menyelaraskan diri ke posisi
        // gulir yang sebenarnya saat dilanjutkan.
        window.dispatchEvent(new CustomEvent(MODAL_CLOSE_EVENT));
      }
    };
  }, [active]);
}

export default useBodyScrollLock;
