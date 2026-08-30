import { prisma } from '../lib/prisma';
import { ORDER_INCLUDE, type OrderLengkap } from '../lib/orderInclude';
import { ApiError } from '../lib/ApiError';
import {
  bolehTransisiDapur,
  normalisasiKitchenStatus,
  statusDariItem,
  statusItemUntuk,
  KITCHEN_STATUS_LABEL,
  type KitchenStatusPesanan,
} from '../lib/orderStatus';
import { toOrderWithTableDTO, type OrderWithTableDTO } from '../dto/order.dto';
import { realtime } from '../realtime/realtime';
import { AKSI_AUDIT, auditLogService, type AktorAudit } from './auditLog.service';
import { pushService } from './push.service';
import { tableService } from './table.service';
import type { KitchenStatus } from '@prisma/client';

/** Tahap yang masih terlihat di Layar Dapur — sudah dirilis, belum diserahkan. */
const TAHAP_AKTIF: KitchenStatusPesanan[] = ['QUEUED', 'PREPARING', 'READY'];

/**
 * Terapkan satu perpindahan tahap dapur beserta seluruh akibatnya.
 *
 * Dikumpulkan dalam satu fungsi karena tahap dapur TIDAK berdiri sendiri: ia
 * menyeret status per item, cap waktu, status pesanan, status meja, dan
 * notifikasi ke tamu. Tersebar di beberapa pemanggil, salah satunya pasti
 * ketinggalan — dan yang paling sering ketinggalan adalah membebaskan meja.
 */
async function terapkanTahap(
  order: OrderLengkap,
  tujuan: KitchenStatusPesanan,
  aktor?: AktorAudit,
): Promise<OrderWithTableDTO> {
  const sekarang = normalisasiKitchenStatus(order.kitchenStatus);
  if (!bolehTransisiDapur(sekarang, tujuan)) {
    throw ApiError.conflict(
      `Tidak bisa mengubah status dapur dari "${KITCHEN_STATUS_LABEL[sekarang]}" ke "${KITCHEN_STATUS_LABEL[tujuan]}"`,
    );
  }
  if (sekarang === tujuan) return toOrderWithTableDTO(order);

  const waktu = new Date();
  const statusItem = statusItemUntuk(tujuan);

  const updated = await prisma.$transaction(async (tx) => {
    // Baris item ikut digerakkan supaya kepala tiket dan daftar itemnya tidak
    // pernah bertentangan di layar chef.
    if (statusItem) {
      await tx.orderItem.updateMany({
        where: { orderId: order.id },
        data: { kitchenStatus: statusItem },
      });
    }

    return tx.order.update({
      where: { id: order.id },
      data: {
        kitchenStatus: tujuan,
        // Cap waktu hanya ditulis SEKALI (`?? waktu`): tiket yang dikembalikan
        // dari READY ke PREPARING tidak boleh menghapus jejak kapan chef
        // pertama kali mulai memasak.
        kitchenStartedAt:
          tujuan === 'PREPARING' ? (order.kitchenStartedAt ?? waktu) : order.kitchenStartedAt,
        kitchenReadyAt:
          tujuan === 'READY' ? (order.kitchenReadyAt ?? waktu) : order.kitchenReadyAt,
        completedAt: tujuan === 'COMPLETED' ? waktu : order.completedAt,
        // Pesanan baru dianggap SELESAI ketika benar-benar diserahkan ke tamu,
        // bukan ketika makanannya matang. Selama belum diserahkan, mejanya tetap
        // terhitung terisi — dan memang begitu keadaannya.
        status: tujuan === 'COMPLETED' ? 'SELESAI' : order.status,
      },
      include: ORDER_INCLUDE,
    });
  });

  const dto = toOrderWithTableDTO(updated);
  realtime.emitKitchenOrderUpdated(updated.cafeId, dto);

  if (tujuan === 'READY') {
    realtime.emitOrderReady(updated.cafeId, dto); // notifikasi in-app (WebSocket)
    void pushService.sendOrderReadyPush(updated.id); // push ke perangkat
  }
  if (tujuan === 'COMPLETED' && updated.tableId) {
    // Pesanan tuntas → meja bisa kembali kosong (bila tak ada pesanan lain).
    void tableService.broadcastTableStatus(updated.cafeId, updated.tableId);
  }
  if (aktor) {
    void auditLogService.catat({
      cafeId: updated.cafeId,
      aksi: AKSI_AUDIT.DAPUR_STATUS_DIUBAH,
      aktor,
      orderId: updated.id,
      nilaiLama: { kitchenStatus: sekarang },
      nilaiBaru: { kitchenStatus: tujuan },
    });
  }

  return dto;
}

