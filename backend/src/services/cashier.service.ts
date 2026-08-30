import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/ApiError';
import { ORDER_INCLUDE, type OrderLengkap } from '../lib/orderInclude';
import { awalHariKafe } from '../lib/orderCode';
import { manualMethodToEnum } from '../lib/paymentMethods';
import { normalisasiStatus, statusLunas } from '../lib/paymentStatus';
import { toCashierOrderDTO, type CashierOrderDTO } from '../dto/cashier.dto';
import { toReceiptDataDTO, type ReceiptDataDTO } from '../dto/receipt.dto';
import {
  kunciKafe,
  nomorAntrianBerikutnya,
  snapshotBaris,
  totalDariBaris,
} from './order.service';
import { siarkanRilis, terapkanRilis } from './release.service';
import { paymentSettingsService } from './paymentSettings.service';
import { receiptService } from './receipt.service';
import { tableService } from './table.service';
import { realtime } from '../realtime/realtime';
import { AKSI_AUDIT, auditLogService, type AktorAudit } from './auditLog.service';
import type {
  BuatPesananKasirInput,
  FilterPesananKasir,
  TabKasir,
} from '../validation/cashier.validation';

/**
 * Layanan kasir — POS penuh: membaca antrean, membuat pesanan sendiri,
 * membatalkan, dan menutup pesanan yang sudah diserahkan.
 *
 * Seluruh query berjalan dalam konteks tenant sehingga otomatis dibatasi
 * `cafeId` pengguna (lihat `tenantExtension`). `cafeId` yang diterima fungsi di
 * bawah SELALU berasal dari token (route memasang `requireSameCafe`), tidak
 * pernah dari body — itulah kenapa tidak ada satu pun parameter kafe yang
 * dibaca dari input klien di berkas ini.
 *
 * Menandai pesanan LUNAS untuk pesanan yang sudah ada tetap dilakukan lewat
 * jalur pembayaran (`pembayaran.service`) — manual maupun Midtrans. Yang di
 * sini hanya jalur POS: pesanan yang lahir dan dibayar di detik yang sama.
 */

/** Referensi transaksi untuk pembayaran yang ditagih langsung di kasir. */
function transaksiKasir(): string {
  return `KSR-${randomBytes(5).toString('hex').toUpperCase()}`;
}

/**
 * Penyaring Prisma untuk sebuah tab.
 *
 * Tab dipetakan ke TIGA kolom yang berbeda dan itu memang inti perbaikannya:
 * "perlu konfirmasi" adalah pertanyaan tentang UANG, "sedang diproses" tentang
 * DAPUR, dan "selesai" tentang pesanannya. Satu kolom status tidak akan pernah
 * bisa menjawab ketiganya sekaligus.
 */
function filterTab(tab: TabKasir, sejak: Date): Prisma.OrderWhereInput {
  switch (tab) {
    case 'PERLU_KONFIRMASI':
      // Belum lunas dan belum dibatalkan — tak peduli sejak kapan menunggunya.
      // Pesanan yang menggantung dari kemarin justru yang paling perlu dilihat.
      return { status: 'MENUNGGU_PEMBAYARAN' };

    case 'SUDAH_DIBAYAR':
      // Lunas, sudah masuk antrean dapur, tapi belum disentuh chef.
      return { statusPembayaran: 'PAID', kitchenStatus: 'QUEUED' };

    case 'SEDANG_DIPROSES':
      return { kitchenStatus: { in: ['PREPARING', 'READY'] } };

    case 'SELESAI':
      // Dibatasi hari berjalan: riwayat lengkap bukan pekerjaan layar kasir,
      // dan daftar yang tumbuh tanpa batas akan membuatnya melambat sendiri.
      return {
        status: { in: ['SELESAI', 'DIBATALKAN'] },
        createdAt: { gte: sejak },
      };

    default:
      // "Semua" = segala yang masih berjalan, DITAMBAH yang tuntas hari ini.
      return {
        OR: [
          { status: { notIn: ['SELESAI', 'DIBATALKAN'] } },
          { createdAt: { gte: sejak } },
        ],
      };
  }
}

