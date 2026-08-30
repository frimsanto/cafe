import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { MidtransMode, OrderStatus, PaymentMethod } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ITEM_TERURUT } from '../lib/orderItems';
import { ORDER_INCLUDE } from '../lib/orderInclude';
import { ApiError } from '../lib/ApiError';
import { getMidtransSnap, getMidtransCoreApi } from '../lib/midtrans';
import { bangunEnabledPayments } from '../lib/midtransChannels';
import { buatDokuCheckout, isDokuEnabled, verifikasiSignatureDoku } from '../lib/doku';
import {
  dokuChannelToEnum,
  dokuChannelToKode,
  labelMidtransPaymentType,
  manualMethodToEnum,
  mapDokuStatus,
  mapMidtransStatus,
  midtransPaymentTypeToEnum,
} from '../lib/paymentMethods';
import {
  labelStatus,
  normalisasiStatus,
  statusLunas,
  type StatusPembayaran,
} from '../lib/paymentStatus';
import { releaseService } from './release.service';
import { paymentSettingsService, type OpsiMetodeDTO } from './paymentSettings.service';
import { AKSI_AUDIT, auditLogService, type AktorAudit } from './auditLog.service';
import { realtime } from '../realtime/realtime';
import { toOrderWithTableDTO } from '../dto/order.dto';
import type { CashierOrderDTO } from '../dto/cashier.dto';
import type {
  ManualPaymentInput,
  PermintaanManualInput,
  TolakPembayaranInput,
} from '../validation/pembayaran.validation';

// Jalur pembayaran tiga rel:
//   - Midtrans: pelanggan bayar sendiri via Snap (QRIS dinamis / e-wallet / VA),
//               gateway memberi tahu hasilnya lewat webhook. Kredensial PER KAFE
//               DAN PER MODE (lihat `paymentSettings.service`).
//   - DOKU    : checkout hosted DOKU dengan kredensial GLOBAL milik platform.
//   - Manual  : tunai / QRIS statis / transfer / EDC — SELALU melewati manusia.
//
// ── Aturan yang paling menentukan bentuk berkas ini ──
//
// TIDAK ADA metode manual yang membuat pesanan lunas dengan sendirinya. Tamu
// yang memilih "QRIS statis" atau "transfer" di HP-nya hanya MENGAJUKAN
// pembayaran: pesanannya berstatus AWAITING_VERIFICATION sampai ada kasir yang
// melihat uangnya masuk dan menekan Terima. Sebelum perbaikan ini, kosakata
// statusnya bahkan tidak punya kata untuk keadaan itu — hanya "menunggu",
// yang sama bunyinya dengan "belum melakukan apa-apa".
//
// Ketiga rel bermuara pada gerbang tunggal `releaseService.releaseToKitchen`.

/**
 * Relasi bersama untuk pesanan yang dikirim ke layar staf.
 *
 * Sejak layar kasir menjadi POS, bentuk pesanan yang dikirim SETIAP endpoint
 * harus sama — kartu yang muncul dari siaran webhook tidak boleh kehilangan
 * ringkasan pembayaran manual yang ada pada kartu hasil polling. Karena itu
 * definisinya tinggal di satu tempat (`lib/orderInclude.ts`).
 */
const CASHIER_INCLUDE = ORDER_INCLUDE;

/** Referensi transaksi untuk pembayaran manual (mirip jalur kasir lama). */
function manualTransactionId(): string {
  return `KSR-${randomBytes(5).toString('hex').toUpperCase()}`;
}

/**
 * Muara bersama "pesanan LUNAS": pastikan baris `payments` SUCCESS ada, tulis
 * ringkasan pembayaran, lalu rilis ke dapur lewat gerbang tunggal.
 *
 * Penulisan `payments` + ringkasan `orders` dibungkus SATU transaksi. Sebelumnya
 * keduanya berdiri sendiri, dan dua notifikasi kembar yang tiba bersamaan bisa
 * sama-sama lolos pemeriksaan "sudah ada baris payments belum" lalu sama-sama
 * mencoba membuatnya — yang kedua menabrak unique constraint dan meledak
 * menjadi 500, membuat Midtrans mengulang notifikasi yang sebenarnya sudah
 * berhasil. `upsert` di dalam transaksi menutup celah itu.
 */
async function settleOrderPaid(
  orderId: string,
  opts: { enumMethod: PaymentMethod; metodePembayaran: string; transactionId: string },
): Promise<CashierOrderDTO> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, totalAmount: true },
  });
  if (!order) throw ApiError.notFound('Pesanan tidak ditemukan');

  await prisma.$transaction(async (tx) => {
    await tx.payment.upsert({
      where: { orderId },
      create: {
        orderId,
        method: opts.enumMethod,
        status: 'SUCCESS',
        amount: order.totalAmount,
        transactionId: opts.transactionId,
      },
      update: {
        status: 'SUCCESS',
        method: opts.enumMethod,
        transactionId: opts.transactionId,
      },
    });

    await tx.order.update({
      where: { id: orderId },
      data: {
        statusPembayaran: 'PAID',
        metodePembayaran: opts.metodePembayaran,
        nominalDibayar: order.totalAmount,
      },
    });
  });

  // Transisi status + seluruh siaran (KDS/dasbor/meja) — satu gerbang bersama.
  const { order: dto } = await releaseService.releaseToKitchen(orderId);
  realtime.emitPaymentStatusChanged(dto.cafeId, {
    orderId: dto.id,
    statusPembayaran: dto.statusPembayaran,
    metodePembayaran: dto.metodePembayaran,
  });
  return dto;
}

/**
 * Uang yang tiba untuk pesanan yang SUDAH DIBATALKAN.
 *
 * Terjadi ketika tamu menekan bayar tepat setelah kasir membatalkan pesanannya.
 * Uangnya sungguhan, tapi pesanannya memang batal — dan menandainya "PAID" akan
 * membuat layar berkata pesanan ini beres, padahal yang sebenarnya terjadi
 * adalah kafe memegang uang yang harus dikembalikan. Karena itu tidak ada
 * status yang ditulis di sini; yang ditinggalkan hanya jejak audit untuk
 * diperiksa manusia.
 *
 * Dipakai kedua gateway: keduanya bisa mengirim notifikasi terlambat.
 */