/** Ambil satu pesanan milik kafe ini beserta relasi lengkapnya. */
async function ambilPesanan(cafeId: string, orderId: string): Promise<OrderLengkap> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, cafeId },
    include: ORDER_INCLUDE,
  });
  if (!order) throw ApiError.notFound('Pesanan tidak ditemukan');
  return order;
}

export const kitchenService = {
  /**
   * Daftar pesanan untuk Layar Dapur (KDS): sudah dirilis & belum diserahkan.
   *
   * Disaring berdasarkan TAHAP DAPUR, bukan lagi status pesanan. Bedanya nyata:
   * tiket yang makanannya sudah siap tetap terpampang sampai kasir menekan
   * "Diserahkan", sehingga tidak ada makanan matang yang hilang dari layar
   * sebelum ada yang benar-benar mengantarnya.
   *
   * Diurutkan FIFO (paling lama di atas) agar dapur mengerjakan sesuai antrean.
   */
  async getActiveOrders(cafeId: string): Promise<OrderWithTableDTO[]> {
    const orders = await prisma.order.findMany({
      where: { cafeId, kitchenStatus: { in: TAHAP_AKTIF } },
      include: ORDER_INCLUDE,
      orderBy: { createdAt: 'asc' },
    });
    return orders.map(toOrderWithTableDTO);
  },

  /**
   * Perbarui status masak sebuah item pesanan (WAITING → COOKING → READY).
   *
   * Item divalidasi milik kafe ini (via relasi order.cafeId). Tahap tiketnya
   * ikut bergerak mengikuti item-itemnya, sehingga chef yang bekerja per baris
   * tidak perlu menekan tombol tiket secara terpisah.
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

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: item.orderId },
      include: ORDER_INCLUDE,
    });

    // Tahap tiket menyusul status item-itemnya — tapi hanya bila perpindahannya
    // memang diizinkan. Tiket yang sudah diserahkan tidak boleh ditarik kembali
    // ke dapur oleh satu item yang disentuh ulang.
    const tersirat = statusDariItem(order.items);
    const kini = normalisasiKitchenStatus(order.kitchenStatus);
    if (tersirat && tersirat !== kini && bolehTransisiDapur(kini, tersirat)) {
      return terapkanTahap(order, tersirat);
    }

    const dto = toOrderWithTableDTO(order);
    realtime.emitKitchenOrderUpdated(cafeId, dto);
    return dto;
  },

  /** "Mulai Proses" — seluruh tiket berpindah ke PREPARING. */
  async mulaiProses(
    cafeId: string,
    orderId: string,
    aktor?: AktorAudit,
  ): Promise<OrderWithTableDTO> {
    return terapkanTahap(await ambilPesanan(cafeId, orderId), 'PREPARING', aktor);
  },

  /** "Siap Disajikan" — tiket READY; tamu diberi tahu, kasir menyerahkan. */
  async tandaiSiap(
    cafeId: string,
    orderId: string,
    aktor?: AktorAudit,
  ): Promise<OrderWithTableDTO> {
    return terapkanTahap(await ambilPesanan(cafeId, orderId), 'READY', aktor);
  },

  /**
   * "Selesai / Diserahkan" — ditekan KASIR setelah makanan sampai ke tamu.
   *
   * Ini titik yang menutup pesanan sekaligus membebaskan mejanya. Sengaja bukan
   * milik dapur: yang tahu makanannya benar-benar diterima tamu adalah orang
   * yang mengantarkannya, bukan yang memasaknya.
   */
  async tandaiSelesai(
    cafeId: string,
    orderId: string,
    aktor?: AktorAudit,
  ): Promise<OrderWithTableDTO> {
    const order = await ambilPesanan(cafeId, orderId);
    if (order.payment?.status !== 'SUCCESS') {
      throw ApiError.conflict(
        'Pesanan ini belum lunas — selesaikan pembayarannya sebelum diserahkan',
      );
    }
    return terapkanTahap(order, 'COMPLETED', aktor);
  },

  /** Perpindahan tahap bebas (dipakai route tunggal `PATCH .../status`). */
  async ubahTahap(
    cafeId: string,
    orderId: string,
    tujuan: KitchenStatusPesanan,
    aktor?: AktorAudit,
  ): Promise<OrderWithTableDTO> {
    if (tujuan === 'COMPLETED') return this.tandaiSelesai(cafeId, orderId, aktor);
    return terapkanTahap(await ambilPesanan(cafeId, orderId), tujuan, aktor);
  },
};
