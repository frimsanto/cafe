import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buatPrismaMock, isiBawaan } from '../test/prismaMock';

// Gerbang tunggal "pesanan masuk dapur".
//
// Semua jalur pembayaran bermuara di sini, jadi aturannya diuji SEKALI di
// tempat aturannya tinggal — bukan diulang di tiap jalur, yang berarti satu
// jalur baru bisa saja lupa membawanya.

const prisma = buatPrismaMock();
vi.mock('../lib/prisma', () => ({ prisma }));

const emit = {
  emitKitchenOrderCreated: vi.fn(),
  emitDashboardOrderPaid: vi.fn(),
  emitKitchenOrderUpdated: vi.fn(),
  emitPaymentStatusChanged: vi.fn(),
  emitOrderReady: vi.fn(),
  emitTableStatusChanged: vi.fn(),
};
vi.mock('../realtime/realtime', () => ({ realtime: emit }));

const siarkanMeja = vi.fn(async () => undefined);
vi.mock('./table.service', () => ({
  tableService: { broadcastTableStatus: () => siarkanMeja() },
}));

const KAFE_A = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const ORDER_ID = '3f1c2b4a-5d6e-4f7a-8b9c-0d1e2f3a4b5c';
const MEJA_ID = '11111111-2222-4333-8444-555555555555';

const { releaseService } = await import('./release.service');

function order(ubah: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    cafeId: KAFE_A,
    tableId: MEJA_ID,
    status: 'MENUNGGU_PEMBAYARAN',
    statusPembayaran: 'UNPAID',
    kitchenStatus: 'NOT_SENT',
    fulfillmentType: 'DINE_IN',
    orderSource: 'TABLE_QR',
    customerName: null,
    catatan: null,
    totalAmount: new Prisma.Decimal(50000),
    nominalDibayar: null,
    metodePembayaran: null,
    midtransOrderId: null,
    queueNumber: 1,
    paidAt: null,
    confirmedAt: null,
    kitchenQueuedAt: null,
    kitchenStartedAt: null,
    kitchenReadyAt: null,
    completedAt: null,
    cancelledAt: null,
    alasanPembatalan: null,
    createdAt: new Date('2026-08-30T03:00:00.000Z'),
    updatedAt: new Date('2026-08-30T03:00:00.000Z'),
    items: [],
    payment: null,
    pembayaranManual: null,
    table: { id: MEJA_ID, tableName: 'Meja 3' },
    cashier: null,
    pembatal: null,
    ...ubah,
  };
}

const lunas = {
  id: 'pay-1',
  orderId: ORDER_ID,
  method: 'CASH',
  status: 'SUCCESS',
  amount: new Prisma.Decimal(50000),
  transactionId: 'KSR-1',
  createdAt: new Date('2026-08-30T03:10:00.000Z'),
};

beforeEach(() => {
  isiBawaan(prisma);
  prisma.order.update.mockImplementation(
    async (args: { data: Record<string, unknown> }) => order(args.data),
  );
});

describe('gerbang rilis ke dapur', () => {
  it('MENOLAK pesanan yang belum dibayar — inilah yang menjaga "bayar di kasir"', async () => {
    prisma.order.findUnique.mockResolvedValue(order({ payment: null }));

    await expect(releaseService.releaseToKitchen(ORDER_ID)).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(prisma.order.update).not.toHaveBeenCalled();
    expect(emit.emitKitchenOrderCreated).not.toHaveBeenCalled();
  });

  it('menolak pesanan yang pembayarannya masih PENDING', async () => {
    prisma.order.findUnique.mockResolvedValue(
      order({ payment: { ...lunas, status: 'PENDING' } }),
    );

    await expect(releaseService.releaseToKitchen(ORDER_ID)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('menolak menghidupkan kembali pesanan yang sudah dibatalkan', async () => {
    prisma.order.findUnique.mockResolvedValue(
      order({ status: 'DIBATALKAN', payment: lunas }),
    );

    await expect(releaseService.releaseToKitchen(ORDER_ID)).rejects.toMatchObject({
      statusCode: 409,
    });
  });

  it('merilis pesanan lunas ke antrean dapur dan menyalin ringkasan pembayarannya', async () => {
    prisma.order.findUnique.mockResolvedValue(order({ payment: lunas }));

    const hasil = await releaseService.releaseToKitchen(ORDER_ID);

    expect(hasil.released).toBe(true);
    const data = prisma.order.update.mock.calls[0][0].data;
    expect(data.status).toBe('DIPROSES_DAPUR');
    expect(data.kitchenStatus).toBe('QUEUED');
    expect(data.statusPembayaran).toBe('PAID');
    // Waktu uang diterima disalin dari baris `payments`, bukan dibuat baru —
    // laporan omzet dan struk harus menunjuk detik yang sama.
    expect(data.paidAt).toBe(lunas.createdAt);

    expect(emit.emitKitchenOrderCreated).toHaveBeenCalledTimes(1);
    expect(emit.emitDashboardOrderPaid).toHaveBeenCalledTimes(1);
    expect(siarkanMeja).toHaveBeenCalledTimes(1);
  });

  it('panggilan kedua tidak menerbitkan tiket dapur kedua', async () => {
    // Persis yang terjadi saat Midtrans mengirim notifikasi yang sama dua kali
    // dan yang kedua lolos sampai ke gerbang ini.
    prisma.order.findUnique.mockResolvedValue(
      order({ status: 'DIPROSES_DAPUR', kitchenStatus: 'QUEUED', payment: lunas }),
    );

    const hasil = await releaseService.releaseToKitchen(ORDER_ID);

    expect(hasil.released).toBe(false);
    expect(prisma.order.update).not.toHaveBeenCalled();
    expect(emit.emitKitchenOrderCreated).not.toHaveBeenCalled();
  });

  it('pesanan bawa pulang tidak menyiarkan status meja mana pun', async () => {
    prisma.order.findUnique.mockResolvedValue(
      order({ tableId: null, table: null, fulfillmentType: 'TAKEAWAY', payment: lunas }),
    );
    prisma.order.update.mockResolvedValue(
      order({
        tableId: null,
        table: null,
        fulfillmentType: 'TAKEAWAY',
        status: 'DIPROSES_DAPUR',
        kitchenStatus: 'QUEUED',
        payment: lunas,
      }),
    );

    await releaseService.releaseToKitchen(ORDER_ID);

    expect(siarkanMeja).not.toHaveBeenCalled();
    expect(emit.emitKitchenOrderCreated).toHaveBeenCalledTimes(1);
  });
});