async function catatUangUntukPesananBatal(
  cafeId: string,
  orderId: string,
  rincian: Record<string, unknown>,
): Promise<void> {
  console.warn('[pembayaran] pembayaran masuk untuk pesanan yang sudah batal', orderId);
  await auditLogService.catat({
    cafeId,
    aksi: AKSI_AUDIT.WEBHOOK_NOMINAL_TIDAK_COCOK,
    orderId,
    nilaiLama: { status: 'DIBATALKAN' },
    nilaiBaru: {
      alasan:
        'pembayaran diterima setelah pesanan dibatalkan — perlu pengembalian dana',
      ...rincian,
    },
  });
}

/**
 * Tulis status pembayaran non-lunas dan siarkan — hanya bila BERUBAH.
 *
 * Penjagaan "hanya bila berubah" itu penting: halaman status pelanggan
 * melakukan polling tiap 3 detik, dan menyiarkan "UNPAID → UNPAID" akan
 * membuat layar kasir memuat ulang antreannya terus-menerus tanpa ada yang
 * benar-benar berubah.
 */
async function tulisStatus(
  order: { id: string; cafeId: string; statusPembayaran: string | null },
  status: StatusPembayaran,
): Promise<void> {
  if (normalisasiStatus(order.statusPembayaran) === status) return;

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: { statusPembayaran: status },
    select: { statusPembayaran: true, metodePembayaran: true },
  });

  realtime.emitPaymentStatusChanged(order.cafeId, {
    orderId: order.id,
    statusPembayaran: updated.statusPembayaran,
    metodePembayaran: updated.metodePembayaran,
  });
}

export interface MidtransBuatResult {
  snapToken: string;
  /** `order_id` yang dikirim ke Midtrans (bukan id pesanan CafeOS). */
  orderId: string;
  grossAmount: number;
  clientKey: string | null;
  isProduction: boolean;
}

export interface DokuBuatResult {
  paymentUrl: string;
  invoiceNumber: string;
  grossAmount: number;
}

export interface StatusPembayaranResult {
  status: StatusPembayaran;
  /** Label Indonesia siap tampil — halaman tamu tidak perlu memetakan sendiri. */
  statusLabel: string;
  metodePembayaran: string | null;
  grossAmount: number;
  updatedAt: string;
  cafeName: string;
  pesanan: CashierOrderDTO;
  /** Terisi bila pesanan ini sedang menunggu verifikasi kasir. */
  verifikasi: {
    status: string;
    metode: string;
    alasanPenolakan: string | null;
    diverifikasiPada: string | null;
  } | null;
}

/** Metode yang bisa dipakai pelanggan di sebuah kafe (endpoint publik). */
export interface OpsiPembayaranResult {
  cafeId: string;
  cafeName: string;
  /** Kode metode manual yang tersedia DI CHECKOUT (bukan seluruh yang aktif). */
  metodeDiterima: string[];
  /** Rincian tiap metode checkout — instruksi, QRIS, rekening. */
  metodeDetail: OpsiMetodeDTO[];
  midtransAktif: boolean;
  dokuAktif: boolean;
}

/** Bentuk UUID — `orders.id` bertipe `@db.Uuid`, bukan teks bebas. */
const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Cari pesanan dari id CafeOS ATAU referensi gateway-nya (Midtrans/DOKU).
 *
 * `{ id: orderId }` hanya ikut bila `orderId` BERBENTUK UUID. Kolom `id`
 * bertipe `uuid` di PostgreSQL, dan Prisma menolak nilai yang bukan UUID
 * dengan P2023 — bukan "tidak ketemu", melainkan galat yang naik menjadi 500.
 *
 * Akibatnya justru menghantam kemampuan yang dijanjikan fungsi ini: dipanggil
 * dengan `order_id` Midtrans (`CAFEOS-...`) — bentuk yang dipakai halaman
 * status pembayaran staf dan callback gateway — seluruh query gagal sebelum
 * sempat mencocokkan `midtransOrderId`, sehingga pesanan yang jelas-jelas ada
 * tetap dijawab 500. Teks sembarang pun berakhir 500, bukan 404.
 */
function findOrderForStatus(orderId: string) {
  const where: Prisma.OrderWhereInput[] = [
    { midtransOrderId: orderId },
    { dokuInvoiceNumber: orderId },
  ];
  if (POLA_UUID.test(orderId)) where.push({ id: orderId });

  return prisma.order.findFirst({ where: { OR: where }, include: CASHIER_INCLUDE });
}

/**
 * Pastikan sebuah pesanan milik kafe pemanggil DAN masih bisa dibayar.
 *
 * `findFirst` dengan `cafeId` eksplisit, bukan `findUnique`: ekstensi tenant
 * hanya menyisipkan filter pada operasi berbasis where, dan menuliskannya
 * terang-terangan di sini membuat isolasinya tidak bergantung pada middleware
 * yang bisa lupa dipasang di route berikutnya.
 */
async function ambilOrderKafe(cafeId: string, orderId: string) {
  const order = await prisma.order.findFirst({
    where: { id: orderId, cafeId },
    include: { payment: true, pembayaranManual: true },
  });
  if (!order) throw ApiError.notFound('Pesanan tidak ditemukan');
  return order;
}

