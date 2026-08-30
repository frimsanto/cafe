import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buatPrismaMock, isiBawaan } from '../test/prismaMock';

// ── Tiruan ───────────────────────────────────────────────────────────────────

/**
 * Prisma tiruan yang dipakai bersama oleh mock dan badan uji.
 *
 * Modul yang diuji sengaja diambil lewat `await import()` DI BAWAH, bukan
 * `import` statis di atas: dengan begitu factory `vi.mock` baru dijalankan
 * setelah `prisma` ini selesai dibuat. Import statis akan menjalankan factory
 * lebih dulu dan meledak dengan "cannot access before initialization".
 */
const prisma = buatPrismaMock();

vi.mock('../lib/prisma', () => ({ prisma }));
vi.mock('../realtime/realtime', () => ({
  realtime: {
    emitPaymentStatusChanged: vi.fn(),
    emitKitchenOrderUpdated: vi.fn(),
    emitKitchenOrderCreated: vi.fn(),
    emitDashboardOrderPaid: vi.fn(),
  },
}));
vi.mock('./release.service', () => ({
  releaseService: {
    releaseToKitchen: vi.fn(async () => ({
      order: {
        id: ORDER_ID,
        cafeId: KAFE_A,
        statusPembayaran: 'PAID',
        metodePembayaran: 'QRIS',
      },
      released: true,
    })),
  },
}));

const KAFE_A = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const ORDER_ID = '3f1c2b4a-5d6e-4f7a-8b9c-0d1e2f3a4b5c';
const MIDTRANS_ORDER_ID = 'CAFEOS-aaaaaaaa-3f1c2b4a-1730000000000';
const SERVER_KEY = 'SB-Mid-server-kunci-uji';

const kredensialSandbox = {
  cafeId: KAFE_A,
  mode: 'SANDBOX' as const,
  clientKey: 'SB-Mid-client-abc',
  serverKey: SERVER_KEY,
};

const semuaKredensial = vi.fn(async () => [kredensialSandbox]);
const tandaiWebhookTerverifikasi = vi.fn(async () => undefined);

vi.mock('./paymentSettings.service', () => ({
  paymentSettingsService: {
    semuaKredensial: (...args: unknown[]) => semuaKredensial(...(args as [])),
    tandaiWebhookTerverifikasi: (...args: unknown[]) =>
      tandaiWebhookTerverifikasi(...(args as [])),
    kredensialAktif: vi.fn(async () => kredensialSandbox),
    opsiMetode: vi.fn(async () => []),
  },
}));

/** Parameter diberi tipe agar `mock.calls[i][0]` bisa dibaca uji. */
const catatAudit = vi.fn(async (_input: Record<string, unknown>) => undefined);
vi.mock('./auditLog.service', async () => {
  const asli = await vi.importActual<typeof import('./auditLog.service')>(
    './auditLog.service',
  );
  return {
    ...asli,
    auditLogService: {
      catat: (...a: unknown[]) => catatAudit(a[0] as Record<string, unknown>),
      riwayat: vi.fn(),
    },
  };
});

const { pembayaranService } = await import('./pembayaran.service');
const { releaseService } = await import('./release.service');

// ── Pembantu ─────────────────────────────────────────────────────────────────

/** Susun payload notifikasi Midtrans lengkap dengan signature yang SAH. */
function payloadSah(ubah: Record<string, unknown> = {}) {
  const dasar = {
    order_id: MIDTRANS_ORDER_ID,
    status_code: '200',
    gross_amount: '50000.00',
    transaction_status: 'settlement',
    payment_type: 'qris',
    ...ubah,
  };
  const signature = createHash('sha512')
    .update(
      String(dasar.order_id) +
        String(dasar.status_code) +
        String(dasar.gross_amount) +
        SERVER_KEY,
    )
    .digest('hex');
  return { ...dasar, signature_key: signature };
}

/** Pesanan yang menunggu pembayaran senilai 50.000. */
function orderMenunggu(ubah: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    cafeId: KAFE_A,
    status: 'MENUNGGU_PEMBAYARAN',
    statusPembayaran: 'UNPAID',
    totalAmount: new Prisma.Decimal(50000),
    ...ubah,
  };
}

beforeEach(() => {
  isiBawaan(prisma);
  semuaKredensial.mockResolvedValue([kredensialSandbox]);
  prisma.order.findFirst.mockResolvedValue(orderMenunggu());
  prisma.order.findUnique.mockResolvedValue({
    id: ORDER_ID,
    totalAmount: new Prisma.Decimal(50000),
  });
  prisma.gatewayWebhookEvent.create.mockResolvedValue({ id: 'evt-1' });
});