/**
 * Terjemahkan kata kunci pencarian menjadi penyaring.
 *
 * Kasir mengetik apa yang terbaca di layar/struknya: nomor antrian (`A-017`
 * atau `17`), potongan kode pesanan, nama meja, atau nama tamu. Semuanya
 * dicoba sekaligus — memaksa kasir memilih "cari berdasarkan apa" dulu adalah
 * satu ketukan yang tidak dia punya waktu untuk itu.
 *
 * Kode pesanan butuh satu query terpisah: `orders.id` bertipe UUID, dan Prisma
 * tidak menyediakan pencocokan sebagian pada kolom UUID. Query mentah di bawah
 * melakukannya lewat `id::text`, dengan `cafe_id` yang dipasang eksplisit —
 * ekstensi tenant tidak menyentuh SQL mentah, jadi penyaring kafenya harus
 * ditulis sendiri di sini dan tidak boleh datang dari input klien.
 */
async function idCocokDenganKode(cafeId: string, q: string): Promise<string[]> {
  // `%`, `_`, dan `\` adalah wildcard/escape milik LIKE. Tanpa dilolosi,
  // kasir yang mengetik `%` akan mencocokkan SEMUA pesanan kafe ini.
  const pola = q.replace(/[%_\\]/g, (c) => `\\${c}`);
  const baris = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id::text AS id
    FROM orders
    WHERE cafe_id = ${cafeId}::uuid
      AND id::text ILIKE ${'%' + pola + '%'}
    LIMIT 50
  `;
  return baris.map((b) => b.id);
}

function filterPencarian(qMentah: string, idCocok: string[]): Prisma.OrderWhereInput {
  const q = qMentah.trim();
  const angka = Number(q.replace(/^[A-Za-z]-?/, ''));
  const nomor = Number.isInteger(angka) && angka > 0 && angka <= 999 ? angka : null;

  return {
    OR: [
      ...(idCocok.length > 0 ? [{ id: { in: idCocok } }] : []),
      { midtransOrderId: { contains: q, mode: 'insensitive' as const } },
      { customerName: { contains: q, mode: 'insensitive' as const } },
      { table: { tableName: { contains: q, mode: 'insensitive' as const } } },
      ...(nomor === null ? [] : [{ queueNumber: nomor }]),
    ],
  };
}

/** Ringkasan angka di kepala halaman kasir. */
export interface RingkasanKasirDTO {
  /** Pesanan yang menunggu keputusan kasir (belum lunas, belum batal). */
  perluKonfirmasi: number;
  /** Lunas & antre di dapur. */
  sudahDibayar: number;
  /** Sedang dimasak atau sudah siap tapi belum diserahkan. */
  sedangDiproses: number;
  /** Selesai/dibatalkan hari ini. */
  selesaiHariIni: number;
  /** Total uang yang MASUK hari ini (pesanan lunas), dan jumlah transaksinya. */
  totalHariIni: number;
  transaksiHariIni: number;
  /** Awal "hari" menurut jam dinding kafe — supaya klien bisa menjelaskannya. */
  sejak: string;
}

/** Meja sebagaimana dilihat layar kasir saat memilih tujuan pesanan. */
export interface MejaKasirDTO {
  id: string;
  tableName: string;
  /** TERSEDIA | TERISI | MENUNGGU_PEMBAYARAN */
  status: 'TERSEDIA' | 'TERISI' | 'MENUNGGU_PEMBAYARAN';
  activeOrderCount: number;
  /** Berapa pesanan di meja ini yang tagihannya belum ditutup. */
  unpaidOrderCount: number;
}

export const cashierService = {
  /**
   * Pesanan yang menunggu dibayar, terlama lebih dulu (FIFO).
   *
   * Dipertahankan apa adanya untuk klien lama: bentuk dan artinya persis sama
   * seperti sebelum layar kasir menjadi POS.
   */
  async listPendingOrders(): Promise<CashierOrderDTO[]> {
    const orders = await prisma.order.findMany({
      where: { status: 'MENUNGGU_PEMBAYARAN' },
      orderBy: { createdAt: 'asc' },
      include: ORDER_INCLUDE,
    });

    return orders.map(toCashierOrderDTO);
  },

  /**
   * Daftar pesanan untuk sebuah tab layar kasir.
   *
   * Urutannya berbeda per tab dan itu disengaja: yang masih menunggu diurutkan
   * TERLAMA DULU (tamu yang paling lama berdiri dilayani lebih dulu), sedangkan
   * yang sudah tuntas diurutkan TERBARU DULU (yang baru saja terjadi adalah
   * yang paling mungkin dicari lagi).
   */
  async listOrders(
    cafeId: string,
    filter: FilterPesananKasir,
  ): Promise<CashierOrderDTO[]> {
    const sejak = awalHariKafe();
    const fifo = filter.tab === 'PERLU_KONFIRMASI' || filter.tab === 'SUDAH_DIBAYAR';
    const idCocok = filter.q ? await idCocokDenganKode(cafeId, filter.q) : [];

    const orders = await prisma.order.findMany({
      // `AND`, bukan sebaran objek: tab "Semua" DAN pencarian sama-sama
      // menghasilkan klausa `OR`, dan menyebarkan keduanya ke satu objek
      // membuat yang belakangan menimpa yang duluan — pencarian di tab itu
      // akan diam-diam ikut memunculkan pesanan yang seharusnya tersaring.
      where: {
        AND: [
          filterTab(filter.tab, sejak),
          ...(filter.fulfillmentType
            ? [{ fulfillmentType: filter.fulfillmentType }]
            : []),
          ...(filter.orderSource ? [{ orderSource: filter.orderSource }] : []),
          ...(filter.statusPembayaran
            ? [{ statusPembayaran: filter.statusPembayaran }]
            : []),
          ...(filter.q ? [filterPencarian(filter.q, idCocok)] : []),
        ],
      },
      orderBy: { createdAt: fifo ? 'asc' : 'desc' },
      take: filter.limit,
      include: ORDER_INCLUDE,
    });

    return orders.map(toCashierOrderDTO);
  },

  /** Satu pesanan lengkap — isi modal detail. */
  async getOrder(cafeId: string, orderId: string): Promise<CashierOrderDTO> {
    const order = await prisma.order.findFirst({
      where: { id: orderId, cafeId },
      include: ORDER_INCLUDE,
    });
    if (!order) throw ApiError.notFound('Pesanan tidak ditemukan');
    return toCashierOrderDTO(order);
  },

  /**
   * Angka-angka di kepala halaman.
   *
   * "Hari ini" memakai jam dinding kafe (`awalHariKafe`), bukan jam server:
   * VPS lazimnya berjalan di UTC, dan tanpa ini "total hari ini" akan berganti
   * pukul 07.00 WIB — tepat saat kafe mulai ramai.
   */
  async ringkasan(cafeId: string): Promise<RingkasanKasirDTO> {
    const sejak = awalHariKafe();

    const [perluKonfirmasi, sudahDibayar, sedangDiproses, selesaiHariIni, uang] =
      await Promise.all([
        prisma.order.count({ where: { cafeId, status: 'MENUNGGU_PEMBAYARAN' } }),
        prisma.order.count({
          where: { cafeId, statusPembayaran: 'PAID', kitchenStatus: 'QUEUED' },
        }),
        prisma.order.count({
          where: { cafeId, kitchenStatus: { in: ['PREPARING', 'READY'] } },
        }),
        prisma.order.count({
          where: {
            cafeId,
            status: { in: ['SELESAI', 'DIBATALKAN'] },
            createdAt: { gte: sejak },
          },
        }),
        prisma.order.aggregate({
          where: {
            cafeId,
            // Uang dihitung saat DITERIMA, bukan saat pesanan dibuat — dasar
            // yang sama dipakai dasbor pemilik (`dashboard.service`).
            //
            // BATAS HARINYA masih berbeda, dan itu diketahui: dasbor memakai
            // `startOfDay` menurut jam SERVER, sedangkan layar ini memakai jam
            // dinding kafe (`awalHariKafe`, Asia/Jakarta). Di VPS yang berjalan
            // di UTC, "hari" dasbor berganti pukul 07.00 WIB — tepat saat kafe
            // mulai ramai. Yang benar adalah jam dinding kafe; dasbor belum
            // ikut diperbaiki karena itu di luar modul ini, dan mengubahnya
            // diam-diam akan menggeser angka laporan yang sudah dipakai pemilik
            // tanpa ada yang tahu kenapa.
            paidAt: { gte: sejak },
            payment: { status: 'SUCCESS' },
            status: { not: 'DIBATALKAN' },
          },
          _sum: { totalAmount: true },
          _count: { _all: true },
        }),
      ]);

    return {
      perluKonfirmasi,
      sudahDibayar,
      sedangDiproses,
      selesaiHariIni,
      totalHariIni: Number(uang._sum.totalAmount ?? 0),
      transaksiHariIni: uang._count._all,
      sejak: sejak.toISOString(),
    };
  },

  /**
   * Meja kafe ini beserta keadaannya — untuk pemilihan meja di POS.
   *
   * Endpoint daftar meja yang lama khusus OWNER (memuat token QR & URL cetak).
   * Kasir tidak berhak melihatnya, tapi tetap harus bisa memilih meja; karena
   * itu bentuk di sini sengaja miskin: nama, keadaan, dan hitungan pesanan.
   * Tidak ada token QR yang ikut keluar.
   */
  async mejaUntukKasir(cafeId: string): Promise<MejaKasirDTO[]> {
    const tables = await prisma.table.findMany({
      where: { cafeId, deletedAt: null },
      orderBy: { tableName: 'asc' },
      select: { id: true, tableName: true },
    });

    const berjalan = await prisma.order.groupBy({
      by: ['tableId', 'statusPembayaran'],
      where: {
        cafeId,
        status: { notIn: ['SELESAI', 'DIBATALKAN'] },
        tableId: { not: null },
      },
      _count: { _all: true },
    });

    const aktif = new Map<string, { total: number; belumLunas: number }>();
    for (const baris of berjalan) {
      const kunci = baris.tableId as string;
      const sekarang = aktif.get(kunci) ?? { total: 0, belumLunas: 0 };
      sekarang.total += baris._count._all;
      if (!statusLunas(normalisasiStatus(baris.statusPembayaran))) {
        sekarang.belumLunas += baris._count._all;
      }
      aktif.set(kunci, sekarang);
    }

    return tables.map((table) => {
      const hitung = aktif.get(table.id) ?? { total: 0, belumLunas: 0 };
      const status: MejaKasirDTO['status'] =
        hitung.belumLunas > 0
          ? 'MENUNGGU_PEMBAYARAN'
          : hitung.total > 0
            ? 'TERISI'
            : 'TERSEDIA';
      return {
        id: table.id,
        tableName: table.tableName,
        status,
        activeOrderCount: hitung.total,
        unpaidOrderCount: hitung.belumLunas,
      };
    });
  },

  /**
   * Kasir membuat pesanan langsung di layar kasir, sekaligus menagihnya.
   *
   * SATU TRANSAKSI untuk pesanan + item + pembayaran + tiket dapur. Ini bukan
   * kerapian: kalau pembayaran tersimpan tetapi pesanannya gagal dibuat, kafe
   * memegang uang tamu tanpa ada pesanan yang bisa dimasak — dan tidak ada
   * layar mana pun yang bisa menemukannya lagi. Rilis ke dapur ikut di dalam
   * transaksi lewat `terapkanRilis`, sehingga aturan "tidak ada tiket tanpa
   * pembayaran sukses" tetap dijaga satu gerbang yang sama.
   *
   * Siaran realtime sengaja DI LUAR transaksi: memberi tahu Layar Dapur tentang
   * tiket yang kemudian ter-rollback jauh lebih buruk daripada terlambat
   * sepersekian detik.
   */
  async buatPesanan(
    cafeId: string,
    input: BuatPesananKasirInput,
    aktor: AktorAudit,
  ): Promise<CashierOrderDTO> {
    // 1. Kirim ulang dari tombol yang ditekan dua kali → kembalikan yang sudah
    //    ada, jangan buat tagihan kedua. Diperiksa lebih dulu supaya percobaan
    //    ulang tidak sempat menyentuh menu maupun meja.
    const sudahAda = await prisma.order.findFirst({
      where: { cafeId, idempotencyKey: input.idempotencyKey },
      include: ORDER_INCLUDE,
    });
    if (sudahAda) return toCashierOrderDTO(sudahAda);

    // 2. Meja wajib milik kafe ini dan masih hidup. Meja yang sudah terisi TETAP
    //    boleh dipilih — itu yang membuat "pesanan tambahan" mungkin.
    let tableId: string | null = null;
    if (input.fulfillmentType === 'DINE_IN') {
      const table = await prisma.table.findFirst({
        where: { id: input.tableId!, cafeId, deletedAt: null },
        select: { id: true },
      });
      if (!table) throw ApiError.badRequest('Meja tidak ditemukan untuk kafe ini');
      tableId = table.id;
    }

    // 3. Metodenya harus benar-benar aktif di kanal KASIR — diperiksa di server,
    //    bukan hanya lewat tombol yang ditampilkan.
    const opsiKasir = await paymentSettingsService.opsiMetode(cafeId, 'KASIR');
    if (!opsiKasir.some((o) => o.metode === input.pembayaran.metode)) {
      throw ApiError.badRequest(
        `Metode "${input.pembayaran.metode}" belum aktif untuk kasir di kafe ini`,
      );
    }

    // 4. Harga & total dari DATABASE, bukan dari layar kasir.
    const baris = await snapshotBaris(cafeId, input.items);
    const total = totalDariBaris(baris);

    if (input.pembayaran.metode === 'TUNAI' && input.pembayaran.nominal < Number(total)) {
      throw ApiError.badRequest('Uang yang diterima kurang dari total tagihan');
    }

    const transactionId = transaksiKasir();

    let dibuat: OrderLengkap;
    try {
      dibuat = await prisma.$transaction(async (tx) => {
        // Kunci penasihat per kafe: menjaga "baca nomor antrian terakhir, tulis
        // berikutnya" tetap satu langkah tak terbelah, sama seperti jalur QR.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${kunciKafe(cafeId)}::bigint)`;

        const order = await tx.order.create({
          data: {
            cafeId,
            tableId,
            fulfillmentType: input.fulfillmentType,
            orderSource: 'CASHIER',
            customerName: input.customerName,
            catatan: input.catatan,
            status: 'MENUNGGU_PEMBAYARAN',
            kitchenStatus: 'NOT_SENT',
            totalAmount: total,
            queueNumber: await nomorAntrianBerikutnya(tx, cafeId),
            cashierUserId: aktor.userId ?? null,
            idempotencyKey: input.idempotencyKey,
            // Metode & nominal ditulis sekarang supaya `terapkanRilis` tidak
            // menimpanya dengan nilai enum lama saat menyalin ringkasan.
            metodePembayaran: input.pembayaran.metode,
            nominalDibayar: total,
            items: { create: baris },
            payment: {
              create: {
                method: manualMethodToEnum(input.pembayaran.metode),
                status: 'SUCCESS',
                amount: total,
                transactionId,
              },
            },
            pembayaranManual: {
              create: {
                metode: input.pembayaran.metode,
                // Uang yang BENAR-BENAR diterima — untuk tunai bisa lebih besar
                // dari tagihan; selisihnya yang menjadi kembalian di struk.
                nominal: new Prisma.Decimal(input.pembayaran.nominal),
                catatanKasir: input.pembayaran.catatanKasir,
                referensi: input.pembayaran.referensi,
                sumber: 'KASIR',
                statusVerifikasi: 'DITERIMA',
                diverifikasiOleh: aktor.userId ?? null,
                diverifikasiPada: new Date(),
              },
            },
          },
          include: ORDER_INCLUDE,
        });

        const { order: dirilis } = await terapkanRilis(tx, order);
        return dirilis;
      });
    } catch (error) {
      // Dua permintaan kembar yang tiba BERSAMAAN: yang pertama membuat
      // barisnya, yang kedua kalah di unique constraint. Yang kalah membaca
      // hasil yang menang, bukan meledak — dari sisi kasir keduanya sama saja.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const kembar = await prisma.order.findFirst({
          where: { cafeId, idempotencyKey: input.idempotencyKey },
          include: ORDER_INCLUDE,
        });
        if (kembar) return toCashierOrderDTO(kembar);
      }
      throw error;
    }

    const dto = siarkanRilis(dibuat);
    realtime.emitPaymentStatusChanged(cafeId, {
      orderId: dto.id,
      statusPembayaran: dto.statusPembayaran,
      metodePembayaran: dto.metodePembayaran,
    });

    await auditLogService.catat({
      cafeId,
      aksi: AKSI_AUDIT.PESANAN_KASIR_DIBUAT,
      aktor,
      orderId: dto.id,
      nilaiBaru: {
        fulfillmentType: dto.fulfillmentType,
        tableId,
        total: dto.totalAmount,
        metode: input.pembayaran.metode,
        nominalDiterima: input.pembayaran.nominal,
        queueNumber: dto.queueNumber,
      },
    });

    return dto;
  },

  /**
   * Batalkan sebuah pesanan dengan alasan tertulis.
   *
   * Pesanan yang SUDAH LUNAS sengaja DITOLAK. Menandainya batal tanpa ada uang
   * yang benar-benar dikembalikan akan menghapus penjualan itu dari laporan
   * sementara uangnya masih di laci — selisih kas yang tidak bisa dijelaskan.
   * Pengembalian dana belum ada di CafeOS, jadi jalan yang jujur adalah menolak
   * dan mengatakannya.
   */
  async batalkanPesanan(
    cafeId: string,
    orderId: string,
    alasan: string,
    aktor: AktorAudit,
  ): Promise<CashierOrderDTO> {
    const order = await prisma.order.findFirst({
      where: { id: orderId, cafeId },
      include: ORDER_INCLUDE,
    });
    if (!order) throw ApiError.notFound('Pesanan tidak ditemukan');

    if (order.status === 'DIBATALKAN') {
      // Sudah dibatalkan: kembalikan apa adanya, jangan menulis alasan kedua.
      return toCashierOrderDTO(order);
    }
    if (order.status === 'SELESAI') {
      throw ApiError.conflict('Pesanan yang sudah selesai tidak bisa dibatalkan');
    }
    if (order.payment?.status === 'SUCCESS') {
      throw ApiError.conflict(
        'Pesanan ini sudah lunas — pembatalannya perlu pengembalian dana, yang belum didukung CafeOS.',
      );
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Pengajuan pembayaran yang masih menggantung ikut ditutup: tanpa ini,
      // pesanan yang dibatalkan tetap muncul di antrean "menunggu verifikasi".
      if (order.pembayaranManual?.statusVerifikasi === 'MENUNGGU') {
        await tx.pembayaranManual.update({
          where: { orderId: order.id },
          data: {
            statusVerifikasi: 'DITOLAK',
            alasanPenolakan: alasan,
            diverifikasiOleh: aktor.userId ?? null,
            diverifikasiPada: new Date(),
          },
        });
      }

      return tx.order.update({
        where: { id: order.id },
        data: {
          status: 'DIBATALKAN',
          statusPembayaran: 'CANCELLED',
          kitchenStatus: 'NOT_SENT',
          cancelledAt: new Date(),
          cancelledBy: aktor.userId ?? null,
          alasanPembatalan: alasan,
        },
        include: ORDER_INCLUDE,
      });
    });

    const dto = toCashierOrderDTO(updated);
    realtime.emitKitchenOrderUpdated(cafeId, dto);
    realtime.emitPaymentStatusChanged(cafeId, {
      orderId: dto.id,
      statusPembayaran: dto.statusPembayaran,
      metodePembayaran: dto.metodePembayaran,
    });
    // Mejanya bisa langsung dipakai tamu berikutnya.
    if (updated.tableId) {
      void tableService.broadcastTableStatus(cafeId, updated.tableId);
    }

    await auditLogService.catat({
      cafeId,
      aksi: AKSI_AUDIT.PESANAN_DIBATALKAN,
      aktor,
      orderId: order.id,
      nilaiLama: {
        status: order.status,
        statusPembayaran: normalisasiStatus(order.statusPembayaran),
      },
      nilaiBaru: { status: 'DIBATALKAN', alasan },
    });

    return dto;
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
