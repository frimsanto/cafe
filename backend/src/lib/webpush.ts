import webpush from 'web-push';

// Konfigurasi Web Push (VAPID). Aktif hanya bila kunci VAPID tersedia di env,
// sehingga server tetap jalan meski push belum dikonfigurasi.

const publicKey = process.env.VAPID_PUBLIC_KEY ?? '';
const privateKey = process.env.VAPID_PRIVATE_KEY ?? '';
const subject = process.env.VAPID_SUBJECT ?? 'mailto:admin@example.com';

export const webPushEnabled = Boolean(publicKey && privateKey);
export const vapidPublicKey = publicKey;

if (webPushEnabled) {
  webpush.setVapidDetails(subject, publicKey, privateKey);
}

export interface WebPushSub {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export type SendResult = 'ok' | 'expired' | 'error';

/** Kirim satu notifikasi Web Push. `expired` menandakan langganan sudah mati. */
export async function sendWebPush(sub: WebPushSub, payload: unknown): Promise<SendResult> {
  if (!webPushEnabled) return 'error';
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: sub.keys },
      JSON.stringify(payload),
    );
    return 'ok';
  } catch (err) {
    const status = (err as { statusCode?: number }).statusCode;
    // 404/410 = endpoint sudah tidak valid (langganan kedaluwarsa).
    if (status === 404 || status === 410) return 'expired';
    return 'error';
  }
}