// ── Uji ──────────────────────────────────────────────────────────────────────

describe('webhook Midtrans — signature', () => {
  // Tanpa lapisan ini, siapa pun yang tahu URL webhook bisa menyatakan pesanan
  // orang lain lunas dan mengirimnya ke dapur.
  it('menolak notifikasi bersignature salah', async () => {
    await pembayaranService.handleNotifikasi(KAFE_A, {
      ...payloadSah(),
      signature_key: 'a'.repeat(128),
    });

    expect(releaseService.releaseToKitchen).not.toHaveBeenCalled();
    expect(prisma.order.update).not.toHaveBeenCalled();
    expect(catatAudit).toHaveBeenCalledWith(
      expect.objectContaining({ aksi: 'webhook.ditolak' }),
    );
  });

  it('menolak notifikasi tanpa signature sama sekali', async () => {
    await pembayaranService.handleNotifikasi(KAFE_A, {
      order_id: MIDTRANS_ORDER_ID,
      transaction_status: 'settlement',
    });
    expect(releaseService.releaseToKitchen).not.toHaveBeenCalled();
  });

  it('mengabaikan notifikasi bila kafe tidak punya kredensial', async () => {
    semuaKredensial.mockResolvedValue([]);
    await pembayaranService.handleNotifikasi(KAFE_A, payloadSah());
    expect(releaseService.releaseToKitchen).not.toHaveBeenCalled();
  });

  it('menandai webhook terverifikasi saat signature cocok', async () => {
    await pembayaranService.handleNotifikasi(KAFE_A, payloadSah());
    expect(tandaiWebhookTerverifikasi).toHaveBeenCalledWith(KAFE_A, 'SANDBOX');
  });
});

describe('webhook Midtrans — isolasi tenant', () => {
  // `cafeId` di URL bukan mekanisme keamanan; yang mengunci adalah signature
  // DITAMBAH penyaringan ini. Notifikasi sah milik kafe A tetap tidak bisa
  // menyentuh pesanan kafe B.
  it('mencari pesanan HANYA di dalam kafe yang bersangkutan', async () => {
    await pembayaranService.handleNotifikasi(KAFE_A, payloadSah());

    expect(prisma.order.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { midtransOrderId: MIDTRANS_ORDER_ID, cafeId: KAFE_A },
      }),
    );
  });

  it('berhenti diam-diam bila pesanannya bukan milik kafe itu', async () => {
    prisma.order.findFirst.mockResolvedValue(null);
    await pembayaranService.handleNotifikasi(KAFE_A, payloadSah());

    expect(releaseService.releaseToKitchen).not.toHaveBeenCalled();
    expect(prisma.gatewayWebhookEvent.create).not.toHaveBeenCalled();
  });
});

describe('webhook Midtrans — idempotensi', () => {
  it('memproses notifikasi pertama', async () => {
    await pembayaranService.handleNotifikasi(KAFE_A, payloadSah());
    expect(releaseService.releaseToKitchen).toHaveBeenCalledWith(ORDER_ID);
  });

  // Notifikasi kembar KALAH DI DATABASE (unique constraint), bukan di logika
  // aplikasi yang bisa balapan.
  it('mengabaikan notifikasi kembar yang ditolak unique constraint', async () => {
    prisma.gatewayWebhookEvent.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplikat', {
        code: 'P2002',
        clientVersion: 'uji',
      }),
    );

    await pembayaranService.handleNotifikasi(KAFE_A, payloadSah());
    expect(releaseService.releaseToKitchen).not.toHaveBeenCalled();
  });

  it('memakai kunci event yang membedakan status transaksi', async () => {
    await pembayaranService.handleNotifikasi(KAFE_A, payloadSah());
    expect(prisma.gatewayWebhookEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          gateway: 'midtrans',
          eventKey: `${MIDTRANS_ORDER_ID}:settlement:200`,
        }),
      }),
    );
  });
});