export const pembayaranService = {
  /**
   * Kasir menerima pembayaran manual (tunai / QRIS statis / transfer / EDC).
   *
   * Ini SATU-SATUNYA jalan sebuah pembayaran manual menjadi lunas. Metodenya
   * harus aktif DAN tersedia di kanal kasir — pemeriksaannya di server, bukan
   * hanya di tombol yang ditampilkan.
   */
  async konfirmasiManual(
    cafeId: string,
    input: ManualPaymentInput,
    aktor: AktorAudit,
  ): Promise<CashierOrderDTO> {
    const order = await ambilOrderKafe(cafeId, input.orderId);

    const opsiKasir = await paymentSettingsService.opsiMetode(cafeId, 'KASIR');
    if (!opsiKasir.some((o) => o.metode === input.metode)) {
      throw ApiError.badRequest(
        `Metode "${input.metode}" belum aktif untuk kasir di kafe ini`,
      );
    }

    const sudahLunas = order.payment?.status === 'SUCCESS';
    if (order.status !== 'MENUNGGU_PEMBAYARAN' || sudahLunas) {
      throw ApiError.conflict('Pesanan ini sudah dibayar atau tidak bisa dibayar');
    }

    const total = Number(order.totalAmount);
    if (input.metode === 'TUNAI' && input.nominal < total) {
      throw ApiError.badRequest('Uang yang diterima kurang dari total tagihan');
    }

    // Bukti + keputusan verifikasi, idempoten per pesanan. Kasir yang menagih
    // langsung sekaligus menjadi pemverifikasinya.
    await prisma.pembayaranManual.upsert({
      where: { orderId: order.id },
      create: {
        orderId: order.id,
        metode: input.metode,
        nominal: new Prisma.Decimal(input.nominal),
        catatanKasir: input.catatanKasir,
        referensi: input.referensi ?? null,
        sumber: 'KASIR',
        statusVerifikasi: 'DITERIMA',
        diverifikasiOleh: aktor.userId ?? null,
        diverifikasiPada: new Date(),
      },
      update: {
        metode: input.metode,
        nominal: new Prisma.Decimal(input.nominal),
        catatanKasir: input.catatanKasir,
        referensi: input.referensi ?? null,
        statusVerifikasi: 'DITERIMA',
        diverifikasiOleh: aktor.userId ?? null,
        diverifikasiPada: new Date(),
        alasanPenolakan: null,
      },
    });

    const dto = await settleOrderPaid(order.id, {
      enumMethod: manualMethodToEnum(input.metode),
      metodePembayaran: input.metode,
      transactionId: manualTransactionId(),
    });

    await auditLogService.catat({
      cafeId,
      aksi: AKSI_AUDIT.PEMBAYARAN_MANUAL_DITERIMA,
      aktor,
      orderId: order.id,
      nilaiLama: { statusPembayaran: normalisasiStatus(order.statusPembayaran) },
      nilaiBaru: {
        statusPembayaran: 'PAID',
        metode: input.metode,
        nominal: input.nominal,
        referensi: input.referensi ?? null,
      },
    });

    return dto;
  },

  /**
   * Pelanggan MENGAJUKAN pembayaran manual dari checkout.
   *
   * PUBLIK — pemanggilnya tamu tanpa akun, jadi kafe diturunkan dari pesanan.
   * Tidak ada uang yang berpindah di sini dan tidak ada yang dianggap lunas:
   * yang terjadi hanyalah pesanan itu masuk antrean "menunggu verifikasi" di
   * layar kasir, dan tamunya melihat status yang jujur soal itu.
   *
   * Metodenya harus benar-benar ditawarkan kafe DI CHECKOUT. Tanpa pemeriksaan
   * ini, siapa pun yang bisa memanggil endpoint ini bisa menyatakan bayar
   * "tunai di kasir" untuk pesanan mana pun dan mengaburkan antrean kasir.
   */
  async ajukanManual(input: PermintaanManualInput): Promise<StatusPembayaranResult> {
    const order = await prisma.order.findUnique({
      where: { id: input.orderId },
      include: { payment: true, pembayaranManual: true },
    });
    if (!order) throw ApiError.notFound('Pesanan tidak ditemukan');
    if (order.status !== 'MENUNGGU_PEMBAYARAN' || order.payment?.status === 'SUCCESS') {
      throw ApiError.conflict('Pesanan ini sudah dibayar');
    }

    const opsiCheckout = await paymentSettingsService.opsiMetode(order.cafeId, 'CHECKOUT');
    const metode = opsiCheckout.find((o) => o.metode === input.metode);
    if (!metode) {
      throw ApiError.badRequest(
        `Metode "${input.metode}" tidak tersedia untuk pembayaran mandiri di kafe ini`,
      );
    }

    // Pengajuan ulang untuk pesanan yang sama menimpa yang lama, bukan
    // melahirkan baris kedua — tamu yang berganti pikiran dari transfer ke
    // QRIS tidak boleh muncul dua kali di antrean kasir.
    await prisma.pembayaranManual.upsert({
      where: { orderId: order.id },
      create: {
        orderId: order.id,
        metode: input.metode,
        nominal: order.totalAmount,
        sumber: 'CHECKOUT',
        statusVerifikasi: 'MENUNGGU',
        referensi: input.referensi ?? null,
        buktiUrl: input.buktiUrl ?? null,
        buktiPublicId: input.buktiPublicId ?? null,
      },
      update: {
        metode: input.metode,
        nominal: order.totalAmount,
        sumber: 'CHECKOUT',
        statusVerifikasi: 'MENUNGGU',
        referensi: input.referensi ?? null,
        buktiUrl: input.buktiUrl ?? null,
        buktiPublicId: input.buktiPublicId ?? null,
        diverifikasiOleh: null,
        diverifikasiPada: null,
        alasanPenolakan: null,
      },
    });

    await prisma.order.update({
      where: { id: order.id },
      data: { statusPembayaran: 'AWAITING_VERIFICATION', metodePembayaran: input.metode },
    });

    // Layar kasir harus tahu ada yang menunggu diperiksa — tanpa siaran ini,
    // tamu berdiri di depan kasir yang layarnya belum berubah.
    const dto = await findOrderForStatus(order.id);
    if (dto) {
      realtime.emitKitchenOrderUpdated(order.cafeId, toOrderWithTableDTO(dto));
    }
    realtime.emitPaymentStatusChanged(order.cafeId, {
      orderId: order.id,
      statusPembayaran: 'AWAITING_VERIFICATION',
      metodePembayaran: input.metode,
    });

    await auditLogService.catat({
      cafeId: order.cafeId,
      aksi: AKSI_AUDIT.PEMBAYARAN_MANUAL_DIMINTA,
      orderId: order.id,
      nilaiBaru: { metode: input.metode, sumber: 'CHECKOUT' },
    });

    return this.statusPembayaran(order.id);
  },

  /**
   * Kasir MENOLAK sebuah pembayaran manual.
   *
   * Alasannya wajib dan tersimpan: tamu berhak tahu kenapa pesanannya tidak
   * jadi diproses, dan tanpa alasan tertulis penolakan tidak bisa ditelusuri
   * ketika ada yang mempertanyakannya besok.
   */
  async tolakManual(
    cafeId: string,
    input: TolakPembayaranInput,
    aktor: AktorAudit,
  ): Promise<CashierOrderDTO> {
    const order = await ambilOrderKafe(cafeId, input.orderId);
    if (order.payment?.status === 'SUCCESS') {
      throw ApiError.conflict('Pesanan ini sudah lunas — tidak bisa ditolak');
    }
    if (!order.pembayaranManual) {
      throw ApiError.notFound('Tidak ada pengajuan pembayaran manual untuk pesanan ini');
    }
    if (order.pembayaranManual.statusVerifikasi === 'DITOLAK') {
      // Sudah ditolak: kembalikan apa adanya, jangan menulis alasan kedua.
      const kini = await findOrderForStatus(order.id);
      if (!kini) throw ApiError.notFound('Pesanan tidak ditemukan');
      return toOrderWithTableDTO(kini);
    }

    await prisma.pembayaranManual.update({
      where: { orderId: order.id },
      data: {
        statusVerifikasi: 'DITOLAK',
        alasanPenolakan: input.alasan,
        diverifikasiOleh: aktor.userId ?? null,
        diverifikasiPada: new Date(),
      },
    });

    // Kembali ke UNPAID, bukan FAILED: tamu masih boleh mencoba lagi dengan
    // metode lain, dan pesanannya belum kemana-mana.
    await tulisStatus(order, 'UNPAID');

    await auditLogService.catat({
      cafeId,
      aksi: AKSI_AUDIT.PEMBAYARAN_MANUAL_DITOLAK,
      aktor,
      orderId: order.id,
      nilaiLama: { statusVerifikasi: order.pembayaranManual.statusVerifikasi },
      nilaiBaru: { statusVerifikasi: 'DITOLAK', alasan: input.alasan },
    });

    const kini = await findOrderForStatus(order.id);
    if (!kini) throw ApiError.notFound('Pesanan tidak ditemukan');
    const dto = toOrderWithTableDTO(kini);
    realtime.emitKitchenOrderUpdated(cafeId, dto);
    return dto;
  },

  /** Pesanan yang menunggu verifikasi pembayaran manual (antrean kasir). */
  async menungguVerifikasi(cafeId: string): Promise<CashierOrderDTO[]> {
    const orders = await prisma.order.findMany({
      where: {
        cafeId,
        status: 'MENUNGGU_PEMBAYARAN',
        pembayaranManual: { statusVerifikasi: 'MENUNGGU' },
      },
      orderBy: { createdAt: 'asc' },
      include: CASHIER_INCLUDE,
    });
    return orders.map(toOrderWithTableDTO);
  },

  /** Metode yang tersedia di sebuah kafe — dibaca halaman checkout pelanggan. */
  async opsiPublik(cafeId: string): Promise<OpsiPembayaranResult> {
    const cafe = await prisma.cafe.findUnique({
      where: { id: cafeId },
      select: { id: true, name: true },
    });
    if (!cafe) throw ApiError.notFound('Kafe tidak ditemukan');

    const [metodeDetail, kredensial] = await Promise.all([
      paymentSettingsService.opsiMetode(cafeId, 'CHECKOUT'),
      paymentSettingsService.kredensialAktif(cafeId),
    ]);

    return {
      cafeId: cafe.id,
      cafeName: cafe.name,
      metodeDiterima: metodeDetail.map((m) => m.metode),
      metodeDetail,
      midtransAktif: Boolean(kredensial?.clientKey),
      dokuAktif: isDokuEnabled(),
    };
  },

  /**
   * Buat transaksi Midtrans (Snap) untuk sebuah pesanan.
   *
   * Dipanggil PELANGGAN yang tidak login, jadi kafe (beserta kredensialnya)
   * diambil dari pesanan — bukan dari input klien. Kredensial yang dipakai
   * SELALU milik mode yang sedang aktif; tidak ada jatuh-balik ke mode lain.
   */
  async buatMidtrans(orderId: string): Promise<MidtransBuatResult> {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: ITEM_TERURUT, payment: true },
    });
    if (!order) throw ApiError.notFound('Pesanan tidak ditemukan');
    if (order.status !== 'MENUNGGU_PEMBAYARAN' || order.payment?.status === 'SUCCESS') {
      throw ApiError.conflict('Pesanan ini sudah dibayar');
    }

    const kredensial = await paymentSettingsService.kredensialAktif(order.cafeId);
    if (!kredensial) {
      throw ApiError.badRequest('Midtrans belum dikonfigurasi untuk cafe ini');
    }

    // Susun item + gross_amount dari harga yang SUDAH dibulatkan agar jumlahnya
    // pas dengan gross_amount (syarat Midtrans). IDR memang tanpa sen.
    const itemDetails = order.items.map((item) => ({
      id: item.menuItemId,
      price: Math.round(Number(item.price)),
      quantity: item.quantity,
      name: item.name.slice(0, 50),
    }));
    const grossAmount = itemDetails.reduce((sum, i) => sum + i.price * i.quantity, 0);

    const midtransOrderId = `CAFEOS-${order.cafeId.slice(0, 8)}-${order.id.slice(0, 8)}-${Date.now()}`;

    // Kanal yang ditawarkan disusun PER TRANSAKSI dari kafe & mode yang sudah
    // terverifikasi — lihat `lib/midtransChannels.ts` untuk alasan daftarnya
    // tidak boleh ditulis sebagai literal di sini lagi.
    const enabledPayments = bangunEnabledPayments({
      cafeId: order.cafeId,
      mode: kredensial.mode,
    });

    let transaction;
    try {
      const snap = getMidtransSnap(kredensial);
      transaction = await snap.createTransaction({
        transaction_details: { order_id: midtransOrderId, gross_amount: grossAmount },
        item_details: itemDetails,
        enabled_payments: enabledPayments,
      });
    } catch (err) {
      // Galat gateway/kredensial → 400 yang ramah (bukan 500 mentah).
      const message = err instanceof Error ? err.message : 'Gagal menghubungi Midtrans';
      throw ApiError.badRequest(`Gagal membuat transaksi Midtrans: ${message}`);
    }

    const percobaanSebelumnya = order.midtransOrderId;

    await prisma.order.update({
      where: { id: order.id },
      data: {
        snapToken: transaction.token,
        midtransOrderId,
        statusPembayaran: 'UNPAID',
      },
    });

    // Riwayat percobaan bayar. `orders` hanya menyimpan percobaan TERAKHIR —
    // "Coba Bayar Lagi" menimpa `midtransOrderId` supaya QR lama tidak bisa
    // lagi melunasi pesanan ini. Tanpa catatan ini, referensi percobaan yang
    // ditimpa hilang sama sekali, dan notifikasi susulan dari QR lama tidak
    // punya jejak apa pun untuk ditelusuri kasir.
    await auditLogService.catat({
      cafeId: order.cafeId,
      aksi: AKSI_AUDIT.MIDTRANS_PERCOBAAN_DIBUAT,
      orderId: order.id,
      nilaiLama: percobaanSebelumnya ? { midtransOrderId: percobaanSebelumnya } : null,
      nilaiBaru: {
        midtransOrderId,
        grossAmount,
        mode: kredensial.mode,
        enabledPayments,
      },
    });

    return {
      snapToken: transaction.token,
      orderId: midtransOrderId,
      grossAmount,
      clientKey: kredensial.clientKey,
      isProduction: kredensial.mode === 'PRODUCTION',
    };
  },

  /** Buat halaman pembayaran DOKU Checkout (gateway platform). */
  async buatDoku(orderId: string): Promise<DokuBuatResult> {
    if (!isDokuEnabled()) {
      throw ApiError.badRequest('DOKU belum dikonfigurasi di server');
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: ITEM_TERURUT, payment: true },
    });
    if (!order) throw ApiError.notFound('Pesanan tidak ditemukan');
    if (order.status !== 'MENUNGGU_PEMBAYARAN' || order.payment?.status === 'SUCCESS') {
      throw ApiError.conflict('Pesanan ini sudah dibayar');
    }

    const items = order.items.map((item) => ({
      name: item.name,
      price: Math.round(Number(item.price)),
      quantity: item.quantity,
    }));
    const grossAmount = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

    let hasil;
    try {
      hasil = await buatDokuCheckout({
        orderId: order.id,
        cafeId: order.cafeId,
        grossAmount,
        items,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal menghubungi DOKU';
      throw ApiError.badRequest(`Gagal membuat pembayaran DOKU: ${message}`);
    }

    await prisma.order.update({
      where: { id: order.id },
      data: { dokuInvoiceNumber: hasil.invoiceNumber, statusPembayaran: 'UNPAID' },
    });

    return {
      paymentUrl: hasil.paymentUrl,
      invoiceNumber: hasil.invoiceNumber,
      grossAmount,
    };
  },

  /**
   * Webhook Midtrans. SELALU selesai tanpa melempar — route membalas 200 apa
   * pun hasilnya (gateway mengulang bila menerima non-200).
   *
   * Empat penjagaan berlapis, berurutan dari yang paling murah:
   *
   *   1. **Signature** — SHA512(order_id + status_code + gross_amount +
   *      serverKey), dibandingkan `timingSafeEqual`. Semua mode yang punya
   *      kredensial dicoba, karena dasbor Sandbox & Production menunjuk URL
   *      yang sama. Tanpa lapisan ini, siapa pun yang tahu URL-nya bisa
   *      menyatakan pesanan orang lain lunas.
   *   2. **Kepemilikan** — pesanan dicari dengan `cafeId` dari URL. `cafeId`
   *      di URL sendiri bukan keamanan; yang mengunci adalah signature yang
   *      hanya bisa dibuat pemegang Server Key kafe itu, DITAMBAH filter ini
   *      supaya notifikasi sah milik kafe A tidak bisa menyentuh pesanan kafe B.
   *   3. **Idempotensi** — notifikasi dicatat di `gateway_webhook_events` dengan
   *      unique constraint. Yang kembar kalah di database, bukan di logika
   *      aplikasi yang bisa balapan.
   *   4. **Nominal** — `gross_amount` harus sama dengan tagihan. Yang tidak
   *      cocok TIDAK dilunaskan; ia dicatat ke audit log untuk diperiksa manusia.
   */
  async handleNotifikasi(cafeId: string, payload: Record<string, unknown>): Promise<void> {
    const orderIdGateway = String(payload.order_id ?? '');
    const statusCode = String(payload.status_code ?? '');
    const grossAmount = String(payload.gross_amount ?? '');
    const signatureKey = String(payload.signature_key ?? '');
    const transactionStatus = payload.transaction_status as string | undefined;

    if (!orderIdGateway || !signatureKey) {
      console.warn('[pembayaran] webhook: payload tidak lengkap');
      return;
    }

    const kandidat = await paymentSettingsService.semuaKredensial(cafeId);
    if (kandidat.length === 0) {
      console.warn('[pembayaran] webhook: kafe tidak punya kredensial Midtrans', cafeId);
      return;
    }

    const cocok = kandidat.find((k) =>
      signatureCocok(orderIdGateway + statusCode + grossAmount + k.serverKey, signatureKey),
    );
    if (!cocok) {
      console.warn('[pembayaran] webhook: signature tidak cocok', orderIdGateway);
      await auditLogService.catat({
        cafeId,
        aksi: AKSI_AUDIT.WEBHOOK_DITOLAK,
        nilaiBaru: { alasan: 'signature tidak cocok', orderIdGateway, transactionStatus },
      });
      return;
    }

    // Notifikasi bersignature sah membuktikan URL webhook memang sampai ke
    // server ini dengan kunci mode tersebut — itulah "webhook terverifikasi".
    await paymentSettingsService.tandaiWebhookTerverifikasi(cafeId, cocok.mode);

    let order = await prisma.order.findFirst({
      where: { midtransOrderId: orderIdGateway, cafeId },
      select: PILIH_ORDER_MIDTRANS,
    });

    // Tidak ketemu lewat referensi persis? Bisa jadi ini notifikasi milik
    // percobaan bayar yang sudah DIGANTIKAN — tamu menekan "Coba Bayar Lagi",
    // dan `midtransOrderId` pesanan kini menunjuk percobaan yang lebih baru.
    const percobaanLama = order === null;
    if (!order) order = await cariPesananPercobaanLama(cafeId, orderIdGateway);

    if (!order) {
      console.warn('[pembayaran] webhook: pesanan tidak ditemukan', orderIdGateway);
      return;
    }

    const status = mapMidtransStatus(
      transactionStatus,
      payload.fraud_status as string | undefined,
    );

    // Percobaan lama yang TIDAK berujung uang masuk (expire/cancel/deny) hanya
    // dicatat. Menuliskan statusnya akan menimpa percobaan baru yang barangkali
    // sedang ditunggu tamu di layarnya — QR lama yang kedaluwarsa tidak boleh
    // membatalkan QR yang baru saja terbit.
    if (percobaanLama && !statusLunas(status)) {
      console.warn(
        '[pembayaran] webhook: notifikasi percobaan lama diabaikan',
        orderIdGateway,
      );
      await auditLogService.catat({
        cafeId,
        aksi: AKSI_AUDIT.MIDTRANS_PERCOBAAN_LAMA,
        orderId: order.id,
        nilaiBaru: {
          alasan: 'percobaan sudah digantikan, status bukan lunas — diabaikan',
          orderIdGateway,
          transactionStatus,
          mode: cocok.mode,
        },
      });
      return;
    }

    const baru = await catatEventWebhook({
      cafeId,
      gateway: 'midtrans',
      eventKey: `${orderIdGateway}:${transactionStatus ?? '-'}:${statusCode}`,
      orderId: order.id,
      transactionStatus,
      grossAmount,
    });
    if (!baru) return; // Notifikasi kembar — sudah diproses sebelumnya.

    if (percobaanLama) {
      // Uang benar-benar masuk lewat QR/VA percobaan sebelumnya. Ia tetap milik
      // pesanan ini, jadi tidak boleh dibuang begitu saja.
      await auditLogService.catat({
        cafeId,
        aksi: AKSI_AUDIT.MIDTRANS_PERCOBAAN_LAMA,
        orderId: order.id,
        nilaiBaru: {
          alasan: 'pembayaran diterima lewat percobaan yang sudah digantikan',
          orderIdGateway,
          transactionStatus,
          mode: cocok.mode,
        },
      });

      // Pesanan sudah lunas dari percobaan lain → dua kali bayar untuk satu
      // tagihan. Pesanan TIDAK disentuh lagi (tiket dapur & omzet tetap satu);
      // yang dibutuhkan manusia: pengembalian dana.
      if (statusLunas(normalisasiStatus(order.statusPembayaran))) {
        console.warn('[pembayaran] pembayaran ganda terdeteksi', order.id);
        await auditLogService.catat({
          cafeId,
          aksi: AKSI_AUDIT.PEMBAYARAN_GANDA,
          orderId: order.id,
          nilaiLama: { statusPembayaran: 'PAID' },
          nilaiBaru: {
            alasan: 'pesanan sudah lunas, uang kedua masuk — perlu pengembalian dana',
            orderIdGateway,
            grossAmount,
            mode: cocok.mode,
          },
        });
        return;
      }
    }

    await applyMidtransResult(order, payload, { cafeId, mode: cocok.mode });
  },

  /** Webhook DOKU. Sama seperti Midtrans: selalu selesai tanpa melempar. */
  async handleNotifikasiDoku(
    headers: Record<string, string | string[] | undefined>,
    payload: Record<string, unknown>,
    opts: { rawBody: string; requestTarget: string },
  ): Promise<void> {
    if (!isDokuEnabled()) {
      console.warn('[doku] webhook: DOKU belum dikonfigurasi, notifikasi diabaikan');
      return;
    }

    const sah = verifikasiSignatureDoku({
      headers,
      rawBody: opts.rawBody,
      requestTarget: opts.requestTarget,
    });
    if (!sah) {
      console.warn('[doku] webhook: signature tidak cocok, notifikasi diabaikan');
      return;
    }

    const invoiceNumber = ambilInvoiceNumberDoku(payload);
    if (!invoiceNumber) {
      console.warn('[doku] webhook: invoice_number tidak ada di payload');
      return;
    }

    const order = await prisma.order.findFirst({
      where: { dokuInvoiceNumber: invoiceNumber },
      select: {
        id: true,
        cafeId: true,
        status: true,
        statusPembayaran: true,
        totalAmount: true,
      },
    });
    if (!order) {
      console.warn('[doku] webhook: pesanan tidak ditemukan', invoiceNumber);
      return;
    }

    const transaction = payload.transaction as Record<string, unknown> | undefined;
    const response = payload.response as Record<string, unknown> | undefined;
    // DOKU menandai sukses lewat status transaksi ATAU response code "5000".
    const status: StatusPembayaran =
      String(response?.code ?? '') === '5000'
        ? 'PAID'
        : mapDokuStatus(transaction?.status as string | undefined);

    const baru = await catatEventWebhook({
      cafeId: order.cafeId,
      gateway: 'doku',
      eventKey: `${invoiceNumber}:${String(transaction?.status ?? response?.code ?? '-')}`,
      orderId: order.id,
      transactionStatus: String(transaction?.status ?? ''),
      grossAmount: String((transaction?.amount as string | number | undefined) ?? ''),
    });
    if (!baru) return;

    if (statusLunas(status) && order.status === 'DIBATALKAN') {
      await catatUangUntukPesananBatal(order.cafeId, order.id, {
        transactionStatus: String(transaction?.status ?? ''),
        gateway: 'doku',
      });
      return;
    }

    if (statusLunas(status) && order.status === 'MENUNGGU_PEMBAYARAN') {
      const channel = payload.channel as Record<string, unknown> | undefined;
      const channelId = channel?.id as string | undefined;
      await settleOrderPaid(order.id, {
        enumMethod: dokuChannelToEnum(channelId),
        metodePembayaran: dokuChannelToKode(channelId),
        transactionId: (transaction?.original_request_id as string) ?? invoiceNumber,
      });
      return;
    }

    await tulisStatus(order, status);
  },

  /**
   * Status pembayaran sebuah pesanan — sumber tunggal untuk polling halaman
   * status (pelanggan maupun kasir). Menerima id pesanan CafeOS ATAU `order_id`
   * Midtrans.
   *
   * Pesanan jalur Midtrans yang belum final direkonsiliasi dulu ke Core API
   * supaya tidak bergantung pada webhook yang bisa telat. Bila gateway tidak
   * terjangkau, status lokal yang dipakai.
   */
  async statusPembayaran(orderId: string): Promise<StatusPembayaranResult> {
    let order = await findOrderForStatus(orderId);
    if (!order) throw ApiError.notFound('Pesanan tidak ditemukan');

    const cafe = await prisma.cafe.findUnique({
      where: { id: order.cafeId },
      select: { name: true },
    });
    const midtransOrderId = order.midtransOrderId;
    let grossGateway: number | null = null;

    // Pesanan lunas tidak perlu ditanyakan lagi; pesanan jalur manual memang
    // tidak punya transaksi di Midtrans.
    if (midtransOrderId && !statusLunas(normalisasiStatus(order.statusPembayaran))) {
      const kredensial = await paymentSettingsService.kredensialAktif(order.cafeId);
      if (kredensial) {
        try {
          const core = getMidtransCoreApi(kredensial);
          const res = await core.transaction.status(midtransOrderId);
          if (res.gross_amount) grossGateway = Number(res.gross_amount);
          await applyMidtransResult(order, res, {
            cafeId: order.cafeId,
            mode: kredensial.mode,
          });
          // Baca ulang: rekonsiliasi bisa memindahkan pesanan ke dapur.
          order = (await findOrderForStatus(order.id)) ?? order;
        } catch (err) {
          console.warn(
            '[pembayaran] status: gagal menghubungi Midtrans, pakai status lokal',
            err,
          );
        }
      }
    }

    const manual = await prisma.pembayaranManual.findUnique({
      where: { orderId: order.id },
    });
    const status = normalisasiStatus(order.statusPembayaran);

    return {
      status,
      statusLabel: labelStatus(status),
      metodePembayaran: order.metodePembayaran,
      grossAmount: grossGateway ?? Number(order.nominalDibayar ?? order.totalAmount),
      updatedAt: order.updatedAt.toISOString(),
      cafeName: cafe?.name ?? 'CafeOS',
      pesanan: toOrderWithTableDTO(order),
      verifikasi: manual
        ? {
            status: manual.statusVerifikasi,
            metode: manual.metode,
            alasanPenolakan: manual.alasanPenolakan,
            diverifikasiPada: manual.diverifikasiPada?.toISOString() ?? null,
          }
        : null,
    };
  },

  /**
   * Riwayat pembayaran kafe (dibatasi tenant). Bisa disaring status & rentang
   * tanggal pembuatan pesanan. Terbaru lebih dulu.
   */
  async riwayat(filter: {
    status?: StatusPembayaran;
    dari?: Date;
    sampai?: Date;
  }): Promise<CashierOrderDTO[]> {
    const where: Prisma.OrderWhereInput = {};
    if (filter.status) {
      // Baris lama berkosakata Indonesia ikut terjaring: migrasi sudah
      // memetakannya, tapi replika baca yang tertinggal atau baris yang ditulis
      // instance versi lama masih mungkin memakai kata lama.
      where.statusPembayaran = { in: nilaiSetara(filter.status) };
    }
    if (filter.dari || filter.sampai) {
      where.createdAt = {};
      if (filter.dari) where.createdAt.gte = filter.dari;
      if (filter.sampai) where.createdAt.lte = filter.sampai;
    }

    const orders = await prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: CASHIER_INCLUDE,
    });
    return orders.map(toOrderWithTableDTO);
  },
};

