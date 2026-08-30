import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buatPrismaMock, isiBawaan } from '../test/prismaMock';
import { ApiError } from '../lib/ApiError';

// Layar kasir sebagai POS: pesanan yang LAHIR di kasir dan dibayar di detik
// yang sama. Yang diuji di sini adalah aturannya, bukan Prisma — lihat catatan
// di `vitest.config.ts`.
//
// Tiga hal yang paling mahal kalau salah, dan karenanya paling banyak ditemani
// uji di bawah:
//   1. Uang tersimpan tetapi pesanannya tidak ada (atau sebaliknya).
//   2. Satu tamu ditagih dua kali karena tombol ditekan dua kali.
//   3. Total yang dipakai adalah angka dari layar kasir, bukan dari database.

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

const opsiMetode = vi.fn(async () => [{ metode: 'TUNAI' }] as unknown[]);
vi.mock('./paymentSettings.service', () => ({
  paymentSettingsService: {
    opsiMetode: (...a: unknown[]) => opsiMetode(...(a as [])),
    kredensialAktif: vi.fn(async () => null),
  },
}));

const catatAudit = vi.fn(async (_input: Record<string, unknown>) => undefined);
vi.mock('./auditLog.service', async () => {
  const asli = await vi.importActual<typeof import('./auditLog.service')>(
    './auditLog.service',
  );
  return {
    ...asli,
    auditLogService: { catat: (...a: unknown[]) => catatAudit(a[0] as never) },
  };
});

vi.mock('./table.service', () => ({
  tableService: { broadcastTableStatus: vi.fn(async () => undefined) },
}));

const KAFE_A = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const KAFE_B = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
const ORDER_ID = '3f1c2b4a-5d6e-4f7a-8b9c-0d1e2f3a4b5c';
const MEJA_ID = '11111111-2222-4333-8444-555555555555';
const MENU_ID = '66666666-7777-4888-8999-aaaaaaaaaaaa';
const KASIR_ID = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

const { cashierService } = await import('./cashier.service');

const aktor = { userId: KASIR_ID, role: 'KASIR', ip: '1.2.3.4', userAgent: 'uji' };

/** Menu yang benar-benar ada di database — harganya 25.000 per porsi. */
const MENU = {
  id: MENU_ID,
  cafeId: KAFE_A,
  name: 'Kopi Susu',
  price: new Prisma.Decimal(25000),
  isAvailable: true,
  deletedAt: null,
};

/** Bentuk pesanan versi tersimpan, dengan relasi yang dipakai DTO. */
function orderTersimpan(ubah: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    cafeId: KAFE_A,
    tableId: MEJA_ID,
    status: 'MENUNGGU_PEMBAYARAN',
    statusPembayaran: 'UNPAID',
    kitchenStatus: 'NOT_SENT',
    fulfillmentType: 'DINE_IN',
    orderSource: 'CASHIER',
    customerName: null,
    catatan: null,
    totalAmount: new Prisma.Decimal(50000),
    nominalDibayar: new Prisma.Decimal(50000),
    metodePembayaran: 'TUNAI',
    midtransOrderId: null,
    queueNumber: 4,
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
    payment: {
      id: 'pay-1',
      orderId: ORDER_ID,
      method: 'CASH',
      status: 'SUCCESS',
      amount: new Prisma.Decimal(50000),
      transactionId: 'KSR-ABCDEF',
      createdAt: new Date('2026-08-30T03:00:00.000Z'),
    },
    pembayaranManual: null,
    table: { id: MEJA_ID, tableName: 'Meja 3' },
    cashier: { id: KASIR_ID, name: 'Rani' },
    pembatal: null,
    ...ubah,
  };
}

const inputDineIn = {
  fulfillmentType: 'DINE_IN' as const,
  tableId: MEJA_ID,
  customerName: null,
  catatan: null,
  items: [{ menuItemId: MENU_ID, quantity: 2, notes: '' }],
  pembayaran: {
    metode: 'TUNAI' as const,
    nominal: 100000,
    catatanKasir: null,
    referensi: null,
  },
  idempotencyKey: 'kasir-keranjang-0001',
};

beforeEach(() => {
  isiBawaan(prisma);
  opsiMetode.mockResolvedValue([{ metode: 'TUNAI' }]);
  prisma.menuItem.findMany.mockResolvedValue([MENU]);
  prisma.table.findFirst.mockResolvedValue({ id: MEJA_ID });
  prisma.order.create.mockResolvedValue(orderTersimpan());
  prisma.order.update.mockImplementation(async (args: { data: Record<string, unknown> }) =>
    orderTersimpan(args.data),
  );
});

