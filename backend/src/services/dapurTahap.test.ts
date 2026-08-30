import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buatPrismaMock, isiBawaan } from '../test/prismaMock';
import { parseUpdateOrderKitchenStatusInput } from '../validation/kitchen.validation';

// Perjalanan satu tiket di dapur: QUEUED → PREPARING → READY → COMPLETED.
//
// Yang dijaga uji di bawah adalah dua batas yang gampang bocor:
//   1. Dapur tidak boleh MENUTUP pesanan — itu milik kasir, yang tahu makanannya
//      benar-benar sampai ke tamu.
//   2. Pesanan yang belum lunas tidak boleh ditutup sama sekali.

const prisma = buatPrismaMock();
vi.mock('../lib/prisma', () => ({ prisma }));

const emit = {
  emitPaymentStatusChanged: vi.fn(),
  emitKitchenOrderUpdated: vi.fn(),
  emitKitchenOrderCreated: vi.fn(),
  emitDashboardOrderPaid: vi.fn(),
  emitOrderReady: vi.fn(),
  emitTableStatusChanged: vi.fn(),
};
vi.mock('../realtime/realtime', () => ({ realtime: emit }));

const kirimPush = vi.fn(async () => undefined);
vi.mock('./push.service', () => ({
  pushService: { sendOrderReadyPush: () => kirimPush() },
}));

const siarkanMeja = vi.fn(async () => undefined);
vi.mock('./table.service', () => ({
  tableService: { broadcastTableStatus: () => siarkanMeja() },
}));

vi.mock('./auditLog.service', async () => {
  const asli = await vi.importActual<typeof import('./auditLog.service')>(
    './auditLog.service',
  );
  return { ...asli, auditLogService: { catat: vi.fn(async () => undefined) } };
});

const KAFE_A = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const ORDER_ID = '3f1c2b4a-5d6e-4f7a-8b9c-0d1e2f3a4b5c';
const MEJA_ID = '11111111-2222-4333-8444-555555555555';

const { kitchenService } = await import('./kitchen.service');

function tiket(ubah: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    cafeId: KAFE_A,
    tableId: MEJA_ID,
    status: 'DIPROSES_DAPUR',
    statusPembayaran: 'PAID',
    kitchenStatus: 'QUEUED',
    fulfillmentType: 'DINE_IN',
    orderSource: 'TABLE_QR',
    customerName: null,
    catatan: null,
    totalAmount: new Prisma.Decimal(50000),
    nominalDibayar: new Prisma.Decimal(50000),
    metodePembayaran: 'TUNAI',
    midtransOrderId: null,
    queueNumber: 4,
    paidAt: new Date('2026-08-30T03:00:00.000Z'),
    confirmedAt: new Date('2026-08-30T03:00:00.000Z'),
    kitchenQueuedAt: new Date('2026-08-30T03:00:00.000Z'),
    kitchenStartedAt: null,
    kitchenReadyAt: null,
    completedAt: null,
    cancelledAt: null,
    alasanPembatalan: null,
    createdAt: new Date('2026-08-30T03:00:00.000Z'),
    updatedAt: new Date('2026-08-30T03:00:00.000Z'),
    items: [
      {
        id: 'item-1',
        menuItemId: 'menu-1',
        name: 'Kopi Susu',
        price: new Prisma.Decimal(25000),
        quantity: 2,
        notes: '',
        kitchenStatus: 'WAITING',
      },
    ],
    payment: {
      id: 'pay-1',
      orderId: ORDER_ID,
      method: 'CASH',
      status: 'SUCCESS',
      amount: new Prisma.Decimal(50000),
      transactionId: 'KSR-1',
      createdAt: new Date('2026-08-30T03:00:00.000Z'),
    },
    pembayaranManual: null,
    table: { id: MEJA_ID, tableName: 'Meja 3' },
    cashier: null,
    pembatal: null,
    ...ubah,
  };
}

beforeEach(() => {
  isiBawaan(prisma);
  prisma.order.update.mockImplementation(
    async (args: { data: Record<string, unknown> }) => tiket(args.data),
  );
});

