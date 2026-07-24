import { randomBytes } from 'node:crypto';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/ApiError';
import { toCashierOrderDTO, type CashierOrderDTO } from '../dto/cashier.dto';
import { toReceiptDataDTO, type ReceiptDataDTO } from '../dto/receipt.dto';
import { releaseService } from './release.service';
import { receiptService } from './receipt.service';
import type { ConfirmPaymentInput } from '../validation/cashier.validation';

/** Referensi transaksi untuk pembayaran manual di kasir. */
function cashierTransactionId(): string {
  return `KSR-${randomBytes(5).toString('hex').toUpperCase()}`;
}

export interface ConfirmPaymentResult {
  order: CashierOrderDTO;
  /** Kembalian tunai; `null` untuk EDC atau bila nominal tunai tidak diisi. */
  change: number | null;
}

/** Bentuk relasi yang selalu dibutuhkan layar kasir. */
const CASHIER_INCLUDE = {
  items: true,
  payment: true,
  table: { select: { tableName: true } },
} as const;

/**
 * Layanan kasir — antrean pembayaran tunai/EDC.
 *
 * Seluruh query berjalan dalam konteks tenant sehingga otomatis dibatasi
 * `cafeId` pengguna (lihat `tenantExtension`).
 */
export const cashierService = {
  /**
   * Pesanan yang menunggu dibayar di kasir, terlama lebih dulu (FIFO).
   *
   * Hanya `MENUNGGU_PEMBAYARAN` yang masuk: pesanan yang sudah dibayar di meja
   * (QRIS/GoPay/kartu) langsung berstatus `DIPROSES_DAPUR` dan tidak pernah
   * muncul di antrean kasir.
   */
  async listPendingOrders(): Promise<CashierOrderDTO[]> {
    const orders = await prisma.order.findMany({
      where: { status: 'MENUNGGU_PEMBAYARAN' },
      orderBy: { createdAt: 'asc' },
      include: CASHIER_INCLUDE,
    });

    return orders.map(toCashierOrderDTO);
  },

  /**
   * Konfirmasi pembayaran tunai/EDC oleh kasir.
   *
   * Mencatat pembayaran SUCCESS, lalu menyerahkan perpindahan status ke
   * gerbang rilis bersama (`releaseService`) — satu-satunya tempat pesanan
   * boleh berpindah ke dapur, dipakai juga oleh pembayaran di meja dan
   * callback gateway.
   *
   * Nominal yang dicatat selalu total pesanan dari database — uang yang
   * diketik kasir hanya dipakai menghitung kembalian, tidak pernah menjadi
   * nilai transaksi.
   *
   * Pesanan dicari tanpa menyebut `cafeId`: konteks tenant sudah membatasinya
   * ke kafe pengguna, jadi id milik kafe lain tidak akan pernah ketemu.
   */
  async confirmPayment(
    orderId: string,
    input: ConfirmPaymentInput,
  ): Promise<ConfirmPaymentResult> {
    const order = await prisma.order.findFirst({
      where: { id: orderId },
      include: { payment: true },
    });
    if (!order) throw ApiError.notFound('Pesanan tidak ditemukan');

    const alreadyPaid = order.payment?.status === 'SUCCESS';
    if (order.status !== 'MENUNGGU_PEMBAYARAN' || (order.payment && !alreadyPaid)) {
      throw ApiError.conflict('Pesanan ini sudah dibayar atau tidak bisa dibayar');
    }

    const total = Number(order.totalAmount);
    if (input.cashReceived !== null && input.cashReceived < total) {
      throw ApiError.badRequest('Uang yang diterima kurang dari total tagihan');
    }

    // Nominal transaksi selalu total dari database — uang yang diketik kasir
    // hanya untuk menghitung kembalian.
    if (!alreadyPaid) {
      await prisma.payment.create({
        data: {
          orderId: order.id,
          method: input.method,
          status: 'SUCCESS',
          amount: order.totalAmount,
          transactionId: cashierTransactionId(),
        },
      });
    }

    // Perpindahan ke dapur + seluruh siarannya ditangani satu gerbang bersama.
    // Bila proses sempat terputus setelah pembayaran tercatat, panggilan ulang
    // di sini yang menuntaskan rilisnya (tidak membuat pembayaran ganda).
    const { order: dto } = await releaseService.releaseToKitchen(order.id);

    return {
      order: dto,
      change:
        input.cashReceived === null
          ? null
          : Math.round((input.cashReceived - total) * 100) / 100,
    };
  },

  /**
   * Data struk siap-cetak (JSON) untuk sebuah pesanan yang sudah lunas.
   *
   * Angka-angkanya dihitung ulang dari database — bukan dari layar kasir —
   * supaya struk yang dicetak selalu cocok dengan yang tercatat sebagai omzet.
   * Hanya pesanan berpembayaran SUCCESS yang punya struk (dijaga
   * `receiptService.getPaidOrder`).
   */
  async getReceiptData(cafeId: string, orderId: string): Promise<ReceiptDataDTO> {
    const order = await receiptService.getPaidOrder(cafeId, orderId);
    return toReceiptDataDTO(order);
  },
};
