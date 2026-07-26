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
}

declare global {
  interface Window {
    snap?: SnapGlobal;
  }
}

const SCRIPT_ID = 'midtrans-snap';

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

  const script = document.createElement('script');
  script.id = SCRIPT_ID;
  script.src = isProduction
    ? 'https://app.midtrans.com/snap/snap.js'
    : 'https://app.sandbox.midtrans.com/snap/snap.js';
  script.setAttribute('data-client-key', clientKey);
  script.onload = () => {
    window.snap?.pay(snapToken, { onSuccess, onPending, onError, onClose });
  };
  script.onerror = () => {
    onError?.({ transaction_status: 'error' });
  };
  document.head.appendChild(script);
}
