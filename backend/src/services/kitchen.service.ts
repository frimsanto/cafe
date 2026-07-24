import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/ApiError';
import { toOrderWithTableDTO, type OrderWithTableDTO } from '../dto/order.dto';
import { realtime } from '../realtime/realtime';
import { pushService } from './push.service';
import { tableService } from './table.service';
import type { KitchenStatus } from '@prisma/client';

export const kitchenService = {
  /**
   * Daftar pesanan untuk Layar Dapur (KDS): sudah dibayar & belum selesai.
   *
   * Pesanan hanya berstatus `DIPROSES_DAPUR` setelah pembayaran sukses, dan
   * berubah menjadi `SELESAI` bila sudah rampung — jadi filter status ini tepat
   * mewakili "sudah dibayar dan belum selesai". Diurutkan FIFO (paling lama di
   * atas) agar dapur mengerjakan sesuai antrean.
   */
  async getActiveOrders(cafeId: string): Promise<OrderWithTableDTO[]> {
    const orders = await prisma.order.findMany({
      where: { cafeId, status: 'DIPROSES_DAPUR' },
      include: { items: true, payment: true, table: { select: { tableName: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return orders.map(toOrderWithTableDTO);
  },

  /**
   * Perbarui status masak sebuah item pesanan (WAITING → COOKING → READY).
   *
   * Item divalidasi milik kafe ini (via relasi order.cafeId). Setelah update,
   * pesanan yang sudah diperbarui dikirim realtime ke Layar Dapur.
   */
  async updateItemStatus(
    cafeId: string,
    itemId: string,
    status: KitchenStatus,
  ): Promise<OrderWithTableDTO> {
    // Pastikan item ada & pesanannya milik kafe ini (isolasi tenant).
    const item = await prisma.orderItem.findFirst({
      where: { id: itemId, order: { cafeId } },
      select: { id: true, orderId: true },
    });
    if (!item) {
      throw ApiError.notFound('Item pesanan tidak ditemukan');
    }

    await prisma.orderItem.update({
      where: { id: item.id },
      data: { kitchenStatus: status },
    });

    let order = await prisma.order.findUniqueOrThrow({
      where: { id: item.orderId },
      include: { items: true, payment: true, table: { select: { tableName: true } } },
    });

    // Pengecekan otomatis: bila SELURUH item sudah READY dan pesanan belum
    // ditandai selesai, tandai SELESAI lalu kirim notifikasi "pesanan siap"
    // ke pelanggan. Guard status mencegah notifikasi ganda.
    const allReady =
      order.items.length > 0 &&
      order.items.every((i) => i.kitchenStatus === 'READY');
    const becameReady = allReady && order.status !== 'SELESAI';

    if (becameReady) {
      order = await prisma.order.update({
        where: { id: order.id },
        data: { status: 'SELESAI' },
        include: { items: true, payment: true, table: { select: { tableName: true } } },
      });
    }

    const dto = toOrderWithTableDTO(order);
    realtime.emitKitchenOrderUpdated(cafeId, dto);
    if (becameReady) {
      realtime.emitOrderReady(cafeId, dto); // notifikasi in-app (WebSocket)
      void pushService.sendOrderReadyPush(order.id); // push ke perangkat (fire-and-forget)
      // Pesanan tuntas → meja bisa kembali kosong (bila tak ada pesanan lain).
      void tableService.broadcastTableStatus(cafeId, order.tableId);
    }
    return dto;
  },
};
