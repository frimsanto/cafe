import { useEffect } from 'react';

/**
 * Peringatkan pengguna sebelum meninggalkan halaman dengan perubahan yang
 * belum disimpan.
 *
 * Menangani dua jalan keluar yang berbeda:
 *
 *   1. **Keluar dari aplikasi** — tutup tab, muat ulang, ketik URL lain.
 *      `beforeunload` yang menahannya; peramban menampilkan dialog bawaannya
 *      sendiri dan kalimat kita diabaikan (semua peramban modern begitu, demi
 *      mencegah halaman menakut-nakuti pengunjung).
 *   2. **Pindah halaman di dalam aplikasi** — menekan menu di sidebar.
 *      `beforeunload` TIDAK menyala untuk ini karena dokumennya tidak pernah
 *      dilepas. React Router v6.26 punya `useBlocker`, tapi hanya pada router
 *      berbasis data (`createBrowserRouter`) — aplikasi ini memakai
 *      `<BrowserRouter>`, jadi hook itu melempar saat dipanggil.
 *
 *      Yang dipakai di sini: menangkap klik pada tautan internal pada fase
 *      CAPTURE, lalu meminta konfirmasi sebelum React Router sempat menangani
 *      klik itu. Sederhana, tidak menuntut router diganti, dan cukup untuk
 *      satu-satunya jalan keluar yang benar-benar ada di layar ini (rel
 *      navigasi kiri).
 */
export function useUnsavedChanges(aktif: boolean, pesan: string): void {
  useEffect(() => {
    if (!aktif) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Nilai baliknya tidak lagi ditampilkan peramban mana pun, tapi sebagian
      // versi masih menuntutnya diisi agar dialognya muncul sama sekali.
      event.returnValue = pesan;
      return pesan;
    };

    const onClickCapture = (event: MouseEvent) => {
      // Klik kanan / tengah, atau dengan modifier (buka di tab baru) tidak
      // meninggalkan halaman ini — biarkan lewat.
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;

      const target = event.target as HTMLElement | null;
      const anchor = target?.closest?.('a');
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target === '_blank' || anchor.hasAttribute('download')) return;

      const href = anchor.getAttribute('href');
      if (!href || href.startsWith('#')) return;

      // Hanya tautan yang benar-benar berpindah halaman.
      const tujuan = new URL(anchor.href, window.location.href);
      if (tujuan.origin !== window.location.origin) return;
      if (tujuan.pathname === window.location.pathname) return;

      if (!window.confirm(pesan)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClickCapture, true);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      document.removeEventListener('click', onClickCapture, true);
    };
  }, [aktif, pesan]);
}