/** Kosakata lama yang setara dengan sebuah status kanonik. */
function nilaiSetara(status: StatusPembayaran): string[] {
  switch (status) {
    case 'UNPAID':
      return ['UNPAID', 'MENUNGGU'];
    case 'PAID':
      return ['PAID', 'LUNAS'];
    case 'FAILED':
      return ['FAILED', 'GAGAL'];
    default:
      return [status];
  }
}

/**
 * Bandingkan signature dalam waktu tetap.
 *
 * Perbandingan `!==` biasa berhenti pada byte pertama yang berbeda, sehingga
 * lamanya menjawab membocorkan seberapa jauh tebakan penyerang benar. Untuk
 * digest 128 karakter, kebocoran itu kecil tapi gratis untuk ditutup.
 */
/** Kolom pesanan seperlunya untuk menerapkan hasil Midtrans. */
const PILIH_ORDER_MIDTRANS = {
  id: true,
  cafeId: true,
  status: true,
  statusPembayaran: true,
  totalAmount: true,
} as const;

/**
 * Cari pesanan pemilik sebuah `order_id` Midtrans yang sudah DIGANTIKAN.
 *
 * Setiap "Coba Bayar Lagi" menerbitkan `order_id` baru dan menimpa
 * `midtransOrderId` pesanan. Itu memang disengaja — QR lama jadi tidak bisa
 * lagi melunasi pesanan ini — tapi akibatnya notifikasi susulan dari percobaan
 * lama tidak menemukan pesanannya, dan tamu yang terlanjur membayar QR lama
 * kehilangan uangnya tanpa jejak.
 *
 * Yang menghubungkan keduanya adalah AWALAN `order_id`:
 *
 *   CAFEOS-{cafeId 8 huruf}-{orderId 8 huruf}-{timestamp}
 *                                              ^ hanya bagian ini yang berubah
 *
 * Awalan itu tetap sama di seluruh percobaan pesanan yang sama, jadi pencarian
 * cukup memakainya. Hasil dianggap sah HANYA bila persis satu pesanan cocok:
 * potongan 8 karakter bisa bertabrakan, dan menebak dalam keadaan ambigu jauh
 * lebih berbahaya daripada tidak menemukan apa-apa.
 *
 * `cafeId` tetap ikut menyaring — sama seperti jalur biasa, notifikasi kafe A
 * tidak boleh menyentuh pesanan kafe B.
 */
