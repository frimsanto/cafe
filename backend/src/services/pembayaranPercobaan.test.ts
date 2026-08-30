import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buatPrismaMock, isiBawaan } from '../test/prismaMock';

// Percobaan bayar ULANG — "Coba Bayar Lagi" pada pesanan yang sama.
//
// Setiap percobaan menerbitkan `order_id` Midtrans baru dan menimpa
// `midtransOrderId` pesanan, supaya QR lama tidak bisa lagi melunasi pesanan
// itu. Yang diuji di sini adalah apa yang terjadi pada notifikasi yang datang
// SETELAH percobaan digantikan: yang gagal/kedaluwarsa tidak boleh menimpa
// percobaan baru, dan yang benar-benar berujung uang masuk tidak boleh hilang
// tanpa jejak.

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
/** Percobaan PERTAMA — sudah digantikan; QR-nya masih beredar di HP tamu. */
const PERCOBAAN_LAMA = 'CAFEOS-aaaaaaaa-3f1c2b4a-1730000000000';
/** Percobaan KEDUA — yang kini tercatat di `orders.midtrans_order_id`. */
const PERCOBAAN_BARU = 'CAFEOS-aaaaaaaa-3f1c2b4a-1730000999999';
const AWALAN = 'CAFEOS-aaaaaaaa-3f1c2b4a-';
const SERVER_KEY = 'SB-Mid-server-kunci-uji';

const kredensialSandbox = {
  cafeId: KAFE_A,
  mode: 'SANDBOX' as const,
  clientKey: 'SB-Mid-client-abc',
  serverKey: SERVER_KEY,
};

const semuaKredensial = vi.fn(async () => [kredensialSandbox]);

vi.mock('./paymentSettings.service', () => ({
  paymentSettingsService: {
    semuaKredensial: (...args: unknown[]) => semuaKredensial(...(args as [])),
    tandaiWebhookTerverifikasi: vi.fn(async () => undefined),
    kredensialAktif: vi.fn(async () => kredensialSandbox),
    opsiMetode: vi.fn(async () => []),
  },
}));

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

function payloadSah(ubah: Record<string, unknown> = {}) {
  const dasar = {
    order_id: PERCOBAAN_LAMA,
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

function order(ubah: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    cafeId: KAFE_A,
    status: 'MENUNGGU_PEMBAYARAN',
    statusPembayaran: 'UNPAID',
    totalAmount: new Prisma.Decimal(50000),
    ...ubah,
  };
}

/** Aksi audit yang tercatat selama satu pemanggilan. */
function aksiTercatat(): string[] {
  return catatAudit.mock.calls.map((c) => String(c[0].aksi));
}

beforeEach(() => {
  isiBawaan(prisma);
  catatAudit.mockClear();
  semuaKredensial.mockResolvedValue([kredensialSandbox]);
  // Referensi persis TIDAK ketemu: pesanan sudah menunjuk percobaan yang baru.
  prisma.order.findFirst.mockResolvedValue(null);
  prisma.order.findMany.mockResolvedValue([order()]);
  prisma.order.findUnique.mockResolvedValue({
    id: ORDER_ID,
    totalAmount: new Prisma.Decimal(50000),
  });
  prisma.gatewayWebhookEvent.create.mockResolvedValue({ id: 'evt-1' });
});

// ── Uji ──────────────────────────────────────────────────────────────────────

describe('percobaan lama — pencarian pesanan', () => {
  it('mencari lewat awalan order_id, tetap dibatasi kafenya', async () => {
    await pembayaranService.handleNotifikasi(KAFE_A, payloadSah());

    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { cafeId: KAFE_A, midtransOrderId: { startsWith: AWALAN } },
      }),
    );
  });

  // Potongan 8 karakter bisa bertabrakan. Menebak dalam keadaan ambigu jauh
  // lebih berbahaya daripada tidak menemukan apa-apa.
  it('menyerah bila lebih dari satu pesanan cocok', async () => {
    prisma.order.findMany.mockResolvedValue([order(), order({ id: 'lain' })]);
    await pembayaranService.handleNotifikasi(KAFE_A, payloadSah());

    expect(releaseService.releaseToKitchen).not.toHaveBeenCalled();
    expect(prisma.gatewayWebhookEvent.create).not.toHaveBeenCalled();
  });

  it('mengabaikan order_id yang bukan format CafeOS', async () => {
    await pembayaranService.handleNotifikasi(
      KAFE_A,
      payloadSah({ order_id: 'PESANAN-ENTAH-APA' }),
    );
    expect(prisma.order.findMany).not.toHaveBeenCalled();
    expect(releaseService.releaseToKitchen).not.toHaveBeenCalled();
  });
});

