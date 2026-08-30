import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ITEM_TERURUT } from '../lib/orderItems';
import { ORDER_INCLUDE } from '../lib/orderInclude';
import { ApiError } from '../lib/ApiError';
import { antrianBerikutnya, awalHariKafe } from '../lib/orderCode';
import { normalisasiStatus, statusLunas } from '../lib/paymentStatus';
import type { FulfillmentType, OrderSource } from '../lib/orderStatus';
import { toOrderDTO, toOrderWithTableDTO, type OrderDTO } from '../dto/order.dto';
import { realtime } from '../realtime/realtime';
import { tableService } from './table.service';
import type {
  AddOrderItemsInput,
  CreateOrderItemInput,
  CreateOrderInput,
} from '../validation/order.validation';

/** Klien di dalam transaksi interaktif — cukup untuk query yang dipakai di sini. */
export type TxPrisma = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/**
 * Kunci penasihat PostgreSQL untuk sebuah kafe — hash 32-bit (varian djb2).
 *
 * Dihitung di sini, bukan lewat `hashtext()` milik PostgreSQL, karena fungsi
 * itu internal dan tak berdokumen; nilainya boleh saja berubah antar versi
 * mayor. Tabrakan hash antar kafe pun tidak berbahaya: akibat terburuknya
 * dua kafe bergantian menunggu sepersekian milidetik.
 */
export function kunciKafe(cafeId: string): number {
  let h = 5381;
  for (let i = 0; i < cafeId.length; i += 1) {
    // `| 0` menahan nilainya di rentang 32-bit bertanda — muat di `bigint`
    // PostgreSQL tanpa kehilangan presisi.
    h = ((h << 5) + h + cafeId.charCodeAt(i)) | 0;
  }
  return h;
}

/**
 * Nomor antrian berikutnya untuk kafe ini, dihitung dari pesanan HARI INI saja.
 *
 * Baris dengan `queueNumber` null (pesanan sebelum kolom ini ada) dilewati:
 * PostgreSQL menaruh NULL paling depan pada urutan menurun, jadi tanpa saringan
 * ini pesanan lama akan membuat hitungan selalu kembali ke 1.
 */
export async function nomorAntrianBerikutnya(
  tx: TxPrisma,
  cafeId: string,
): Promise<number> {
  const terakhir = await tx.order.findFirst({
    where: {
      cafeId,
      createdAt: { gte: awalHariKafe() },
      queueNumber: { not: null },
    },
    orderBy: { queueNumber: 'desc' },
    select: { queueNumber: true },
  });
  return antrianBerikutnya(terakhir?.queueNumber);
}

/** Jumlah maksimum satu baris pesanan — sama dengan batas per baris di
    validasi input, agar penggabungan tidak bisa menembusnya diam-diam. */
const MAX_QTY_BARIS = 99;

/** Baris pesanan siap-simpan: nama & harga di-snapshot dari menu SAAT INI. */
export interface BarisSnapshot {
  menuItemId: string;
  name: string;
  price: Prisma.Decimal;
  quantity: number;
  notes: string;
}

/**
 * Terjemahkan item dari klien menjadi baris pesanan bersnapshot harga.
 *
 * Harga TIDAK pernah diambil dari klien — hanya id menu yang dipercaya. Dipakai
 * bersama oleh `createOrder`, `addItems`, DAN layar kasir (POS), supaya tidak
 * ada satu jalur pun yang bisa memasukkan harga karangan sendiri. Inilah
 * penjagaan yang membuat "nominal tidak bisa dimanipulasi dari frontend" berlaku
 * untuk semua sumber pesanan, bukan hanya untuk pelanggan.
 */
export async function snapshotBaris(
  cafeId: string,
  items: CreateOrderItemInput[],
): Promise<BarisSnapshot[]> {
  const ids = [...new Set(items.map((i) => i.menuItemId))];
  const menuItems = await prisma.menuItem.findMany({
    where: { id: { in: ids }, cafeId, deletedAt: null },
  });
  const byId = new Map(menuItems.map((m) => [m.id, m]));

  return items.map((line) => {
    const menuItem = byId.get(line.menuItemId);
    if (!menuItem) {
      throw ApiError.badRequest(`Item menu tidak ditemukan: ${line.menuItemId}`);
    }
    if (!menuItem.isAvailable) {
      throw ApiError.badRequest(`Menu "${menuItem.name}" sedang tidak tersedia`);
    }
    return {
      menuItemId: menuItem.id,
      name: menuItem.name,
      price: menuItem.price,
      quantity: line.quantity,
      notes: line.notes,
    };
  });
}

