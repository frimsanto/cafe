import { createHash, randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { OrderStatus, PaymentMethod } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/ApiError';
import { dekripsi } from '../lib/enkripsi';
import { getMidtransSnap, getMidtransCoreApi } from '../lib/midtrans';
import { buatDokuCheckout, isDokuEnabled, verifikasiSignatureDoku } from '../lib/doku';
import {
  dokuChannelToEnum,
  dokuChannelToKode,
  labelMidtransPaymentType,
  manualMethodToEnum,
  mapDokuStatus,
  mapMidtransStatus,
  midtransPaymentTypeToEnum,
  type ManualMethod,
  type StatusPembayaran,
} from '../lib/paymentMethods';
import { releaseService } from './release.service';
import { realtime } from '../realtime/realtime';
import { toOrderWithTableDTO } from '../dto/order.dto';
import type { CashierOrderDTO } from '../dto/cashier.dto';
import type { ManualPaymentInput } from '../validation/pembayaran.validation';

// Jalur pembayaran tiga rel:
//   - Midtrans: pelanggan bayar sendiri via Snap (QRIS dinamis / e-wallet / VA),
//               gateway memberi tahu hasilnya lewat webhook. Kredensial PER KAFE.
//               INI JALUR UTAMA bagi kafe yang punya akun Midtrans sendiri.
//   - DOKU    : checkout hosted DOKU dengan kredensial GLOBAL milik platform
//               (dari environment, bukan database). Dipakai kafe yang tidak punya
//               akun gateway sendiri, tapi tetap ingin pembayaran otomatis.
//   - Manual  : kasir yang mengonfirmasi tunai / QRIS statis / transfer / EDC.
//
// Simulasi pembayaran lama sudah dihapus — tidak ada jalur "pura-pura lunas".
//
// Ketiganya bermuara pada gerbang tunggal `releaseService.releaseToKitchen`:
// mencatat baris `payments` (SUCCESS) lalu memindahkan pesanan ke dapur dan
// menyiarkan event yang sama (KDS, dasbor omzet, status meja). Field
// `orders.status_pembayaran/metode_pembayaran/nominal_dibayar` adalah ringkasan
// domain baru yang menyertainya.

const CASHIER_INCLUDE = {
  items: true,
  payment: true,
  table: { select: { tableName: true } },
} as const;

/** Referensi transaksi untuk pembayaran manual (mirip jalur kasir lama). */
function manualTransactionId(): string {
  return `KSR-${randomBytes(5).toString('hex').toUpperCase()}`;
}

/**
 * Muara bersama "pesanan LUNAS": pastikan baris `payments` SUCCESS ada (dipetakan
 * ke enum lama), tulis ringkasan pembayaran baru, lalu rilis ke dapur lewat
 * gerbang tunggal. Idempoten — aman dipanggil ulang (mis. webhook ganda).
 */
async function settleOrderPaid(
  orderId: string,
  opts: { enumMethod: PaymentMethod; metodePembayaran: string; transactionId: string },
): Promise<CashierOrderDTO> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { payment: true },
  });
  if (!order) throw ApiError.notFound('Pesanan tidak ditemukan');

  // Baris `payments` (enum) — dibutuhkan gerbang rilis & laporan omzet.
  if (!order.payment) {
    await prisma.payment.create({
      data: {
        orderId,
        method: opts.enumMethod,
        status: 'SUCCESS',
        amount: order.totalAmount,
        transactionId: opts.transactionId,
      },
    });
  } else if (order.payment.status !== 'SUCCESS') {
    await prisma.payment.update({
      where: { orderId },
      data: {
        status: 'SUCCESS',
        method: opts.enumMethod,
        transactionId: opts.transactionId ?? order.payment.transactionId,
      },
    });
  }

  // Ringkasan pembayaran domain baru.
  await prisma.order.update({
    where: { id: orderId },
    data: {
      statusPembayaran: 'LUNAS',
      metodePembayaran: opts.metodePembayaran,
      nominalDibayar: order.totalAmount,
    },
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

export interface MidtransBuatResult {
  snapToken: string;
  /** `order_id` yang dikirim ke Midtrans (bukan id pesanan CafeOS). */
  orderId: string;
  grossAmount: number;
  clientKey: string | null;
  isProduction: boolean;
}

export interface DokuBuatResult {
  /** Halaman pembayaran DOKU — pelanggan diarahkan ke sini. */
  paymentUrl: string;
  /** `invoice_number` yang dikirim ke DOKU (bukan id pesanan CafeOS). */
  invoiceNumber: string;
  grossAmount: number;
}

export interface StatusPembayaranResult {
  status: StatusPembayaran | string;
  metodePembayaran: string | null;
  grossAmount: number;
  updatedAt: string;
  /** Nama kafe — halaman status pelanggan menyebutnya, dan tamu tidak login. */
  cafeName: string;
  /** Pesanan lengkap (item, meja, total) agar halaman status berdiri sendiri. */
  pesanan: CashierOrderDTO;
}

/** Metode yang bisa dipakai pelanggan di sebuah kafe (endpoint publik). */
export interface OpsiPembayaranResult {
  cafeId: string;
  cafeName: string;
  /** Kode metode manual yang diaktifkan kafe (dikonfirmasi kasir). */
  metodeDiterima: string[];
  /** True bila kredensial Midtrans kafe sudah disetel — jalur utama. */
  midtransAktif: boolean;
  /**
   * True bila DOKU Checkout aktif di platform. Global (bukan per kafe) dan
   * hanya berupa boolean — kredensialnya tidak pernah dikirim ke klien.
   */
  dokuAktif: boolean;
}

/** Cari pesanan dari id CafeOS ATAU referensi gateway-nya (Midtrans/DOKU). */
function findOrderForStatus(orderId: string) {
  return prisma.order.findFirst({
    where: {
      OR: [{ midtransOrderId: orderId }, { dokuInvoiceNumber: orderId }, { id: orderId }],
    },
    include: CASHIER_INCLUDE,
  });
}

export const pembayaranService = {
  /**
   * Konfirmasi pembayaran manual oleh kasir. `cafeId` berasal dari token; konteks
   * tenant memastikan pesanan yang dicari memang milik kafe pengguna.
   */
  async konfirmasiManual(
    cafeId: string,
    input: ManualPaymentInput,
  ): Promise<CashierOrderDTO> {
    const order = await prisma.order.findFirst({
      where: { id: input.orderId },
      include: { payment: true },
    });
    if (!order) throw ApiError.notFound('Pesanan tidak ditemukan');

    // Metode harus diaktifkan kafe ini.
    const cafe = await prisma.cafe.findUnique({
      where: { id: cafeId },
      select: { metodeDiterima: true },
    });
    if (!cafe || !cafe.metodeDiterima.includes(input.metode)) {
      throw ApiError.badRequest(`Metode "${input.metode}" belum diaktifkan untuk kafe ini`);
    }

    const alreadyPaid = order.payment?.status === 'SUCCESS';
    if (order.status !== 'MENUNGGU_PEMBAYARAN' || (order.payment && !alreadyPaid)) {
      throw ApiError.conflict('Pesanan ini sudah dibayar atau tidak bisa dibayar');
    }

    const total = Number(order.totalAmount);
    if (input.metode === 'TUNAI' && input.nominal < total) {
      throw ApiError.badRequest('Uang yang diterima kurang dari total tagihan');
    }

    // Bukti pembayaran manual — idempoten per pesanan.
    await prisma.pembayaranManual.upsert({
      where: { orderId: order.id },
      create: {
        orderId: order.id,
        metode: input.metode,
        nominal: new Prisma.Decimal(input.nominal),
        catatanKasir: input.catatanKasir,
      },
      update: {
        metode: input.metode,
        nominal: new Prisma.Decimal(input.nominal),
        catatanKasir: input.catatanKasir,
      },
    });

    return settleOrderPaid(order.id, {
      enumMethod: manualMethodToEnum(input.metode as ManualMethod),
      metodePembayaran: input.metode,
      transactionId: manualTransactionId(),
    });
  },

  /** Metode yang tersedia di sebuah kafe — dibaca halaman checkout pelanggan. */
  async opsiPublik(cafeId: string): Promise<OpsiPembayaranResult> {
    const cafe = await prisma.cafe.findUnique({
      where: { id: cafeId },
      select: { id: true, name: true, metodeDiterima: true, midtransAktif: true },
    });
    if (!cafe) throw ApiError.notFound('Kafe tidak ditemukan');

    return {
      cafeId: cafe.id,
      cafeName: cafe.name,
      metodeDiterima: cafe.metodeDiterima,
      midtransAktif: cafe.midtransAktif,
      dokuAktif: isDokuEnabled(),
    };
  },

  /**
   * Buat transaksi Midtrans (Snap) untuk sebuah pesanan. Menyimpan snapToken &
   * midtransOrderId agar webhook/polling bisa mencocokkan kembali.
   *
   * Dipanggil PELANGGAN yang tidak login, jadi `cafeId` diambil dari pesanan —
   * bukan dari input klien. Yang bisa dilakukan pemegang sebuah `orderId`
   * hanyalah menerbitkan tagihan untuk pesanan itu sendiri, ke rekening kafe
   * pemiliknya.
   */
  async buatMidtrans(orderId: string): Promise<MidtransBuatResult> {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true, payment: true },
    });
    if (!order) throw ApiError.notFound('Pesanan tidak ditemukan');
    if (order.status !== 'MENUNGGU_PEMBAYARAN' || order.payment?.status === 'SUCCESS') {
      throw ApiError.conflict('Pesanan ini sudah dibayar');
    }

    const cafe = await prisma.cafe.findUnique({ where: { id: order.cafeId } });
    if (!cafe || !cafe.midtransAktif) {
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

    const midtransOrderId = `CAFEOS-${cafe.id.slice(0, 8)}-${order.id.slice(0, 8)}-${Date.now()}`;

    let transaction;
    try {
      const snap = getMidtransSnap(cafe);
      transaction = await snap.createTransaction({
        transaction_details: { order_id: midtransOrderId, gross_amount: grossAmount },
        item_details: itemDetails,
        enabled_payments: ['qris', 'gopay', 'ovo', 'bca_va', 'bni_va', 'mandiri_bill'],
      });
    } catch (err) {
      // Galat gateway/kredensial → 400 yang ramah (bukan 500 mentah).
      const message = err instanceof Error ? err.message : 'Gagal menghubungi Midtrans';
      throw ApiError.badRequest(`Gagal membuat transaksi Midtrans: ${message}`);
    }

    await prisma.order.update({
      where: { id: order.id },
      data: {
        snapToken: transaction.token,
        midtransOrderId,
        statusPembayaran: 'MENUNGGU',
      },
    });

    return {
      snapToken: transaction.token,
      orderId: midtransOrderId,
      grossAmount,
      clientKey: cafe.midtransClientKey,
      isProduction: cafe.midtransProduction,
    };
  },

  /**
   * Buat halaman pembayaran DOKU Checkout untuk sebuah pesanan. Menyimpan
   * `dokuInvoiceNumber` agar notifikasi (webhook) bisa mencocokkan pesanan.
   *
   * Sama seperti jalur Midtrans, ini dipanggil PELANGGAN yang tidak login: yang
   * bisa dilakukan pemegang sebuah `orderId` hanyalah menerbitkan tagihan untuk
   * pesanan itu sendiri. Bedanya kredensial DOKU milik platform, bukan kafe —
   * jadi tidak ada konfigurasi per kafe yang perlu dibaca di sini.
   */
  async buatDoku(orderId: string): Promise<DokuBuatResult> {
    if (!isDokuEnabled()) {
      throw ApiError.badRequest('DOKU belum dikonfigurasi di server');
    }

    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true, payment: true },
    });
    if (!order) throw ApiError.notFound('Pesanan tidak ditemukan');
    if (order.status !== 'MENUNGGU_PEMBAYARAN' || order.payment?.status === 'SUCCESS') {
      throw ApiError.conflict('Pesanan ini sudah dibayar');
    }

    // Harga dibulatkan lebih dulu agar total baris = `amount` yang dikirim
    // (DOKU menolak tagihan yang jumlahnya tidak konsisten). IDR memang tanpa sen.
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
      // Galat gateway/kredensial → 400 yang ramah (bukan 500 mentah).
      const message = err instanceof Error ? err.message : 'Gagal menghubungi DOKU';
      throw ApiError.badRequest(`Gagal membuat pembayaran DOKU: ${message}`);
    }

    await prisma.order.update({
      where: { id: order.id },
      data: {
        dokuInvoiceNumber: hasil.invoiceNumber,
        statusPembayaran: 'MENUNGGU',
      },
    });

    return {
      paymentUrl: hasil.paymentUrl,
      invoiceNumber: hasil.invoiceNumber,
      grossAmount,
    };
  },

  /**
   * Webhook Midtrans. SELALU diselesaikan tanpa melempar — route membalas 200
   * apa pun hasilnya (gateway akan mengulang bila menerima non-200). Semua galat
   * dicatat lalu ditelan.
   */
  async handleNotifikasi(cafeId: string, payload: Record<string, unknown>): Promise<void> {
    const cafe = await prisma.cafe.findUnique({ where: { id: cafeId } });
    if (!cafe || !cafe.midtransServerKey) {
      console.warn('[pembayaran] webhook: kafe/serverKey tidak ditemukan', cafeId);
      return;
    }

    const orderIdGateway = String(payload.order_id ?? '');
    const statusCode = String(payload.status_code ?? '');
    const grossAmount = String(payload.gross_amount ?? '');
    const signatureKey = String(payload.signature_key ?? '');

    // Verifikasi signature: SHA512(order_id + status_code + gross_amount + serverKey).
    const serverKey = dekripsi(cafe.midtransServerKey);
    const expected = createHash('sha512')
      .update(orderIdGateway + statusCode + grossAmount + serverKey)
      .digest('hex');
    if (expected !== signatureKey) {
      console.warn('[pembayaran] webhook: signature tidak cocok', orderIdGateway);
      return;
    }

    const order = await prisma.order.findFirst({
      where: { midtransOrderId: orderIdGateway, cafeId },
    });
    if (!order) {
      console.warn('[pembayaran] webhook: pesanan tidak ditemukan', orderIdGateway);
      return;
    }

    await applyMidtransResult(order, payload);
  },

  /**
   * Webhook DOKU. Seperti webhook Midtrans: SELALU selesai tanpa melempar, route
   * membalas 200 apa pun hasilnya.
   *
   * `rawBody` adalah body mentah yang diterima — dipakai menghitung digest saat
   * memverifikasi signature. Menyusunnya ulang dari objek hasil parse akan
   * menghasilkan byte yang berbeda dan membuat notifikasi sah ikut tertolak.
   *
   * Notifikasi yang signature-nya tidak cocok DIABAIKAN. Ini bukan formalitas:
   * tanpa itu, siapa pun yang tahu URL webhook bisa menyatakan pesanan orang
   * lain LUNAS dan mengirimnya ke dapur.
   */
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

    const order = await prisma.order.findFirst({ where: { dokuInvoiceNumber: invoiceNumber } });
    if (!order) {
      console.warn('[doku] webhook: pesanan tidak ditemukan', invoiceNumber);
      return;
    }

    const transaction = payload.transaction as Record<string, unknown> | undefined;
    const response = payload.response as Record<string, unknown> | undefined;
    // DOKU menandai sukses lewat status transaksi ATAU response code "5000".
    const status: StatusPembayaran =
      String(response?.code ?? '') === '5000'
        ? 'LUNAS'
        : mapDokuStatus(transaction?.status as string | undefined);

    if (status === 'LUNAS' && order.status === 'MENUNGGU_PEMBAYARAN') {
      const channel = payload.channel as Record<string, unknown> | undefined;
      const channelId = channel?.id as string | undefined;
      await settleOrderPaid(order.id, {
        enumMethod: dokuChannelToEnum(channelId),
        metodePembayaran: dokuChannelToKode(channelId),
        transactionId: (transaction?.original_request_id as string) ?? invoiceNumber,
      });
      return;
    }

    // Pesanan yang sudah lepas dari MENUNGGU_PEMBAYARAN tidak dirilis ulang —
    // itulah yang membuat notifikasi ganda tidak menggandakan tiket dapur.
    if (status === order.statusPembayaran) return;

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
  },

  /**
   * Status pembayaran sebuah pesanan — sumber tunggal untuk polling halaman
   * status (pelanggan maupun kasir). Menerima id pesanan CafeOS ATAU `order_id`
   * Midtrans, karena pelanggan memegang yang pertama dan callback Snap
   * mengembalikan yang kedua.
   *
   * Untuk pesanan berjalur Midtrans yang belum final, statusnya direkonsiliasi
   * dulu ke Core API supaya tidak bergantung pada webhook yang bisa telat.
   * Bila gateway tidak terjangkau, status lokal yang dipakai — polling tetap
   * jalan dan webhook akan menyusul.
   */
  async statusPembayaran(orderId: string): Promise<StatusPembayaranResult> {
    let order = await findOrderForStatus(orderId);
    if (!order) throw ApiError.notFound('Pesanan tidak ditemukan');

    const cafe = await prisma.cafe.findUnique({ where: { id: order.cafeId } });
    const midtransOrderId = order.midtransOrderId;
    /** Nominal versi gateway; null bila tidak (atau belum) ditanyakan. */
    let grossGateway: number | null = null;

    // Pesanan lunas tidak perlu ditanyakan lagi, dan pesanan jalur manual memang
    // tidak punya transaksi di Midtrans.
    if (midtransOrderId && cafe?.midtransAktif && order.statusPembayaran !== 'LUNAS') {
      try {
        const core = getMidtransCoreApi(cafe);
        const res = await core.transaction.status(midtransOrderId);
        if (res.gross_amount) grossGateway = Number(res.gross_amount);
        await applyMidtransResult(order, res);
        // Baca ulang: rekonsiliasi bisa memindahkan pesanan ke dapur.
        order = (await findOrderForStatus(order.id)) ?? order;
      } catch (err) {
        console.warn('[pembayaran] status: gagal menghubungi Midtrans, pakai status lokal', err);
      }
    }

    return {
      status: order.statusPembayaran ?? 'MENUNGGU',
      metodePembayaran: order.metodePembayaran,
      grossAmount: grossGateway ?? Number(order.nominalDibayar ?? order.totalAmount),
      updatedAt: order.updatedAt.toISOString(),
      cafeName: cafe?.name ?? 'CafeOS',
      pesanan: toOrderWithTableDTO(order),
    };
  },

  /**
   * Riwayat pembayaran kafe (dibatasi tenant). Bisa disaring status & rentang
   * tanggal pembuatan pesanan. Terbaru lebih dulu.
   */
  async riwayat(filter: {
    status?: string;
    dari?: Date;
    sampai?: Date;
  }): Promise<CashierOrderDTO[]> {
    const where: Prisma.OrderWhereInput = {};
    if (filter.status) where.statusPembayaran = filter.status;
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
};

