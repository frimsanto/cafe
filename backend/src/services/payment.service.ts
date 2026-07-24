import { randomBytes } from 'node:crypto';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/ApiError';
import type { OrderDTO } from '../dto/order.dto';
import { releaseService } from './release.service';
import type { PayInput, WebhookInput } from '../validation/payment.validation';

function simulatedTransactionId(): string {
  return `SIM-${randomBytes(6).toString('hex').toUpperCase()}`;
}

export const paymentService = {
  /**
   * Konfirmasi pembayaran di meja (mode simulasi — tanpa gateway).
   *
   * Mencatat Payment berstatus SUCCESS lalu memindahkan pesanan ke
   * `DIPROSES_DAPUR` — inilah gerbang "pesanan hanya masuk dapur setelah
   * pembayaran berhasil". Saat InterActive QRIS aktif, langkah ini menjadi
   * "buat invoice + tunggu callback" (lihat `handleGatewayCallback`).
   */
  async payOrder(cafeId: string, orderId: string, input: PayInput): Promise<OrderDTO> {
    const order = await prisma.order.findFirst({
      where: { id: orderId, cafeId },
      include: { payment: true },
    });
    if (!order) {
      throw ApiError.notFound('Pesanan tidak ditemukan');
    }
    if (order.payment || order.status !== 'MENUNGGU_PEMBAYARAN') {
      throw ApiError.conflict('Pesanan sudah dibayar atau tidak dapat dibayar');
    }

    await prisma.payment.create({
      data: {
        orderId: order.id,
        method: input.method,
        status: 'SUCCESS',
        amount: order.totalAmount,
        transactionId: simulatedTransactionId(),
      },
    });

    // Perpindahan status + siaran ke Layar Dapur/dasbor/status meja ditangani
    // gerbang bersama, sama persis dengan jalur kasir & callback gateway.
    const { order: released } = await releaseService.releaseToKitchen(order.id);
    return released;
  },

  /**
   * Titik masuk callback/webhook dari payment gateway.
   *
   * SEAM: saat InterActive QRIS aktif, gateway memanggil endpoint ini untuk
   * memberi tahu hasil pembayaran. Yang WAJIB ditambahkan nanti:
   *   - verifikasi signature/otentikasi payload gateway,
   *   - pemetaan status mentah gateway → PaymentStatus kita.
   * Untuk sekarang payload sudah ternormalisasi (lihat parseWebhookInput).
   */
  async handleGatewayCallback(input: WebhookInput): Promise<{ orderId: string; status: string }> {
    const payment = await prisma.payment.findUnique({
      where: { orderId: input.orderId },
    });
    if (!payment) {
      throw ApiError.notFound('Pembayaran untuk pesanan ini tidak ditemukan');
    }

    const result = await prisma.payment.update({
      where: { orderId: input.orderId },
      data: {
        status: input.status,
        transactionId: input.transactionId ?? payment.transactionId,
      },
    });

    // Pesanan hanya dirilis ke dapur ketika pembayaran benar-benar sukses.
    // Gateway kadang mengirim callback yang sama dua kali — gerbang rilis
    // bersifat idempoten, jadi tiket dapur tidak akan tergandakan.
    if (input.status === 'SUCCESS') {
      await releaseService.releaseToKitchen(input.orderId);
    }

    return { orderId: input.orderId, status: result.status };
  },
};
