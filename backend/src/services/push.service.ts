import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/ApiError';
import { sendWebPush, webPushEnabled } from '../lib/webpush';
import type { PushSubscriptionInput } from '../validation/push.validation';

/** Bentuk baris langganan yang dibutuhkan untuk mengirim — bukan seluruh model. */
interface LanggananTerkirim {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Ringkasan hasil pengiriman — dipakai endpoint uji coba untuk melapor. */
export interface HasilKirim {
  total: number;
  berhasil: number;
  kedaluwarsa: number;
  gagal: number;
}

/**
 * Kirim satu payload ke sekumpulan langganan, lalu BUANG yang kedaluwarsa.
 *
 * Pembersihan itu bagian yang gampang terlupa: endpoint yang sudah mati (tamu
 * menghapus data situs, atau perangkatnya berganti langganan) akan terus
 * dicoba pada setiap pesanan berikutnya dan selamanya gagal. Karena `sendWebPush`
 * memisahkan 404/410 dari galat lain, hanya yang benar-benar mati yang dihapus —
 * gangguan jaringan sesaat tidak ikut menghanguskan langganan yang masih sehat.
 */
async function kirimKeLangganan(
  subs: LanggananTerkirim[],
  payload: unknown,
): Promise<HasilKirim> {
  const hasil: HasilKirim = {
    total: subs.length,
    berhasil: 0,
    kedaluwarsa: 0,
    gagal: 0,
  };
  if (subs.length === 0) return hasil;

  const kedaluwarsa: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      const status = await sendWebPush(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
      );
      if (status === 'ok') hasil.berhasil += 1;
      else if (status === 'expired') {
        hasil.kedaluwarsa += 1;
        kedaluwarsa.push(s.endpoint);
      } else hasil.gagal += 1;
    }),
  );

  if (kedaluwarsa.length > 0) {
    await prisma.pushSubscription.deleteMany({
      where: { endpoint: { in: kedaluwarsa } },
    });
  }
  return hasil;
}

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
      // Pesanannya sendiri tidak masuk isi notifikasi — nama meja justru
      // membingungkan tamu yang duduk di meja lain — jadi cukup dipastikan ada.
      const order = await prisma.order.findUnique({
        where: { id: orderId },
        select: { id: true },
      });
      if (!order) return;

      const subs = await prisma.pushSubscription.findMany({ where: { orderId } });
      await kirimKeLangganan(subs, {
        title: 'Pesanan Siap! 🎉',
        body: 'Pesananmu sudah siap disajikan!',
        orderId,
      });
    } catch (err) {
      console.error('[cafeos-backend] Gagal mengirim push notifikasi:', err);
    }
  },

  /**
   * Kirim notifikasi UJI COBA ke semua perangkat yang berlangganan di sebuah
   * kafe — jalan pintas untuk menguji rantai push tanpa harus memesan,
   * membayar, lalu menunggu dapur menandai pesanan siap.
   *
   * Sengaja memakai `tag` yang berbeda dari notifikasi asli: kalau tag-nya sama,
   * uji coba akan MENIMPA notifikasi "pesanan siap" yang sedang tampil di layar
   * tamu sungguhan yang kebetulan sedang menunggu.
   *
   * Berbeda dengan `sendOrderReadyPush`, error di sini TIDAK ditelan — yang
   * memanggilnya sedang mendiagnosis, jadi kegagalannya justru jawaban yang
   * dicari.
   */
  async kirimPushUji(cafeId: string): Promise<HasilKirim> {
    if (!webPushEnabled) {
      throw new ApiError(
        503,
        'Web Push belum aktif di server — VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY belum disetel.',
      );
    }

    const subs = await prisma.pushSubscription.findMany({ where: { cafeId } });
    return kirimKeLangganan(subs, {
      title: 'Tes Notifikasi CafeOS 🔔',
      body: 'Kalau kamu melihat ini, notifikasi sudah berfungsi.',
      // Tanpa orderId: notifikasi uji tidak boleh mengarahkan tamu ke halaman
      // status pesanan milik orang lain saat disentuh.
      tag: 'cafeos-tes',
    });
  },
};