async function cariPesananPercobaanLama(cafeId: string, orderIdGateway: string) {
  const cocok = /^(CAFEOS-.+-)\d+$/.exec(orderIdGateway);
  if (!cocok) return null;

  const kandidat = await prisma.order.findMany({
    where: { cafeId, midtransOrderId: { startsWith: cocok[1] } },
    select: PILIH_ORDER_MIDTRANS,
    take: 2,
  });
  return kandidat.length === 1 ? kandidat[0] : null;
}

function signatureCocok(bahan: string, signature: string): boolean {
  const harapan = createHash('sha512').update(bahan).digest('hex');
  if (harapan.length !== signature.length) return false;
  try {
    return timingSafeEqual(Buffer.from(harapan), Buffer.from(signature));
  } catch {
    return false;
  }
}

/**
 * Catat notifikasi gateway. `false` bila notifikasi itu SUDAH pernah diproses.
 *
 * Unique constraint `(gateway, event_key)` yang jadi wasitnya: dua notifikasi
 * kembar yang tiba pada milidetik yang sama tidak bisa dua-duanya menang, dan
 * yang kalah menerima P2002 lalu berhenti. Ini penjagaan yang tidak bisa
 * dilakukan pemeriksaan "sudah lunas belum" di aplikasi, karena keduanya bisa
 * membaca keadaan yang sama sebelum salah satunya sempat menulis.
 */
