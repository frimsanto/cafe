import { createHash, randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { PaymentMethod } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/ApiError';
import { dekripsi } from '../lib/enkripsi';
import { getMidtransSnap, getMidtransCoreApi } from '../lib/midtrans';
import {
  labelMidtransPaymentType,
  manualMethodToEnum,
  mapMidtransStatus,
  midtransPaymentTypeToEnum,
  type ManualMethod,
  type StatusPembayaran,
} from '../lib/paymentMethods';
import { releaseService } from './release.service';
import { toOrderWithTableDTO } from '../dto/order.dto';
import type { CashierOrderDTO } from '../dto/cashier.dto';
import type { ManualPaymentInput } from '../validation/pembayaran.validation';

// Jalur pembayaran dua rel:
//   - Manual : kasir mengonfirmasi tunai / QRIS statis / transfer / EDC.
//   - Midtrans: pelanggan bayar via Snap (QRIS dinamis / e-wallet / VA), lalu
//               gateway memberi tahu hasil lewat webhook.
//
// Keduanya bermuara pada gerbang tunggal `releaseService.releaseToKitchen`:
// mencatat baris `payments` (SUCCESS) lalu memindahkan pesanan ke dapur dan
// menyiarkan event yang sama (KDS, dasbor omzet, status meja). Field baru
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
  return dto;
}

export interface MidtransBuatResult {
  snapToken: string;
  orderId: string;
  grossAmount: number;
  clientKey: string | null;
  isProduction: boolean;
}

export interface StatusPembayaranResult {
  status: StatusPembayaran | string;
  metodePembayaran: string | null;
  grossAmount: number;
  updatedAt: string;
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

  /**
   * Buat transaksi Midtrans (Snap) untuk sebuah pesanan. Menyimpan snapToken &
   * midtransOrderId agar webhook/polling bisa mencocokkan kembali.
   */
  async buatMidtrans(cafeId: string, orderId: string): Promise<MidtransBuatResult> {
    const order = await prisma.order.findFirst({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) throw ApiError.notFound('Pesanan tidak ditemukan');

    const cafe = await prisma.cafe.findUnique({ where: { id: cafeId } });
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

    const midtransOrderId = `CAFEOS-${cafeId.slice(0, 8)}-${order.id.slice(0, 8)}-${Date.now()}`;

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

    await applyMidtransResult(order.id, order.status === 'MENUNGGU_PEMBAYARAN', payload);
  },

  /**
   * Status transaksi Midtrans untuk polling. Menanyakan ke Core API, merekonsiliasi
   * status lokal, lalu mengembalikannya. Bila panggilan gateway gagal, jatuh ke
   * status lokal (yang mungkin sudah diperbarui webhook) agar polling tetap jalan.
   */
  async statusMidtrans(midtransOrderId: string): Promise<StatusPembayaranResult> {
    const order = await prisma.order.findFirst({
      where: { midtransOrderId },
      include: { payment: true },
    });
    if (!order) throw ApiError.notFound('Pesanan tidak ditemukan');

    const cafe = await prisma.cafe.findUnique({ where: { id: order.cafeId } });
    let grossAmount = Number(order.nominalDibayar ?? order.totalAmount);

    if (cafe && cafe.midtransAktif) {
      try {
        const core = getMidtransCoreApi(cafe);
        const res = await core.transaction.status(midtransOrderId);
        if (res.gross_amount) grossAmount = Number(res.gross_amount);
        const stillPending = order.status === 'MENUNGGU_PEMBAYARAN';
        const updated = await applyMidtransResult(order.id, stillPending, res);
        return {
          status: updated.statusPembayaran ?? 'MENUNGGU',
          metodePembayaran: updated.metodePembayaran,
          grossAmount,
          updatedAt: updated.updatedAt.toISOString(),
        };
      } catch (err) {
        console.warn('[pembayaran] status: gagal menghubungi Midtrans, pakai status lokal', err);
      }
    }

    return {
      status: order.statusPembayaran ?? 'MENUNGGU',
      metodePembayaran: order.metodePembayaran,
      grossAmount,
      updatedAt: order.updatedAt.toISOString(),
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
 * Terapkan hasil Midtrans ke pesanan (dipakai webhook & polling). Bila LUNAS,
 * melewati gerbang rilis; bila MENUNGGU/GAGAL cukup memperbarui status domain.
 * `bolehRilis` mencegah rilis ganda untuk pesanan yang sudah pindah dari
 * MENUNGGU_PEMBAYARAN.
 */
async function applyMidtransResult(
  orderId: string,
  bolehRilis: boolean,
  data: Record<string, unknown>,
): Promise<{ statusPembayaran: string | null; metodePembayaran: string | null; updatedAt: Date }> {
  const status = mapMidtransStatus(
    data.transaction_status as string | undefined,
    data.fraud_status as string | undefined,
  );

  if (status === 'LUNAS' && bolehRilis) {
    const paymentType = data.payment_type as string | undefined;
    const vaNumbers = data.va_numbers as Array<{ bank?: string }> | undefined;
    const dto = await settleOrderPaid(orderId, {
      enumMethod: midtransPaymentTypeToEnum(paymentType),
      metodePembayaran: labelMidtransPaymentType(paymentType, vaNumbers),
      transactionId: (data.order_id as string) ?? orderId,
    });
    return {
      statusPembayaran: dto.statusPembayaran,
      metodePembayaran: dto.metodePembayaran,
      updatedAt: new Date(dto.updatedAt),
    };
  }

  // LUNAS tapi sudah dirilis sebelumnya → cukup pastikan penanda lunas, tanpa
  // menyentuh gerbang rilis lagi.
  const updated = await prisma.order.update({
    where: { id: orderId },
    data: { statusPembayaran: status },
    select: { statusPembayaran: true, metodePembayaran: true, updatedAt: true },
  });
  return updated;
}
