import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/ApiError';
import type { ReceiptOrder } from '../lib/receiptPdf';

export const receiptService = {
  /**
   * Ambil pesanan (beserta relasi) untuk pembuatan struk. Struk hanya tersedia
   * bagi pesanan yang pembayarannya sudah SUCCESS.
   */
  async getPaidOrder(cafeId: string, orderId: string): Promise<ReceiptOrder> {
    const order = await prisma.order.findFirst({
      where: { id: orderId, cafeId },
      include: {
        cafe: true,
        table: true,
        items: true,
        payment: true,
        pembayaranManual: true,
      },
    });
    if (!order) {
      throw ApiError.notFound('Pesanan tidak ditemukan');
    }
    if (!order.payment || order.payment.status !== 'SUCCESS') {
      throw ApiError.conflict('Struk hanya tersedia untuk pesanan yang sudah dibayar');
    }
    return order;
  },
};