async function catatEventWebhook(input: {
  cafeId: string;
  gateway: string;
  eventKey: string;
  orderId: string;
  transactionStatus?: string;
  grossAmount?: string;
}): Promise<boolean> {
  const nominal = Number(input.grossAmount);
  try {
    await prisma.gatewayWebhookEvent.create({
      data: {
        cafeId: input.cafeId,
        gateway: input.gateway,
        eventKey: input.eventKey,
        orderId: input.orderId,
        transactionStatus: input.transactionStatus ?? null,
        grossAmount: Number.isFinite(nominal) ? new Prisma.Decimal(nominal) : null,
      },
    });
    return true;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return false;
    }
    throw err;
  }
}

/**
 * Ambil `invoice_number` dari notifikasi DOKU. Bentuk payload berbeda antar
 * kanal DOKU (ada yang membungkusnya dalam `response`), jadi semua letak yang
 * dikenal dicoba — kunci ini yang menghubungkan notifikasi ke pesanan kami.
 */
function ambilInvoiceNumberDoku(payload: Record<string, unknown>): string | null {
  const order = payload.order as Record<string, unknown> | undefined;
  const response = payload.response as Record<string, unknown> | undefined;
  const orderResponse = response?.order as Record<string, unknown> | undefined;

  const kandidat = [order?.invoice_number, payload.invoice_number, orderResponse?.invoice_number];
  for (const nilai of kandidat) {
    if (typeof nilai === 'string' && nilai.trim() !== '') return nilai.trim();
  }
  return null;
}

