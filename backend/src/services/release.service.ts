import { prisma } from '../lib/prisma';
import { ORDER_INCLUDE, type OrderLengkap } from '../lib/orderInclude';
import { ApiError } from '../lib/ApiError';
import { toCashierOrderDTO, type CashierOrderDTO } from '../dto/cashier.dto';
import { realtime } from '../realtime/realtime';
import { tableService } from './table.service';

/** Klien Prisma biasa ATAU klien di dalam transaksi interaktif. */
type DbClient = typeof prisma | Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

export interface ReleaseResult {
  order: CashierOrderDTO;
  /** True bila panggilan ini yang benar-benar memindahkan pesanan ke dapur. */
  released: boolean;
}

/**
 * Pindahkan satu pesanan ke dapur DI DALAM klien/transaksi yang diberikan.
 *
 * Dipisah dari `releaseToKitchen` supaya jalur POS kasir — yang membuat
 * pesanan, pembayaran, dan tiket dapur dalam SATU transaksi — tetap melewati
 * aturan yang sama persis, bukan menyalinnya. Sengaja TIDAK menyiarkan apa pun:
 * siaran dari dalam transaksi yang kemudian di-rollback akan memberi tahu Layar
 * Dapur tentang tiket yang tidak pernah ada.
 */
export async function terapkanRilis(
  db: DbClient,
  order: OrderLengkap,
): Promise<{ order: OrderLengkap; released: boolean }> {
  // Aturan 1 — tidak ada pembayaran sukses, tidak ada tiket dapur.
  if (!order.payment || order.payment.status !== 'SUCCESS') {
    throw ApiError.conflict('Pesanan belum dibayar — belum bisa dirilis ke dapur');
  }

  // Pesanan yang sudah dibatalkan tidak boleh dihidupkan lagi oleh webhook yang
  // datang terlambat: uangnya urusan pengembalian dana, bukan alasan
  // menerbitkan tiket masak untuk tamu yang sudah pergi.
  if (order.status === 'DIBATALKAN') {
    throw ApiError.conflict('Pesanan ini sudah dibatalkan');
  }

  // Aturan 2 — hanya pesanan yang masih menunggu yang perlu dipindahkan.
  if (order.status !== 'MENUNGGU_PEMBAYARAN') {
    return { order, released: false };
  }

  const sekarang = new Date();
  const updated = await db.order.update({
    where: { id: order.id },
    data: {
      status: 'DIPROSES_DAPUR',
      // Tiket masuk antrean dapur di detik yang sama ia dikonfirmasi — satu
      // gerbang, satu waktu, tidak ada celah "sudah dibayar tapi belum antre".
      kitchenStatus: 'QUEUED',
      confirmedAt: order.confirmedAt ?? sekarang,
      kitchenQueuedAt: order.kitchenQueuedAt ?? sekarang,
      // Ringkasan pembayaran disalin di sini — satu-satunya penulisnya —
      // supaya `orders.paid_at`/`payment_method` tidak pernah menyimpang
      // dari baris `payments`.
      paymentMethod: order.payment.method,
      paidAt: order.payment.createdAt,
      // Ringkasan pembayaran domain baru — SEMUA jalur (bayar di meja, kasir,
      // manual, Midtrans) melewati gerbang ini, jadi status baru selalu ikut
      // konsisten. Metode/nominal di-coalesce: jalur baru sudah mengisinya
      // dengan nilai akurat (mis. label Midtrans) sebelum rilis, dan itu tidak
      // boleh tertimpa nilai enum lama.
      statusPembayaran: 'PAID',
      metodePembayaran: order.metodePembayaran ?? order.payment.method,
      nominalDibayar: order.nominalDibayar ?? order.totalAmount,
    },
    include: ORDER_INCLUDE,
  });

  return { order: updated, released: true };
}

/**
 * Siaran yang seragam untuk SETIAP rilis yang benar-benar terjadi: tiket ke
 * Layar Dapur, omzet ke dasbor, dan status meja.
 *
 * Dipanggil SESUDAH transaksinya commit — lihat catatan di `terapkanRilis`.
 */
export function siarkanRilis(order: OrderLengkap): CashierOrderDTO {
  const dto = toCashierOrderDTO(order);
  realtime.emitKitchenOrderCreated(order.cafeId, dto);
  realtime.emitDashboardOrderPaid(order.cafeId, dto);
  // Pesanan bawa pulang tidak menempati meja — tidak ada yang perlu disiarkan.
  if (order.tableId) {
    void tableService.broadcastTableStatus(order.cafeId, order.tableId);
  }
  return dto;
}

/**
 * Gerbang tunggal "pesanan masuk dapur".
 *
 * SEMUA jalur pembayaran — bayar di meja, konfirmasi kasir, POS kasir, dan
 * callback gateway — melewati fungsi ini (atau `terapkanRilis` yang menjadi
 * intinya), sehingga aturan intinya hanya ditulis sekali:
 *
 *   1. Pesanan TANPA pembayaran SUCCESS tidak pernah dirilis ke dapur.
 *   2. Perpindahan status hanya terjadi sekali; panggilan ulang (mis. webhook
 *      yang dikirim dua kali oleh gateway) tidak membuat tiket dapur ganda.
 *   3. Setiap rilis yang benar-benar terjadi menyiarkan event yang sama.
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
      include: ORDER_INCLUDE,
    });
    if (!order) throw ApiError.notFound('Pesanan tidak ditemukan');

    const hasil = await terapkanRilis(prisma, order);
    if (!hasil.released) {
      return { order: toCashierOrderDTO(hasil.order), released: false };
    }
    return { order: siarkanRilis(hasil.order), released: true };
  },
};