/**
 * Terapkan hasil Midtrans ke pesanan (dipakai webhook & polling). Bila LUNAS,
 * melewati gerbang rilis; bila MENUNGGU/GAGAL cukup memperbarui status domain.
 *
 * Pesanan yang sudah pindah dari MENUNGGU_PEMBAYARAN tidak dirilis ulang —
 * itulah yang membuat webhook ganda tidak menggandakan tiket dapur.
 *
 * Penulisan & siaran hanya terjadi ketika status BERUBAH. Ini penting: polling
 * halaman status memanggil fungsi ini tiap 3 detik per pelanggan, dan menyiarkan
 * "MENUNGGU → MENUNGGU" akan membuat layar kasir memuat ulang antreannya terus-
 * menerus tanpa ada yang benar-benar berubah.
 */
async function applyMidtransResult(
  order: OrderUntukMidtrans,
  data: Record<string, unknown>,
): Promise<void> {
  const status = mapMidtransStatus(
    data.transaction_status as string | undefined,
    data.fraud_status as string | undefined,
  );

  if (status === 'LUNAS' && order.status === 'MENUNGGU_PEMBAYARAN') {
    const paymentType = data.payment_type as string | undefined;
    const vaNumbers = data.va_numbers as Array<{ bank?: string }> | undefined;
    await settleOrderPaid(order.id, {
      enumMethod: midtransPaymentTypeToEnum(paymentType),
      metodePembayaran: labelMidtransPaymentType(paymentType, vaNumbers),
      transactionId: (data.order_id as string) ?? order.id,
    });
    return;
  }

  if (status === order.statusPembayaran) return;

  const updated = await prisma.order.update({
    where: { id: order.id },
    data: { statusPembayaran: status },
    select: { statusPembayaran: true, metodePembayaran: true },
  });

  // Badge kasir ikut berubah untuk MENUNGGU/GAGAL juga — bukan hanya saat lunas.
  realtime.emitPaymentStatusChanged(order.cafeId, {
    orderId: order.id,
    statusPembayaran: updated.statusPembayaran,
    metodePembayaran: updated.metodePembayaran,
  });
}