/** Pesanan seperlunya untuk menerapkan hasil Midtrans. */
type OrderUntukMidtrans = {
  id: string;
  cafeId: string;
  status: OrderStatus;
  statusPembayaran: string | null;
  totalAmount: Prisma.Decimal;
};

/**
 * Terapkan hasil Midtrans ke pesanan (dipakai webhook & polling).
 *
 * Pesanan yang sudah pindah dari MENUNGGU_PEMBAYARAN tidak dirilis ulang —
 * itulah yang membuat notifikasi ganda tidak menggandakan tiket dapur, bahkan
 * seandainya lolos dari penjagaan idempotensi di atasnya.
 */
async function applyMidtransResult(
  order: OrderUntukMidtrans,
  data: Record<string, unknown>,
  konteks: { cafeId: string; mode: MidtransMode },
): Promise<void> {
  const status = mapMidtransStatus(
    data.transaction_status as string | undefined,
    data.fraud_status as string | undefined,
  );

  if (statusLunas(status) && order.status === 'DIBATALKAN') {
    await catatUangUntukPesananBatal(konteks.cafeId, order.id, {
      transactionStatus: String(data.transaction_status ?? ''),
      mode: konteks.mode,
    });
    return;
  }

  if (statusLunas(status) && order.status === 'MENUNGGU_PEMBAYARAN') {
    // Nominal yang diklaim gateway harus sama dengan tagihan. Selisih di sini
    // berarti ada yang tidak beres — tagihan yang berubah setelah terbit, atau
    // notifikasi yang tidak semestinya. Apa pun sebabnya, pesanan TIDAK
    // dilunaskan otomatis; ia ditinggalkan untuk diperiksa manusia.
    const diklaim = Math.round(Number(data.gross_amount ?? NaN));
    const ditagih = Math.round(Number(order.totalAmount));
    if (Number.isFinite(diklaim) && diklaim !== ditagih) {
      console.warn('[pembayaran] nominal notifikasi tidak cocok', {
        orderId: order.id,
        diklaim,
        ditagih,
      });
      await auditLogService.catat({
        cafeId: konteks.cafeId,
        aksi: AKSI_AUDIT.WEBHOOK_NOMINAL_TIDAK_COCOK,
        orderId: order.id,
        nilaiLama: { ditagih },
        nilaiBaru: { diklaim, mode: konteks.mode },
      });
      await tulisStatus(order, 'AWAITING_VERIFICATION');
      return;
    }

    const paymentType = data.payment_type as string | undefined;
    const vaNumbers = data.va_numbers as Array<{ bank?: string }> | undefined;
    await settleOrderPaid(order.id, {
      enumMethod: midtransPaymentTypeToEnum(paymentType),
      metodePembayaran: labelMidtransPaymentType(paymentType, vaNumbers),
      transactionId: (data.order_id as string) ?? order.id,
    });

    await auditLogService.catat({
      cafeId: konteks.cafeId,
      aksi: AKSI_AUDIT.WEBHOOK_DITERIMA,
      orderId: order.id,
      nilaiBaru: {
        statusPembayaran: 'PAID',
        transactionStatus: String(data.transaction_status ?? ''),
        mode: konteks.mode,
      },
    });
    return;
  }

  await tulisStatus(order, status);
}