/** Jumlahkan harga × jumlah seluruh baris. */
export function totalDariBaris(
  baris: readonly { price: Prisma.Decimal; quantity: number }[],
): Prisma.Decimal {
  return baris.reduce(
    (total, b) => total.add(b.price.mul(b.quantity)),
    new Prisma.Decimal(0),
  );
}

/** Sifat pesanan yang ditentukan pemanggilnya, bukan oleh isi keranjang. */
export interface OpsiPesanan {
  fulfillmentType?: FulfillmentType;
  orderSource?: OrderSource;
  customerName?: string | null;
  catatan?: string | null;
}

export const orderService = {
  /**
   * Membuat pesanan baru dari isi keranjang (jalur QR meja pelanggan).
   *
   * - Meja & item divalidasi milik kafe (isolasi tenant).
   * - Harga & nama di-snapshot dari data menu SAAT INI (server-side) — harga
   *   dari klien diabaikan agar tidak bisa dimanipulasi.
   * - Status awal `MENUNGGU_PEMBAYARAN` dengan dapur `NOT_SENT`; pesanan baru
   *   masuk dapur setelah pembayaran sukses (lewat `releaseService`).
   */
  async createOrder(
    cafeId: string,
    input: CreateOrderInput,
    opsi: OpsiPesanan = {},
  ): Promise<OrderDTO> {
    // 1. Pastikan meja ada & milik kafe ini.
    const table = await prisma.table.findFirst({
      where: { id: input.tableId, cafeId, deletedAt: null },
    });
    if (!table) {
      throw ApiError.badRequest('Meja tidak ditemukan untuk kafe ini');
    }

    // 2–3. Susun baris pesanan dengan snapshot harga + hitung total server-side.
    const itemsData = await snapshotBaris(cafeId, input.items);
    const total = totalDariBaris(itemsData);

    // 4. Ambil nomor antrian lalu buat order + order_items — satu transaksi.
    //
    // Kunci penasihat (advisory lock) per kafe menjadikan "baca nomor terakhir,
    // tulis nomor berikutnya" satu langkah yang tak terbelah. Tanpa itu, dua
    // tamu yang menekan Pesan pada detik yang sama sama-sama membaca nomor
    // terakhir yang sama dan mendapat nomor antrian KEMBAR — dua orang berdiri
    // dengan `A-012` di layar masing-masing. Kuncinya dilepas otomatis saat
    // transaksi selesai, dan hanya menahan pesanan kafe yang sama.
    const order = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${kunciKafe(cafeId)}::bigint)`;

      return tx.order.create({
        data: {
          cafeId,
          tableId: table.id,
          status: 'MENUNGGU_PEMBAYARAN',
          kitchenStatus: 'NOT_SENT',
          fulfillmentType: opsi.fulfillmentType ?? 'DINE_IN',
          orderSource: opsi.orderSource ?? 'TABLE_QR',
          customerName: opsi.customerName ?? null,
          catatan: opsi.catatan ?? null,
          totalAmount: total,
          queueNumber: await nomorAntrianBerikutnya(tx, cafeId),
          items: { create: itemsData },
        },
        include: { items: ITEM_TERURUT, payment: true },
      });
    });

    // Meja itu kini terpakai — beri tahu halaman Manajemen Meja.
    void tableService.broadcastTableStatus(cafeId, table.id);

    return toOrderDTO(order);
  },

  /**
   * Tambahkan item ke pesanan yang MASIH menunggu pembayaran.
   *
   * Ini yang membuat tamu bisa memesan lagi tanpa menumpuk pesanan kembar di
   * antrean kasir: satu meja, satu tagihan, satu nomor antrian.
   *
   * Gerbangnya sempit dan disengaja — pesanan yang sudah lunas atau sudah
   * masuk dapur TIDAK bisa diubah. Kalau boleh, tagihan yang sudah dicetak dan
   * tiket yang sudah dimasak akan berubah di belakang punggung kasir & chef;
   * tambahan sesudah itu memang seharusnya jadi pesanan baru.
   */
  async addItems(
    cafeId: string,
    orderId: string,
    input: AddOrderItemsInput,
  ): Promise<OrderDTO> {
    const baru = await snapshotBaris(cafeId, input.items);

    const order = await prisma.$transaction(async (tx) => {
      // `findFirst` (bukan `findUnique`) supaya penyaringan `cafeId` ikut
      // terpasang — pemegang sebuah orderId tidak bisa menyentuh pesanan kafe
      // lain sekalipun ia menebak id-nya.
      const sekarang = await tx.order.findFirst({
        where: { id: orderId, cafeId },
        include: { items: ITEM_TERURUT, payment: true },
      });
      if (!sekarang) throw ApiError.notFound('Pesanan tidak ditemukan');

      if (sekarang.status === 'DIBATALKAN') {
        throw ApiError.conflict('Pesanan ini sudah dibatalkan');
      }
      if (sekarang.status !== 'MENUNGGU_PEMBAYARAN') {
        throw ApiError.conflict(
          'Pesanan ini sudah diproses dapur — silakan buat pesanan baru',
        );
      }
      if (
        statusLunas(normalisasiStatus(sekarang.statusPembayaran)) ||
        sekarang.payment?.status === 'SUCCESS'
      ) {
        throw ApiError.conflict(
          'Pesanan ini sudah dibayar — silakan buat pesanan baru',
        );
      }

      // Item yang sama PERSIS (menu & catatan) menambah jumlah baris yang ada,
      // bukan melahirkan baris kedua. Catatan ikut dibandingkan karena "Kopi
      // Susu (tanpa gula)" adalah pesanan yang berbeda dari "Kopi Susu".
      // Pemisah `|` aman: bagian kiri selalu UUID (hanya heksadesimal &
      // tanda hubung), jadi pemisah tidak pernah muncul di dalamnya.
      const kunci = (menuItemId: string, notes: string) => `${menuItemId}|${notes}`;
      const lama = new Map(sekarang.items.map((i) => [kunci(i.menuItemId, i.notes), i]));

      const ditambah: BarisSnapshot[] = [];
      const dinaikkan: { id: string; quantity: number }[] = [];

      for (const b of baru) {
        const cocok = lama.get(kunci(b.menuItemId, b.notes));
        if (!cocok) {
          ditambah.push(b);
          continue;
        }
        const jumlahBaru = cocok.quantity + b.quantity;
        if (jumlahBaru > MAX_QTY_BARIS) {
          throw ApiError.badRequest(
            `Jumlah "${b.name}" melebihi batas ${MAX_QTY_BARIS} per pesanan`,
          );
        }
        dinaikkan.push({ id: cocok.id, quantity: jumlahBaru });
      }

      for (const d of dinaikkan) {
        await tx.orderItem.update({
          where: { id: d.id },
          data: { quantity: d.quantity },
        });
      }
      if (ditambah.length > 0) {
        await tx.orderItem.createMany({
          data: ditambah.map((b) => ({ ...b, orderId: sekarang.id })),
        });
      }

      // Total dihitung ulang dari SELURUH baris versi terbaru, bukan
      // ditambahkan ke total lama — hasilnya tidak bisa melenceng meski ada
      // baris yang digabung.
      const semua = await tx.orderItem.findMany({
        where: { orderId: sekarang.id },
        select: { price: true, quantity: true },
      });

      return tx.order.update({
        where: { id: sekarang.id },
        data: {
          totalAmount: totalDariBaris(semua),
          // Tagihan gateway yang sudah terbit kini SALAH nominalnya. Dibuang
          // supaya percobaan bayar berikutnya menerbitkan tagihan baru sesuai
          // total terbaru — tanpa ini, tamu bisa melunasi harga lama untuk
          // pesanan yang sudah bertambah isinya.
          snapToken: null,
          midtransOrderId: null,
          dokuInvoiceNumber: null,
          statusPembayaran: 'UNPAID',
        },
        include: ORDER_INCLUDE,
      });
    });

    // Layar kasir menagih dari daftar ini — tanpa siaran, kasir masih melihat
    // total lama saat tamu sudah menambah pesanan di ponselnya.
    realtime.emitKitchenOrderUpdated(cafeId, toOrderWithTableDTO(order));

    return toOrderDTO(order);
  },
};
