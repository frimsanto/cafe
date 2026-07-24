import { API_BASE_URL } from './apiConfig';

// Klien Web Push: registrasi Service Worker, minta izin notifikasi, berlangganan
// (VAPID), lalu kirim langganan ke backend agar bisa dikirimi notifikasi
// "pesanan siap".

/** True bila browser mendukung Web Push. */
export function isPushSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    typeof window !== 'undefined' &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/** Konversi kunci VAPID base64url → Uint8Array untuk applicationServerKey. */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  // Bangun di atas ArrayBuffer eksplisit agar tipenya cocok dengan BufferSource.
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

export type SubscribeResult = 'ok' | 'unsupported' | 'denied' | 'disabled' | 'error';

/**
 * Aktifkan notifikasi push untuk sebuah pesanan. Best-effort — mengembalikan
 * status agar UI bisa memberi tahu pengguna, tanpa melempar error.
 */
export async function subscribeToOrderPush(
  cafeId: string,
  orderId: string,
): Promise<SubscribeResult> {
  if (!isPushSupported()) return 'unsupported';

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return 'denied';

    // Ambil kunci publik VAPID dari backend.
    const keyRes = await fetch(`${API_BASE_URL}/api/push/vapid-public-key`);
    const { publicKey, enabled } = (await keyRes.json()) as {
      publicKey?: string;
      enabled?: boolean;
    };
    if (!enabled || !publicKey) return 'disabled';

    const registration = await navigator.serviceWorker.register('/sw.js');
    await navigator.serviceWorker.ready;

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey),
    });

    const res = await fetch(
      `${API_BASE_URL}/api/cafes/${cafeId}/orders/${orderId}/push-subscription`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      },
    );
    if (!res.ok) return 'error';
    return 'ok';
  } catch (err) {
    console.warn('[cafeos] Gagal mengaktifkan notifikasi push:', err);
    return 'error';
  }
}
