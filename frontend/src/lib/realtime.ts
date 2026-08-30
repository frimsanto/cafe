import { WS_BASE_URL } from './apiConfig';

/**
 * Klien WebSocket realtime.
 *
 * Protokol mengikuti server (`backend/src/realtime/realtime.ts`):
 *   klien → server : { type: 'subscribe', cafeId, orderId? }
 *   server → klien : { type: <event>, data: <payload> }
 *
 * Langganan juga dikirim lewat query saat menyambung, lalu DIULANG sebagai
 * pesan `subscribe` setelah `open`. Pengulangan ini penting: saat sambungan
 * putus dan tersambung lagi, server tidak mengingat langganan lama.
 *
 * `orderId` mempersempit langganan ke satu pesanan — dipakai halaman pelanggan
 * supaya ponsel tamu tidak ikut menerima aliran pesanan kafe seluruhnya. Layar
 * staf memanggilnya tanpa `orderId` dan tetap mendapat semuanya.
 */

/** Nama event yang dipancarkan server. */
export type RealtimeEvent =
  | 'kitchen.order.created'
  | 'kitchen.order.updated'
  | 'order.ready'
  | 'table.status.changed'
  | 'payment.status.changed'
  | 'dashboard.order.paid'
  | 'connected'
  | 'subscribed';

export interface RealtimeMessage {
  type: RealtimeEvent | string;
  data?: unknown;
  cafeId?: string;
}

type Listener = (message: RealtimeMessage) => void;

/**
 * Keadaan sambungan, untuk indikator di layar.
 *
 * `offline` bersifat FINAL: percobaan sudah habis dan tidak ada sambung ulang
 * otomatis lagi. Layar yang menampilkannya sebaiknya menyediakan tombol coba
 * lagi, dan sementara itu bersandar pada polling.
 */
export type RealtimeStatus = 'connecting' | 'online' | 'reconnecting' | 'offline';

/** Jeda sambung ulang: 1s → 2s → 4s → 8s → 16s, dibatasi 30 detik. */
const BASE_RETRY_MS = 1_000;
const MAX_RETRY_MS = 30_000;

/** Setelah sekian percobaan beruntun gagal, berhenti dan menyerah. */
const MAX_ATTEMPTS = 5;

/**
 * Sambungan baru dianggap benar-benar pulih setelah bertahan selama ini.
 *
 * Penting: hitungan percobaan TIDAK boleh di-reset tepat saat `open`. Proxy yang
 * salah konfigurasi kerap menerima handshake lalu langsung menutupnya — pola
 * open→close cepat itu membuat hitungan selalu kembali ke nol, dan jeda tidak
 * pernah naik. Hasilnya sambung ulang tiap 1 detik tanpa henti, persis yang
 * membanjiri console dengan galat WebSocket.
 */
const STABLE_AFTER_MS = 10_000;

export interface RealtimeOptions {
  /** Dipanggil setiap keadaan sambungan berubah. */
  onStatus?: (status: RealtimeStatus) => void;
  /** Persempit langganan ke satu pesanan (halaman status pelanggan). */
  orderId?: string;
}

/**
 * Sambungkan ke kanal realtime sebuah kafe.
 *
 * Mengembalikan fungsi pemutus; panggil saat komponen dilepas supaya tidak ada
 * sambungan menganggur yang terus mencoba menyambung ulang.
 */
export function subscribeRealtime(
  cafeId: string,
  onMessage: Listener,
  options: RealtimeOptions = {},
): () => void {
  const { onStatus, orderId } = options;

  let socket: WebSocket | null = null;
  /** Melepas listener soket yang sedang aktif — dipasang ulang tiap connect. */
  let detachSocket: (() => void) | null = null;
  let attempt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let stableTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;
  let status: RealtimeStatus | null = null;

  // Status hanya dilaporkan saat benar-benar berubah, dan tidak pernah setelah
  // pemutusan — pemanggil biasanya menyimpannya ke state React, dan pembaruan
  // state pada komponen yang sudah dilepas adalah kebocoran.
  const setStatus = (next: RealtimeStatus) => {
    if (closed || status === next) return;
    status = next;
    onStatus?.(next);
  };

  const clearStableTimer = () => {
    if (stableTimer) {
      clearTimeout(stableTimer);
      stableTimer = null;
    }
  };

  const connect = () => {
    if (closed) return;
    setStatus(attempt === 0 ? 'connecting' : 'reconnecting');

    const url =
      `${WS_BASE_URL}?cafeId=${encodeURIComponent(cafeId)}` +
      (orderId ? `&orderId=${encodeURIComponent(orderId)}` : '');
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      // URL tidak sah / protokol diblokir — tidak ada soket yang perlu dibersihkan.
      scheduleRetry();
      return;
    }
    socket = ws;

    const handleOpen = () => {
      setStatus('online');
      ws.send(JSON.stringify({ type: 'subscribe', cafeId, orderId }));
      clearStableTimer();
      stableTimer = setTimeout(() => {
        stableTimer = null;
        attempt = 0;
      }, STABLE_AFTER_MS);
    };

    const handleMessage = (event: MessageEvent) => {
      try {
        onMessage(JSON.parse(String(event.data)) as RealtimeMessage);
      } catch {
        /* pesan bukan JSON valid — abaikan */
      }
    };

    // `close` juga menyusul setiap `error`, jadi sambung ulang cukup di sini.
    const handleClose = () => {
      detach();
      socket = null;
      clearStableTimer();
      scheduleRetry();
    };

    const detach = () => {
      ws.removeEventListener('open', handleOpen);
      ws.removeEventListener('message', handleMessage);
      ws.removeEventListener('close', handleClose);
      detachSocket = null;
    };
    detachSocket = detach;

    ws.addEventListener('open', handleOpen);
    ws.addEventListener('message', handleMessage);
    ws.addEventListener('close', handleClose);
  };

  const scheduleRetry = () => {
    if (closed || retryTimer) return;

    if (attempt >= MAX_ATTEMPTS) {
      // Menyerah. Polling di sisi pemanggil yang menjadi jaring pengaman, dan
      // indikator offline memberi tahu pengguna bahwa data tidak lagi seketika.
      setStatus('offline');
      return;
    }

    const delay = Math.min(BASE_RETRY_MS * 2 ** attempt, MAX_RETRY_MS);
    // Sedikit acak: beberapa tablet kasir yang putus bersamaan tidak menyerbu
    // server pada milidetik yang sama saat menyambung ulang.
    const jittered = Math.round(delay * (0.8 + Math.random() * 0.4));
    attempt += 1;
    setStatus('reconnecting');

    retryTimer = setTimeout(() => {
      retryTimer = null;
      connect();
    }, jittered);
  };

  connect();

  return () => {
    // `closed` di-set lebih dulu supaya sisa handler yang masih sempat berjalan
    // tidak menjadwalkan sambungan ulang untuk komponen yang sudah dilepas.
    closed = true;
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = null;
    clearStableTimer();

    // Lepas listener SEBELUM menutup: tanpa ini `handleClose` ikut terpanggil
    // dan menjadwalkan sambungan ulang yang tidak ada lagi yang memakainya.
    detachSocket?.();
    socket?.close();
    socket = null;
  };
}
