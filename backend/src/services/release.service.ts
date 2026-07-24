import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/ApiError';
import { toCashierOrderDTO, type CashierOrderDTO } from '../dto/cashier.dto';
import { realtime } from '../realtime/realtime';
import { tableService } from './table.service';

/** Relasi yang dibutuhkan saat merilis pesanan (dan menyiarkannya). */
const RELEASE_INCLUDE = {
  items: true,
  payment: true,
  table: { select: { tableName: true } },
} as const;

export interface ReleaseResult {
  order: CashierOrderDTO;
  /** True bila panggilan ini yang benar-benar memindahkan pesanan ke dapur. */
  released: boolean;
}

/**
 * Gerbang tunggal "pesanan masuk dapur".
 *
 * SEMUA jalur pembayaran — bayar di meja, konfirmasi kasir, dan callback
 * gateway — melewati fungsi ini, sehingga aturan intinya hanya ditulis sekali:
 *
 *   1. Pesanan TANPA pembayaran SUCCESS tidak pernah dirilis ke dapur.
 *   2. Perpindahan status hanya terjadi sekali; panggilan ulang (mis. webhook
 *      yang dikirim dua kali oleh gateway) tidak membuat tiket dapur ganda.
 *   3. Setiap rilis yang benar-benar terjadi menyiarkan event yang sama:
 *      tiket ke Layar Dapur, omzet ke dasbor, dan status meja.
 *
 * CATATAN: `findUnique` tidak ikut disaring `tenantExtension`, jadi PEMANGGIL
 * wajib sudah memastikan pesanan itu milik kafe yang berhak (pola yang sama
 * dipakai service lain untuk operasi berbasis id unik). Callback gateway
 * memang berjalan tanpa konteks tenant — di situ `orderId` datang dari
 * payload gateway yang harus diverifikasi signature-nya.
 */
export const releaseService = {
  async releaseToKitchen(orderId: string): Promise<ReleaseResult> {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: RELEASE_INCLUDE,
    });
    if (!order) throw ApiError.notFound('Pesanan tidak ditemukan');

    // Aturan 1 — tidak ada pembayaran sukses, tidak ada tiket dapur.
    if (!order.payment || order.payment.status !== 'SUCCESS') {
      throw ApiError.conflict('Pesanan belum dibayar — belum bisa dirilis ke dapur');
    }

    // Aturan 2 — hanya pesanan yang masih menunggu yang perlu dipindahkan.
    if (order.status !== 'MENUNGGU_PEMBAYARAN') {
      return { order: toCashierOrderDTO(order), released: false };
    }

    const updated = await prisma.order.update({
      where: { id: order.id },
      data: {
        status: 'DIPROSES_DAPUR',
        // Ringkasan pembayaran disalin di sini — satu-satunya penulisnya —
        // supaya `orders.paid_at`/`payment_method` tidak pernah menyimpang
        // dari baris `payments`.
        paymentMethod: order.payment.method,
        paidAt: order.payment.createdAt,
      },
      include: RELEASE_INCLUDE,
    });

    const dto = toCashierOrderDTO(updated);

    // Aturan 3 — siaran yang seragam untuk semua jalur pembayaran.
    realtime.emitKitchenOrderCreated(updated.cafeId, dto);
    realtime.emitDashboardOrderPaid(updated.cafeId, dto);
    void tableService.broadcastTableStatus(updated.cafeId, updated.tableId);

    return { order: dto, released: true };
  },
};