describe('webhook Midtrans — nominal', () => {
  // Selisih nominal berarti ada yang tidak beres: tagihan yang berubah setelah
  // terbit, atau notifikasi yang tidak semestinya. Apa pun sebabnya, pesanan
  // TIDAK dilunaskan otomatis.
  it('tidak melunaskan pesanan bila nominalnya tidak cocok', async () => {
    await pembayaranService.handleNotifikasi(
      KAFE_A,
      payloadSah({ gross_amount: '10000.00' }),
    );

    expect(releaseService.releaseToKitchen).not.toHaveBeenCalled();
    expect(catatAudit).toHaveBeenCalledWith(
      expect.objectContaining({ aksi: 'webhook.nominal-tidak-cocok' }),
    );
  });

  it('menandainya untuk diperiksa manusia, bukan mendiamkannya', async () => {
    await pembayaranService.handleNotifikasi(
      KAFE_A,
      payloadSah({ gross_amount: '10000.00' }),
    );

    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { statusPembayaran: 'AWAITING_VERIFICATION' },
      }),
    );
  });

  it('melunaskan pesanan bila nominalnya pas', async () => {
    await pembayaranService.handleNotifikasi(KAFE_A, payloadSah());
    expect(releaseService.releaseToKitchen).toHaveBeenCalledWith(ORDER_ID);
  });
});

describe('webhook Midtrans — status transaksi', () => {
  it('settlement & capture bersih melunaskan pesanan', async () => {
    await pembayaranService.handleNotifikasi(KAFE_A, payloadSah());
    expect(releaseService.releaseToKitchen).toHaveBeenCalled();

    vi.mocked(releaseService.releaseToKitchen).mockClear();
    prisma.gatewayWebhookEvent.create.mockResolvedValue({ id: 'evt-2' });
    await pembayaranService.handleNotifikasi(
      KAFE_A,
      payloadSah({ transaction_status: 'capture', fraud_status: 'accept' }),
    );
    expect(releaseService.releaseToKitchen).toHaveBeenCalled();
  });

  it.each([
    ['expire', 'EXPIRED'],
    ['cancel', 'CANCELLED'],
    ['deny', 'FAILED'],
  ])('%s TIDAK dianggap lunas', async (transaksi, harapan) => {
    await pembayaranService.handleNotifikasi(
      KAFE_A,
      payloadSah({ transaction_status: transaksi }),
    );

    expect(releaseService.releaseToKitchen).not.toHaveBeenCalled();
    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { statusPembayaran: harapan } }),
    );
  });

  it('capture yang masih ditinjau (challenge) belum lunas', async () => {
    await pembayaranService.handleNotifikasi(
      KAFE_A,
      payloadSah({ transaction_status: 'capture', fraud_status: 'challenge' }),
    );
    expect(releaseService.releaseToKitchen).not.toHaveBeenCalled();
  });

  it('tidak menulis apa pun bila statusnya tidak berubah', async () => {
    // Pesanan sudah UNPAID; notifikasi `pending` juga berarti UNPAID.
    await pembayaranService.handleNotifikasi(
      KAFE_A,
      payloadSah({ transaction_status: 'pending' }),
    );
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('tidak merilis ulang pesanan yang sudah lepas dari antrean pembayaran', async () => {
    prisma.order.findFirst.mockResolvedValue(
      orderMenunggu({ status: 'DIPROSES_DAPUR', statusPembayaran: 'PAID' }),
    );

    await pembayaranService.handleNotifikasi(KAFE_A, payloadSah());
    expect(releaseService.releaseToKitchen).not.toHaveBeenCalled();
  });
});

describe('webhook Midtrans — pesanan yang sudah dibatalkan', () => {
  // Tamu menekan bayar tepat setelah kasir membatalkan pesanannya. Uangnya
  // sungguhan, tapi pesanannya memang batal — dan menandainya lunas akan
  // membuat layar berkata pesanan ini beres padahal yang sebenarnya terjadi
  // adalah kafe memegang uang yang harus dikembalikan.
  beforeEach(() => {
    prisma.order.findFirst.mockResolvedValue(
      orderMenunggu({ status: 'DIBATALKAN', statusPembayaran: 'CANCELLED' }),
    );
  });

  it('tidak merilisnya ke dapur', async () => {
    await pembayaranService.handleNotifikasi(KAFE_A, payloadSah());
    expect(releaseService.releaseToKitchen).not.toHaveBeenCalled();
  });

  it('tidak menimpa statusnya menjadi lunas', async () => {
    await pembayaranService.handleNotifikasi(KAFE_A, payloadSah());
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('meninggalkan jejak audit untuk diperiksa manusia', async () => {
    await pembayaranService.handleNotifikasi(KAFE_A, payloadSah());
    expect(catatAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        aksi: 'webhook.nominal-tidak-cocok',
        nilaiBaru: expect.objectContaining({
          alasan: expect.stringContaining('pengembalian dana'),
        }),
      }),
    );
  });
});
