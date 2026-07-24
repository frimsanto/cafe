import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/ApiError';
import { sendWebPush, webPushEnabled } from '../lib/webpush';
import type { PushSubscriptionInput } from '../validation/push.validation';

export const pushService = {
  /**
   * Simpan langganan Web Push milik perangkat pelanggan untuk sebuah pesanan.
   * Idempoten terhadap `endpoint` (unik) — mendaftar ulang memperbarui data.
   */
  async saveSubscription(
    cafeId: string,
    orderId: string,
    sub: PushSubscriptionInput,
  ): Promise<void> {
    const order = await prisma.order.findFirst({
      where: { id: orderId, cafeId },
      select: { id: true },
    });
    if (!order) {
      throw ApiError.notFound('Pesanan tidak ditemukan');
    }

    await prisma.pushSubscription.upsert({
      where: { endpoint: sub.endpoint },
      create: {
        cafeId,
        orderId,
        endpoint: sub.endpoint,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
      },
      update: { cafeId, orderId, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    });
  },

  /**
   * Kirim notifikasi "pesanan siap" ke seluruh perangkat pelanggan yang
   * berlangganan pesanan ini. Dipanggil fire-and-forget; error ditelan agar
   * tidak mengganggu alur utama. Langganan yang kedaluwarsa dibersihkan.
   */
  async sendOrderReadyPush(orderId: string): Promise<void> {
    if (!webPushEnabled) return;
    try {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        include: { table: true },
      });
      if (!order) return;

      const subs = await prisma.pushSubscription.findMany({ where: { orderId } });
      if (subs.length === 0) return;

      const payload = {
        title: 'Pesanan Siap! 🔔',
        body: `Pesanan untuk ${order.table.tableName} sudah siap diantar.`,
        orderId,
      };

      const expiredEndpoints: string[] = [];
      await Promise.all(
        subs.map(async (s) => {
          const result = await sendWebPush(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
          );
          if (result === 'expired') expiredEndpoints.push(s.endpoint);
        }),
      );

      if (expiredEndpoints.length > 0) {
        await prisma.pushSubscription.deleteMany({
          where: { endpoint: { in: expiredEndpoints } },
        });
      }
    } catch (err) {
      console.error('[cafeos-backend] Gagal mengirim push notifikasi:', err);
    }
  },
};
