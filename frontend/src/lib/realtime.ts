import { WS_BASE_URL } from './apiConfig';

/**
 * Klien WebSocket realtime.
 *
 * Protokol mengikuti server (`backend/src/realtime/realtime.ts`):
 *   klien → server : { type: 'subscribe', cafeId }
 *   server → klien : { type: <event>, data: <payload> }
 *
 * Langganan juga dikirim lewat query saat menyambung, lalu DIULANG sebagai
 * pesan `subscribe` setelah `open`. Pengulangan ini penting: saat sambungan
 * putus dan tersambung lagi, server tidak mengingat langganan lama.
 */

/** Nama event yang dipancarkan server. */
export type RealtimeEvent =
  | 'kitchen.order.created'
  | 'kitchen.order.updated'
  | 'order.ready'
  | 'table.status.changed'
  | 'dashboard.order.paid'
  | 'connected'
  | 'subscribed';

export interface RealtimeMessage {
  type: RealtimeEvent | string;
  data?: unknown;
  cafeId?: string;
}

type Listener = (message: RealtimeMessage) => void;

/** Jeda sambung ulang — naik bertahap agar tidak membanjiri server yang mati. */
const RETRY_MS = [1_000, 2_000, 5_000, 10_000, 30_000];

/**
 * Sambungkan ke kanal realtime sebuah kafe.
 *
 * Mengembalikan fungsi pemutus; panggil saat komponen dilepas supaya tidak ada
 * sambungan menganggur yang terus mencoba menyambung ulang.
 */
export function subscribeRealtime(cafeId: string, onMessage: Listener): () => void {
  let socket: WebSocket | null = null;
  let retryIndex = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const connect = () => {
    if (closed) return;

    const url = `${WS_BASE_URL}?cafeId=${encodeURIComponent(cafeId)}`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      scheduleRetry();
      return;
    }
    socket = ws;

    ws.addEventListener('open', () => {
      retryIndex = 0;
      ws.send(JSON.stringify({ type: 'subscribe', cafeId }));
    });

    ws.addEventListener('message', (event) => {
      try {
        onMessage(JSON.parse(String(event.data)) as RealtimeMessage);
      } catch {
        /* pesan bukan JSON valid — abaikan */
      }
    });

    // `close` juga menyusul setiap `error`, jadi sambung ulang cukup di sini.
    ws.addEventListener('close', () => {
      socket = null;
      scheduleRetry();
    });
  };

  const scheduleRetry = () => {
    if (closed || retryTimer) return;
    const delay = RETRY_MS[Math.min(retryIndex, RETRY_MS.length - 1)];
    retryIndex += 1;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      connect();
    }, delay);
  };

  connect();

  return () => {
    // `closed` di-set lebih dulu: handler `close` di bawah tetap akan berjalan
    // saat soket ditutup, dan penanda inilah yang mencegahnya menjadwalkan
    // sambungan ulang untuk komponen yang sudah dilepas.
    closed = true;
    if (retryTimer) clearTimeout(retryTimer);
    socket?.close();
    socket = null;
  };
}
