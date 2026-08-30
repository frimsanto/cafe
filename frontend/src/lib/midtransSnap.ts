// Pemuatan Snap.js Midtrans secara DINAMIS (tidak di-hardcode di index.html):
// script disuntik saat dibutuhkan, dengan client-key & environment sesuai kafe
// yang sedang bertransaksi. Ini penting pada model multi-tenant — tiap kafe punya
// kredensial Midtrans sendiri, jadi client-key tidak bisa dipasang statis.

interface SnapCallbackResult {
  order_id?: string;
  transaction_status?: string;
  [key: string]: unknown;
}

interface SnapCallbacks {
  onSuccess?: (result: SnapCallbackResult) => void;
  onPending?: (result: SnapCallbackResult) => void;
  onError?: (result: SnapCallbackResult) => void;
  onClose?: () => void;
}

interface SnapGlobal {
  pay: (token: string, callbacks: SnapCallbacks) => void;
  /** Menutup popup. Tidak ada di semua versi Snap.js — selalu dipanggil opsional. */
  hide?: () => void;
}

declare global {
  interface Window {
    snap?: SnapGlobal;
  }
}

const SCRIPT_ID = 'midtrans-snap';

/**
 * Buang sisa UI Snap dari DOM.
 *
 * Snap menyuntikkan popup-nya sebagai anak langsung `<body>` (kontainer
 * `#snap-midtrans` berisi iframe) dan mengunci gulir halaman. Pada aplikasi
 * satu halaman, callback `onSuccess` diikuti `navigate()` — bukan reload — jadi
 * lapisan itu TETAP menempel di atas halaman berikutnya dan menelan setiap
 * klik. Inilah yang membuat tombol di halaman status pesanan tampak mati
 * setelah pembayaran berhasil.
 *
 * Penghapusan sengaja dibatasi pada anak langsung `<body>` yang memang milik
 * Snap (ditandai id/kelas, atau memuat iframe Midtrans) dan tidak pernah
 * menyentuh `#root` — supaya pembersihan tidak bisa ikut mencabut aplikasi.
 */
function bersihkanSisaSnap(): void {
  const root = document.getElementById('root');

  for (const el of Array.from(document.body.children)) {
    if (el === root || root?.contains(el)) continue;
    if (el.tagName === 'SCRIPT' || el.tagName === 'NOSCRIPT') continue;

    const penanda = `${el.id} ${el.getAttribute('class') ?? ''}`.toLowerCase();
    const memuatIframeSnap = el.querySelector('iframe[src*="midtrans"]') !== null;
    if (penanda.includes('snap') || memuatIframeSnap) el.remove();
  }

  // Kunci gulir yang dipasang Snap saat popup terbuka.
  document.body.style.removeProperty('overflow');
  document.body.style.removeProperty('position');
  document.documentElement.style.removeProperty('overflow');
}

/**
 * Tutup popup Snap lalu bersihkan sisanya. `hide()` tidak dipanggil dari dalam
 * `onClose` (popup memang sudah tertutup di situ, dan memanggilnya bisa memicu
 * callback yang sama sekali lagi).
 */
function tutupSnap(sudahTertutup: boolean): void {
  if (!sudahTertutup) {
    try {
      window.snap?.hide?.();
    } catch {
      /* versi Snap tanpa hide() — sisa DOM tetap dibersihkan di bawah */
    }
  }
  bersihkanSisaSnap();
}

export interface PayWithSnapParams extends SnapCallbacks {
  snapToken: string;
  clientKey: string;
  isProduction: boolean;
}

/**
 * Muat Snap.js (bila belum / berganti key) lalu buka popup pembayaran.
 *
 * Script lama dibuang & disuntik ulang setiap pemanggilan agar client-key selalu
 * sesuai kafe aktif. `onError` juga dipanggil bila script gagal dimuat.
 *
 * Apa pun hasilnya, popup ditutup dan sisanya dibersihkan SEBELUM callback
 * pemanggil berjalan — sehingga halaman tujuan (`navigate()`) langsung bisa
 * disentuh, tidak tertutup lapisan Snap yang menganggur.
 */
export function payWithSnap({
  snapToken,
  clientKey,
  isProduction,
  onSuccess,
  onPending,
  onError,
  onClose,
}: PayWithSnapParams): void {
  const existing = document.getElementById(SCRIPT_ID);
  if (existing) existing.remove();

  // Popup hanya perlu dibereskan sekali, apa pun callback yang lebih dulu tiba.
  let beres = false;
  const bereskan = (sudahTertutup = false) => {
    if (beres) return;
    beres = true;
    tutupSnap(sudahTertutup);
  };

  const script = document.createElement('script');
  script.id = SCRIPT_ID;
  script.src = isProduction
    ? 'https://app.midtrans.com/snap/snap.js'
    : 'https://app.sandbox.midtrans.com/snap/snap.js';
  script.setAttribute('data-client-key', clientKey);
  script.onload = () => {
    window.snap?.pay(snapToken, {
      onSuccess: (result) => {
        bereskan();
        onSuccess?.(result);
      },
      onPending: (result) => {
        bereskan();
        onPending?.(result);
      },
      onError: (result) => {
        bereskan();
        onError?.(result);
      },
      onClose: () => {
        bereskan(true);
        onClose?.();
      },
    });
  };
  script.onerror = () => {
    bereskan();
    onError?.({ transaction_status: 'error' });
  };
  document.head.appendChild(script);
}