describe('tahap dapur — perpindahan', () => {
  it('"Mulai Proses" menggerakkan tiket DAN baris itemnya', async () => {
    prisma.order.findFirst.mockResolvedValue(tiket());

    await kitchenService.mulaiProses(KAFE_A, ORDER_ID);

    const data = prisma.order.update.mock.calls[0][0].data;
    expect(data.kitchenStatus).toBe('PREPARING');
    expect(data.kitchenStartedAt).toBeInstanceOf(Date);

    // Tanpa ini, kepala tiket berkata "sedang diproses" sementara semua
    // barisnya masih WAITING — dua bagian layar yang saling bertentangan.
    expect(prisma.orderItem.updateMany.mock.calls[0][0].data.kitchenStatus).toBe(
      'COOKING',
    );
  });

  it('"Siap Disajikan" memberi tahu tamu, tapi TIDAK menutup pesanannya', async () => {
    prisma.order.findFirst.mockResolvedValue(tiket({ kitchenStatus: 'PREPARING' }));

    await kitchenService.tandaiSiap(KAFE_A, ORDER_ID);

    const data = prisma.order.update.mock.calls[0][0].data;
    expect(data.kitchenStatus).toBe('READY');
    // Status pesanan tetap DIPROSES_DAPUR: makanannya matang, tapi belum ada
    // yang mengantarkannya — dan mejanya masih terpakai.
    expect(data.status).toBe('DIPROSES_DAPUR');
    expect(data.completedAt).toBeNull();

    expect(emit.emitOrderReady).toHaveBeenCalledTimes(1);
    expect(kirimPush).toHaveBeenCalledTimes(1);
  });

  it('"Diserahkan" menutup pesanan dan membebaskan mejanya', async () => {
    prisma.order.findFirst.mockResolvedValue(tiket({ kitchenStatus: 'READY' }));

    await kitchenService.tandaiSelesai(KAFE_A, ORDER_ID);

    const data = prisma.order.update.mock.calls[0][0].data;
    expect(data.kitchenStatus).toBe('COMPLETED');
    expect(data.status).toBe('SELESAI');
    expect(data.completedAt).toBeInstanceOf(Date);
    expect(siarkanMeja).toHaveBeenCalledTimes(1);
  });

  it('tidak menghapus jejak kapan chef mulai memasak saat tiket ditarik mundur', async () => {
    const mulai = new Date('2026-08-30T03:05:00.000Z');
    prisma.order.findFirst.mockResolvedValue(
      tiket({ kitchenStatus: 'READY', kitchenStartedAt: mulai }),
    );

    await kitchenService.ubahTahap(KAFE_A, ORDER_ID, 'PREPARING');

    expect(prisma.order.update.mock.calls[0][0].data.kitchenStartedAt).toBe(mulai);
  });

  it('menolak lompatan dari antrean langsung ke "diserahkan"', async () => {
    prisma.order.findFirst.mockResolvedValue(tiket({ kitchenStatus: 'QUEUED' }));

    await expect(
      kitchenService.ubahTahap(KAFE_A, ORDER_ID, 'COMPLETED'),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('menolak menutup pesanan yang belum lunas', async () => {
    prisma.order.findFirst.mockResolvedValue(
      tiket({ kitchenStatus: 'READY', payment: null, statusPembayaran: 'UNPAID' }),
    );

    await expect(
      kitchenService.tandaiSelesai(KAFE_A, ORDER_ID),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('tidak menemukan tiket kafe lain', async () => {
    prisma.order.findFirst.mockResolvedValue(null);

    await expect(
      kitchenService.mulaiProses('bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb', ORDER_ID),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('tahap dapur — status per item menggerakkan tiketnya', () => {
  it('item pertama yang dimasak menaikkan tiket ke PREPARING', async () => {
    prisma.orderItem.findFirst.mockResolvedValue({ id: 'item-1', orderId: ORDER_ID });
    prisma.order.findUniqueOrThrow.mockResolvedValue(
      tiket({
        items: [
          { ...tiket().items[0], kitchenStatus: 'COOKING' },
          { ...tiket().items[0], id: 'item-2', kitchenStatus: 'WAITING' },
        ],
      }),
    );

    await kitchenService.updateItemStatus(KAFE_A, 'item-1', 'COOKING');

    expect(prisma.order.update.mock.calls[0][0].data.kitchenStatus).toBe('PREPARING');
  });

  it('tiket yang sudah diserahkan tidak bisa ditarik kembali oleh satu item', async () => {
    prisma.orderItem.findFirst.mockResolvedValue({ id: 'item-1', orderId: ORDER_ID });
    prisma.order.findUniqueOrThrow.mockResolvedValue(
      tiket({
        kitchenStatus: 'COMPLETED',
        status: 'SELESAI',
        items: [{ ...tiket().items[0], kitchenStatus: 'WAITING' }],
      }),
    );

    await kitchenService.updateItemStatus(KAFE_A, 'item-1', 'WAITING');

    // Hanya baris itemnya yang berubah; tiketnya tetap tertutup.
    expect(prisma.order.update).not.toHaveBeenCalled();
    expect(emit.emitKitchenOrderUpdated).toHaveBeenCalledTimes(1);
  });
});

describe('batas kewenangan Layar Dapur', () => {
  it.each(['COMPLETED', 'NOT_SENT'])(
    'menolak permintaan status "%s" dari Layar Dapur',
    (status) => {
      expect(() => parseUpdateOrderKitchenStatusInput({ status })).toThrow();
    },
  );

  it.each(['QUEUED', 'PREPARING', 'READY'])('menerima status "%s"', (status) => {
    expect(parseUpdateOrderKitchenStatusInput({ status })).toEqual({ status });
  });
});
