import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/ApiError';
import { toOrderDTO, type OrderDTO } from '../dto/order.dto';
import { tableService } from './table.service';
import type { CreateOrderInput } from '../validation/order.validation';

export const orderService = {
  /**
   * Membuat pesanan baru dari isi keranjang.
   *
   * - Meja & item divalidasi milik kafe (isolasi tenant).
   * - Harga & nama di-snapshot dari data menu SAAT INI (server-side) — harga
   *   dari klien diabaikan agar tidak bisa dimanipulasi.
   * - Status awal `MENUNGGU_PEMBAYARAN`; pesanan baru masuk dapur setelah
   *   pembayaran sukses (ditangani endpoint pembayaran).
   */
  async createOrder(cafeId: string, input: CreateOrderInput): Promise<OrderDTO> {
    // 1. Pastikan meja ada & milik kafe ini.
    const table = await prisma.table.findFirst({
      where: { id: input.tableId, cafeId, deletedAt: null },
    });
    if (!table) {
      throw ApiError.badRequest('Meja tidak ditemukan untuk kafe ini');
    }

    // 2. Ambil item menu yang direferensikan (dibatasi per kafe).
    const ids = [...new Set(input.items.map((i) => i.menuItemId))];
    const menuItems = await prisma.menuItem.findMany({
      where: { id: { in: ids }, cafeId, deletedAt: null },
    });
    const byId = new Map(menuItems.map((m) => [m.id, m]));

    // 3. Susun baris pesanan dengan snapshot harga + hitung total server-side.
    let total = new Prisma.Decimal(0);
    const itemsData = input.items.map((line) => {
      const menuItem = byId.get(line.menuItemId);
      if (!menuItem) {
        throw ApiError.badRequest(`Item menu tidak ditemukan: ${line.menuItemId}`);
      }
      if (!menuItem.isAvailable) {
        throw ApiError.badRequest(`Menu "${menuItem.name}" sedang tidak tersedia`);
      }
      total = total.add(menuItem.price.mul(line.quantity));
      return {
        menuItemId: menuItem.id,
        name: menuItem.name,
        price: menuItem.price,
        quantity: line.quantity,
        notes: line.notes,
      };
    });

    // 4. Buat order + order_items dalam satu operasi (transaksional).
    const order = await prisma.order.create({
      data: {
        cafeId,
        tableId: table.id,
        status: 'MENUNGGU_PEMBAYARAN',
        totalAmount: total,
        items: { create: itemsData },
      },
      include: { items: true, payment: true },
    });

    // Meja itu kini terpakai — beri tahu halaman Manajemen Meja.
    void tableService.broadcastTableStatus(cafeId, table.id);

    return toOrderDTO(order);
  },
};
