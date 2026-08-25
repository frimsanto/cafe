import { prisma } from '../lib/prisma';
import { toCashierOrderDTO, type CashierOrderDTO } from '../dto/cashier.dto';
import { toReceiptDataDTO, type ReceiptDataDTO } from '../dto/receipt.dto';
import { receiptService } from './receipt.service';

/** Bentuk relasi yang selalu dibutuhkan layar kasir. */
const CASHIER_INCLUDE = {
  items: true,
  payment: true,
  table: { select: { tableName: true } },
} as const;

/**
 * Layanan kasir — antrean pesanan yang belum lunas.
 *
 * Seluruh query berjalan dalam konteks tenant sehingga otomatis dibatasi
 * `cafeId` pengguna (lihat `tenantExtension`).
 *
 * Kasir hanya MEMBACA di sini; menandai lunas dilakukan lewat jalur pembayaran
 * (`pembayaran.service`) — manual maupun Midtrans.
 */
export const cashierService = {
  /**
   * Pesanan yang menunggu dibayar, terlama lebih dulu (FIFO).
   *
   * Hanya `MENUNGGU_PEMBAYARAN` yang masuk: pesanan yang sudah lunas (lewat
   * Midtrans di meja maupun konfirmasi manual kasir) langsung berstatus
   * `DIPROSES_DAPUR` dan keluar dari antrean.
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
