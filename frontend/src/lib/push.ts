import { API_BASE_URL } from './apiConfig';

// Klien Web Push: registrasi Service Worker, minta izin notifikasi, berlangganan
// (VAPID), lalu kirim langganan ke backend agar bisa dikirimi notifikasi
// "pesanan siap".

/** Laci bersama halaman ↔ Service Worker — lihat `public/sw.js`. */
const CACHE_KONTEKS = 'cafeos-push-ctx';
const KUNCI_KONTEKS = '/__cafeos_push_ctx';

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

/**
 * Daftarkan Service Worker saat aplikasi dimuat — dipanggil sekali dari
 * `main.tsx`.
 *
 * Sebelumnya pendaftaran hanya terjadi di dalam `subscribeToOrderPush`, yaitu
 * saat tamu menekan "Aktifkan". Akibatnya Service Worker baru ada setelah
 * tombol itu ditekan, dan pemasangannya berebut waktu dengan permintaan
 * langganan pada klik yang sama. Mendaftarkannya di awal membuat pekerja sudah
 * aktif dan siap menerima push jauh sebelum dibutuhkan — termasuk saat tab
 * ditutup, yang justru merupakan keadaan normal bagi Web Push.
 *
 * Aman dipanggil berkali-kali: peramban menyamakan pendaftaran dengan URL &
 * scope yang sama alih-alih membuat pekerja kedua.
 */
export function registerServiceWorker(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((err: unknown) => {
    // Gagal mendaftar bukan alasan menghentikan aplikasi — halaman tetap
    // berfungsi penuh, hanya notifikasi latar yang tidak tersedia.
    console.warn('[cafeos] Service Worker gagal didaftarkan:', err);
  });
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

/** Kunci publik VAPID dari server, atau null bila push belum aktif di sana. */
async function ambilVapid(): Promise<string | null> {
  const res = await fetch(`${API_BASE_URL}/api/push/vapid-public-key`);
  if (!res.ok) return null;
  const { publicKey, enabled } = (await res.json()) as {
    publicKey?: string;
    enabled?: boolean;
  };
  if (!enabled || !publicKey) return null;
  return publicKey;
}

/**
 * Titipkan bekal untuk `pushsubscriptionchange` di Cache Storage.
 *
 * Peristiwa itu berjalan tanpa halaman terbuka, jadi Service Worker perlu
 * salinannya sendiri: ia tidak bisa membaca localStorage maupun variabel modul
 * ini.
 */
async function simpanKonteks(cafeId: string, orderId: string, vapidKey: string) {
  try {
    const cache = await caches.open(CACHE_KONTEKS);
    await cache.put(
      KUNCI_KONTEKS,
      new Response(
        JSON.stringify({ apiBase: API_BASE_URL, cafeId, orderId, vapidKey }),
        { headers: { 'Content-Type': 'application/json' } },
      ),
    );
  } catch {
    // Cache Storage ditolak (mode privat) — pemutaran langganan tidak bisa
    // diperbaiki otomatis, tapi langganan yang sekarang tetap berfungsi.
  }
}

/** Kirim langganan ke backend; true bila tercatat. */
async function daftarkanKeServer(
  cafeId: string,
  orderId: string,
  sub: PushSubscription,
): Promise<boolean> {
  const res = await fetch(
    `${API_BASE_URL}/api/cafes/${encodeURIComponent(cafeId)}/orders/${encodeURIComponent(orderId)}/push-subscription`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // `toJSON()` menghasilkan tepat bentuk yang diharapkan server:
      // { endpoint, keys: { p256dh, auth } } — ketiganya wajib, dan server
      // menolak (400) bila salah satu kosong.
      body: JSON.stringify(sub.toJSON()),
    },
  );
  return res.ok;
}

/**
 * Langganan push untuk pekerja ini — pakai ulang yang sudah ada, buat bila belum.
 *
 * Memanggil `subscribe()` di atas langganan yang masih hidup dengan kunci VAPID
 * yang sama memang mengembalikan langganan yang sama, tapi akan MELEMPAR
 * `InvalidStateError` bila kuncinya berbeda (mis. server berganti pasangan
 * VAPID). Dengan memeriksa lebih dulu, kasus itu bisa ditangani: yang lama
 * dibuang, lalu berlangganan bersih dengan kunci baru — alih-alih tamu
 * terjebak pada langganan yang selamanya ditolak server.
 */
async function pastikanLangganan(
  registration: ServiceWorkerRegistration,
  publicKey: string,
): Promise<PushSubscription> {
  const kunci = urlBase64ToUint8Array(publicKey);
  const adaSebelumnya = await registration.pushManager.getSubscription();
  if (adaSebelumnya) {
    try {
      return await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: kunci,
      });
    } catch {
      await adaSebelumnya.unsubscribe();
    }
  }
  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: kunci,
  });
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

    const publicKey = await ambilVapid();
    if (!publicKey) return 'disabled';

    // Pendaftaran sudah dilakukan saat aplikasi dimuat; `ready` menunggu
    // pekerjanya benar-benar aktif alih-alih mendaftarkan yang kedua.
    const registration = await navigator.serviceWorker.ready;
    const subscription = await pastikanLangganan(registration, publicKey);

    await simpanKonteks(cafeId, orderId, publicKey);
    return (await daftarkanKeServer(cafeId, orderId, subscription)) ? 'ok' : 'error';
  } catch (err) {
    console.warn('[cafeos] Gagal mengaktifkan notifikasi push:', err);
    return 'error';
  }
}

/**
 * Samakan langganan yang SUDAH ada dengan pesanan yang sedang dibuka — tanpa
 * bertanya apa pun kepada tamu.
 *
 * Ini menambal celah yang membuat notifikasi berhenti masuk tanpa gejala: satu
 * perangkat hanya punya SATU langganan push (kunci uniknya `endpoint`), dan
 * baris itu menunjuk ke satu pesanan. Tamu yang mengaktifkan notifikasi pada
 * pesanan pertama lalu memesan lagi tidak pernah melihat ajakan "Aktifkan"
 * untuk pesanan kedua — izinnya sudah `granted`, jadi ajakannya menyingkir —
 * sementara langganannya masih tertaut ke pesanan LAMA. Pesanan barunya siap,
 * server mengirim ke perangkat yang berlangganan pesanan itu, dan ponsel tamu
 * tetap membisu.
 *
 * Dipanggil di setiap pembukaan halaman status. Diam total kalau izinnya belum
 * diberikan — memanggil `subscribe()` saat itu justru akan memunculkan dialog
 * izin tanpa tamu meminta apa pun.
 */
export async function syncOrderPushSubscription(
  cafeId: string,
  orderId: string,
): Promise<void> {
  if (!isPushSupported() || Notification.permission !== 'granted') return;
  try {
    const publicKey = await ambilVapid();
    if (!publicKey) return;

    const registration = await navigator.serviceWorker.ready;
    const subscription = await pastikanLangganan(registration, publicKey);

    await simpanKonteks(cafeId, orderId, publicKey);
    await daftarkanKeServer(cafeId, orderId, subscription);
  } catch (err) {
    console.warn('[cafeos] Gagal menyelaraskan langganan push:', err);
  }
}