describe('percobaan lama — status bukan lunas', () => {
  // Ini penjagaan yang paling menentukan: QR pertama yang kedaluwarsa tidak
  // boleh membatalkan QR kedua yang justru sedang ditatap tamu di layarnya.
  it('TIDAK menimpa status pesanan saat percobaan lama kedaluwarsa', async () => {
    await pembayaranService.handleNotifikasi(
      KAFE_A,
      payloadSah({ transaction_status: 'expire', status_code: '407' }),
    );

    expect(prisma.order.update).not.toHaveBeenCalled();
    expect(releaseService.releaseToKitchen).not.toHaveBeenCalled();
  });

  it('mencatatnya sebagai percobaan lama, bukan mendiamkannya', async () => {
    await pembayaranService.handleNotifikasi(
      KAFE_A,
      payloadSah({ transaction_status: 'expire', status_code: '407' }),
    );
    expect(aksiTercatat()).toContain('midtrans.percobaan.lama');
  });

  it('juga berlaku untuk deny & cancel', async () => {
    for (const status of ['deny', 'cancel']) {
      catatAudit.mockClear();
      await pembayaranService.handleNotifikasi(
        KAFE_A,
        payloadSah({ transaction_status: status, status_code: '202' }),
      );
      expect(prisma.order.update).not.toHaveBeenCalled();
    }
  });
});

describe('percobaan lama — uang benar-benar masuk', () => {
  // Tamu membayar QR lama yang belum sempat kedaluwarsa. Uangnya nyata, dan
  // pesanannya belum lunas — jadi pesanan ini memang harus dilunaskan.
  it('melunaskan pesanan yang masih menunggu', async () => {
    await pembayaranService.handleNotifikasi(KAFE_A, payloadSah());
    expect(releaseService.releaseToKitchen).toHaveBeenCalledWith(ORDER_ID);
  });

  it('meninggalkan jejak bahwa uangnya lewat percobaan yang digantikan', async () => {
    await pembayaranService.handleNotifikasi(KAFE_A, payloadSah());
    expect(aksiTercatat()).toContain('midtrans.percobaan.lama');
  });

  // Nominal tetap diadu dengan tagihan seperti jalur biasa.
  it('tidak melunaskan bila nominalnya tidak cocok', async () => {
    await pembayaranService.handleNotifikasi(
      KAFE_A,
      payloadSah({ gross_amount: '10000.00' }),
    );
    expect(releaseService.releaseToKitchen).not.toHaveBeenCalled();
    expect(aksiTercatat()).toContain('webhook.nominal-tidak-cocok');
  });
});

describe('percobaan lama — pembayaran ganda', () => {
  // Pesanan sudah lunas lewat percobaan kedua, lalu percobaan pertama IKUT
  // dibayar. Tagihannya satu, uangnya dua.
  it('tidak melunaskan ulang pesanan yang sudah lunas', async () => {
    prisma.order.findMany.mockResolvedValue([
      order({ status: 'ANTRE', statusPembayaran: 'PAID' }),
    ]);
    await pembayaranService.handleNotifikasi(KAFE_A, payloadSah());

    expect(releaseService.releaseToKitchen).not.toHaveBeenCalled();
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('menandainya untuk pengembalian dana', async () => {
    prisma.order.findMany.mockResolvedValue([
      order({ status: 'ANTRE', statusPembayaran: 'PAID' }),
    ]);
    await pembayaranService.handleNotifikasi(KAFE_A, payloadSah());

    expect(aksiTercatat()).toContain('pembayaran.ganda');
  });
});

describe('percobaan lama — idempotensi', () => {
  it('notifikasi kembar tidak diproses dua kali', async () => {
    prisma.gatewayWebhookEvent.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('kembar', {
        code: 'P2002',
        clientVersion: '6',
      }),
    );
    await pembayaranService.handleNotifikasi(KAFE_A, payloadSah());

    expect(releaseService.releaseToKitchen).not.toHaveBeenCalled();
  });

  // Percobaan lama & baru punya `order_id` berbeda, jadi kuncinya pun berbeda —
  // keduanya tetap tercatat sendiri-sendiri.
  it('memakai order_id gateway sebagai bagian kunci idempotensi', async () => {
    await pembayaranService.handleNotifikasi(KAFE_A, payloadSah());

    expect(prisma.gatewayWebhookEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventKey: `${PERCOBAAN_LAMA}:settlement:200`,
          orderId: ORDER_ID,
        }),
      }),
    );
    expect(PERCOBAAN_BARU).not.toBe(PERCOBAAN_LAMA);
  });
});