describe('POS kasir — membuat pesanan', () => {
  it('menyimpan pesanan, pembayaran, dan tiket dapur dalam SATU transaksi', async () => {
    await cashierService.buatPesanan(KAFE_A, inputDineIn, aktor);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);

    const data = prisma.order.create.mock.calls[0][0].data;
    // Pesanan, baris pembayaran, dan bukti manual dibuat dalam satu perintah
    // bersarang — bukan tiga penulisan terpisah yang bisa putus di tengah.
    expect(data.payment.create.status).toBe('SUCCESS');
    expect(data.pembayaranManual.create.statusVerifikasi).toBe('DITERIMA');
    expect(data.orderSource).toBe('CASHIER');
    expect(data.cashierUserId).toBe(KASIR_ID);

    // Rilis ke dapur terjadi di dalam transaksi yang sama.
    const rilis = prisma.order.update.mock.calls[0][0].data;
    expect(rilis.status).toBe('DIPROSES_DAPUR');
    expect(rilis.kitchenStatus).toBe('QUEUED');
    expect(rilis.statusPembayaran).toBe('PAID');
  });

  it('menghitung total dari harga DATABASE, bukan dari angka yang dikirim kasir', async () => {
    await cashierService.buatPesanan(
      KAFE_A,
      // Layar kasir menyelundupkan harga & total versinya sendiri.
      {
        ...inputDineIn,
        items: [{ menuItemId: MENU_ID, quantity: 2, notes: '' }],
        totalAmount: 1,
        subtotal: 1,
      } as never,
      aktor,
    );

    const data = prisma.order.create.mock.calls[0][0].data;
    // 2 × 25.000 dari tabel menu — bukan 1 dari body.
    expect(Number(data.totalAmount)).toBe(50000);
    expect(Number(data.items.create[0].price)).toBe(25000);
  });

  it('menyiarkan tiket ke Layar Dapur & omzet ke dasbor sesudah tersimpan', async () => {
    await cashierService.buatPesanan(KAFE_A, inputDineIn, aktor);

    expect(emit.emitKitchenOrderCreated).toHaveBeenCalledTimes(1);
    expect(emit.emitDashboardOrderPaid).toHaveBeenCalledTimes(1);
    expect(emit.emitPaymentStatusChanged).toHaveBeenCalledTimes(1);
  });

  it('mencatat jejak audit beserta kasir yang menagihnya', async () => {
    await cashierService.buatPesanan(KAFE_A, inputDineIn, aktor);

    const log = catatAudit.mock.calls[0][0];
    expect(log.aksi).toBe('pesanan.kasir.dibuat');
    expect((log.aktor as { userId: string }).userId).toBe(KASIR_ID);
  });

  it('menolak uang tunai yang kurang dari tagihan', async () => {
    await expect(
      cashierService.buatPesanan(
        KAFE_A,
        { ...inputDineIn, pembayaran: { ...inputDineIn.pembayaran, nominal: 10000 } },
        aktor,
      ),
    ).rejects.toMatchObject({ statusCode: 400 });

    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  it('menolak metode yang tidak aktif di kanal kasir', async () => {
    opsiMetode.mockResolvedValue([{ metode: 'EDC' }]);

    await expect(
      cashierService.buatPesanan(KAFE_A, inputDineIn, aktor),
    ).rejects.toBeInstanceOf(ApiError);
    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  it('menolak meja yang bukan milik kafe ini', async () => {
    // Meja kafe lain tidak akan ditemukan oleh query bertenant.
    prisma.table.findFirst.mockResolvedValue(null);

    await expect(
      cashierService.buatPesanan(KAFE_B, inputDineIn, aktor),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  it('menolak menu yang sedang tidak tersedia', async () => {
    prisma.menuItem.findMany.mockResolvedValue([{ ...MENU, isAvailable: false }]);

    await expect(
      cashierService.buatPesanan(KAFE_A, inputDineIn, aktor),
    ).rejects.toBeInstanceOf(ApiError);
  });
});

describe('POS kasir — bawa pulang', () => {
  const inputTakeaway = {
    ...inputDineIn,
    fulfillmentType: 'TAKEAWAY' as const,
    tableId: null,
    idempotencyKey: 'kasir-keranjang-0002',
  };

  it('menyimpan pesanan tanpa meja dan tetap memberi nomor antrian', async () => {
    prisma.order.findFirst.mockResolvedValue(null); // belum ada nomor hari ini
    prisma.order.create.mockResolvedValue(
      orderTersimpan({ tableId: null, table: null, fulfillmentType: 'TAKEAWAY' }),
    );
    prisma.order.update.mockResolvedValue(
      orderTersimpan({
        tableId: null,
        table: null,
        fulfillmentType: 'TAKEAWAY',
        status: 'DIPROSES_DAPUR',
        kitchenStatus: 'QUEUED',
      }),
    );

    const hasil = await cashierService.buatPesanan(KAFE_A, inputTakeaway, aktor);

    const data = prisma.order.create.mock.calls[0][0].data;
    expect(data.tableId).toBeNull();
    expect(data.fulfillmentType).toBe('TAKEAWAY');
    // Hari baru selalu dimulai dari 1 — lihat `lib/orderCode.ts`.
    expect(data.queueNumber).toBe(1);
    expect(hasil.tableName).toBeNull();
    expect(hasil.queueNumber).not.toBeNull();
  });

  it('tidak pernah menanyakan meja untuk pesanan bawa pulang', async () => {
    await cashierService.buatPesanan(KAFE_A, inputTakeaway, aktor);
    expect(prisma.table.findFirst).not.toHaveBeenCalled();
  });
});

describe('POS kasir — kirim ganda', () => {
  it('mengembalikan pesanan yang sama bila kunci idempotensinya sudah dipakai', async () => {
    prisma.order.findFirst.mockResolvedValue(
      orderTersimpan({ status: 'DIPROSES_DAPUR', kitchenStatus: 'QUEUED' }),
    );

    const hasil = await cashierService.buatPesanan(KAFE_A, inputDineIn, aktor);

    expect(hasil.id).toBe(ORDER_ID);
    // Tidak ada tagihan kedua, dan menu pun tidak sempat disentuh.
    expect(prisma.order.create).not.toHaveBeenCalled();
    expect(prisma.menuItem.findMany).not.toHaveBeenCalled();
  });

  it('menyerah pada pemenang ketika dua permintaan kembar tiba bersamaan', async () => {
    // Pemeriksaan awal tidak menemukan apa pun (keduanya lolos), lalu penulisan
    // kedua kalah di unique constraint — persis balapan yang sebenarnya.
    const tabrakan = new Prisma.PrismaClientKnownRequestError('unique', {
      code: 'P2002',
      clientVersion: 'uji',
    });
    // `findFirst` dipakai DUA keperluan di jalur ini — memeriksa kunci
    // idempotensi dan mencari nomor antrian terakhir. Dibedakan lewat bentuk
    // `where`-nya, kalau tidak urutan mock-nya ikut terpakai query yang salah.
    let cekKunci = 0;
    prisma.order.findFirst.mockImplementation(
      async (args: { where?: { idempotencyKey?: string } }) => {
        if (!args?.where?.idempotencyKey) return null;
        cekKunci += 1;
        return cekKunci === 1 ? null : orderTersimpan({ status: 'DIPROSES_DAPUR' });
      },
    );
    prisma.order.create.mockRejectedValue(tabrakan);

    const hasil = await cashierService.buatPesanan(KAFE_A, inputDineIn, aktor);

    expect(hasil.id).toBe(ORDER_ID);
    expect(emit.emitKitchenOrderCreated).not.toHaveBeenCalled();
  });
});

describe('POS kasir — pembatalan', () => {
  it('menolak membatalkan pesanan yang sudah lunas', async () => {
    prisma.order.findFirst.mockResolvedValue(
      orderTersimpan({ status: 'DIPROSES_DAPUR', statusPembayaran: 'PAID' }),
    );

    await expect(
      cashierService.batalkanPesanan(KAFE_A, ORDER_ID, 'salah pesan', aktor),
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('menyimpan alasan, membebaskan meja, dan menutup pengajuan yang menggantung', async () => {
    prisma.order.findFirst.mockResolvedValue(
      orderTersimpan({
        payment: null,
        statusPembayaran: 'AWAITING_VERIFICATION',
        pembayaranManual: {
          orderId: ORDER_ID,
          metode: 'TRANSFER',
          nominal: new Prisma.Decimal(50000),
          statusVerifikasi: 'MENUNGGU',
          sumber: 'CHECKOUT',
          catatanKasir: null,
          referensi: null,
          buktiUrl: null,
          alasanPenolakan: null,
          diverifikasiPada: null,
        },
      }),
    );

    await cashierService.batalkanPesanan(KAFE_A, ORDER_ID, 'tamu batal', aktor);

    const data = prisma.order.update.mock.calls[0][0].data;
    expect(data.status).toBe('DIBATALKAN');
    expect(data.statusPembayaran).toBe('CANCELLED');
    expect(data.alasanPembatalan).toBe('tamu batal');
    expect(data.cancelledBy).toBe(KASIR_ID);

    // Pengajuan yang menggantung ikut ditutup, kalau tidak pesanan yang sudah
    // batal tetap nongkrong di antrean "menunggu verifikasi".
    expect(prisma.pembayaranManual.update).toHaveBeenCalledTimes(1);
  });

  it('tidak menulis alasan kedua pada pesanan yang sudah dibatalkan', async () => {
    prisma.order.findFirst.mockResolvedValue(
      orderTersimpan({ status: 'DIBATALKAN', payment: null }),
    );

    await cashierService.batalkanPesanan(KAFE_A, ORDER_ID, 'ulang', aktor);
    expect(prisma.order.update).not.toHaveBeenCalled();
  });
});

describe('POS kasir — isolasi tenant', () => {
  it('tidak menemukan pesanan kafe lain sekalipun id-nya ditebak benar', async () => {
    // Query selalu menyertakan `cafeId`; kafe B tidak akan menemukan apa pun.
    prisma.order.findFirst.mockResolvedValue(null);

    await expect(cashierService.getOrder(KAFE_B, ORDER_ID)).rejects.toMatchObject({
      statusCode: 404,
    });

    const where = prisma.order.findFirst.mock.calls[0][0].where;
    expect(where.cafeId).toBe(KAFE_B);
  });

  it('menyaring daftar meja POS ke kafe pemanggil saja', async () => {
    prisma.table.findMany.mockResolvedValue([]);
    await cashierService.mejaUntukKasir(KAFE_A);

    expect(prisma.table.findMany.mock.calls[0][0].where.cafeId).toBe(KAFE_A);
  });
});

describe('POS kasir — keadaan meja', () => {
  it('menandai meja MENUNGGU_PEMBAYARAN bila ada tagihan yang belum ditutup', async () => {
    prisma.table.findMany.mockResolvedValue([
      { id: MEJA_ID, tableName: 'Meja 3' },
      { id: 'meja-2', tableName: 'Meja 4' },
    ]);
    prisma.order.groupBy.mockResolvedValue([
      { tableId: MEJA_ID, statusPembayaran: 'UNPAID', _count: { _all: 1 } },
      { tableId: 'meja-2', statusPembayaran: 'PAID', _count: { _all: 2 } },
    ]);

    const meja = await cashierService.mejaUntukKasir(KAFE_A);

    expect(meja[0].status).toBe('MENUNGGU_PEMBAYARAN');
    expect(meja[0].unpaidOrderCount).toBe(1);
    // Sudah lunas tapi masih berjalan → terisi, dan TETAP boleh dipilih untuk
    // pesanan tambahan.
    expect(meja[1].status).toBe('TERISI');
    expect(meja[1].activeOrderCount).toBe(2);
  });

  it('meja tanpa pesanan berjalan kembali TERSEDIA', async () => {
    prisma.table.findMany.mockResolvedValue([{ id: MEJA_ID, tableName: 'Meja 3' }]);
    prisma.order.groupBy.mockResolvedValue([]);

    const meja = await cashierService.mejaUntukKasir(KAFE_A);
    expect(meja[0].status).toBe('TERSEDIA');
  });
});

describe('POS kasir — daftar & penyaring', () => {
  it('menggabungkan tab dan pencarian dengan AND, bukan saling menimpa', async () => {
    // Tab "Semua" DAN pencarian sama-sama menghasilkan klausa `OR`. Kalau
    // keduanya disebar ke satu objek `where`, yang belakangan menimpa yang
    // duluan dan penyaring tabnya hilang diam-diam.
    prisma.order.findMany.mockResolvedValue([]);

    await cashierService.listOrders(KAFE_A, {
      tab: 'SEMUA',
      q: 'Meja 3',
      fulfillmentType: 'DINE_IN',
      orderSource: null,
      statusPembayaran: null,
      limit: 50,
    });

    const where = prisma.order.findMany.mock.calls[0][0].where;
    expect(Array.isArray(where.AND)).toBe(true);
    // Tab, jenis, dan pencarian semuanya masih ada.
    expect(where.AND).toHaveLength(3);
    expect(where.AND.filter((k: Record<string, unknown>) => 'OR' in k)).toHaveLength(2);
  });

  it('mengurutkan antrean yang menunggu FIFO dan riwayat terbaru dulu', async () => {
    prisma.order.findMany.mockResolvedValue([]);
    const dasar = {
      q: null,
      fulfillmentType: null,
      orderSource: null,
      statusPembayaran: null,
      limit: 50,
    };

    await cashierService.listOrders(KAFE_A, { ...dasar, tab: 'PERLU_KONFIRMASI' });
    expect(prisma.order.findMany.mock.calls[0][0].orderBy).toEqual({ createdAt: 'asc' });

    await cashierService.listOrders(KAFE_A, { ...dasar, tab: 'SELESAI' });
    expect(prisma.order.findMany.mock.calls[1][0].orderBy).toEqual({ createdAt: 'desc' });
  });

  it('tidak menjalankan query kode pesanan bila tidak ada kata kunci', async () => {
    prisma.order.findMany.mockResolvedValue([]);
    await cashierService.listOrders(KAFE_A, {
      tab: 'PERLU_KONFIRMASI',
      q: null,
      fulfillmentType: null,
      orderSource: null,
      statusPembayaran: null,
      limit: 50,
    });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
  });
});
