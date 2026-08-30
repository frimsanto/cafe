import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buatPrismaMock, isiBawaan } from '../test/prismaMock';
import { ApiError } from '../lib/ApiError';

// Modul yang diuji diambil lewat `await import()` di bawah — lihat catatan yang
// sama di `pembayaranWebhook.test.ts`.
const prisma = buatPrismaMock();

vi.mock('../lib/prisma', () => ({ prisma }));

const emit = {
  emitPaymentStatusChanged: vi.fn(),
  emitKitchenOrderUpdated: vi.fn(),
  emitKitchenOrderCreated: vi.fn(),
  emitDashboardOrderPaid: vi.fn(),
};
vi.mock('../realtime/realtime', () => ({ realtime: emit }));

vi.mock('./release.service', () => ({
  releaseService: {
    releaseToKitchen: vi.fn(async () => ({
      order: { id: ORDER_ID, cafeId: KAFE_A, statusPembayaran: 'PAID', metodePembayaran: 'TUNAI' },
      released: true,
    })),
  },
}));

const opsiMetode = vi.fn(async () => [] as unknown[]);
vi.mock('./paymentSettings.service', () => ({
  paymentSettingsService: {
    opsiMetode: (...a: unknown[]) => opsiMetode(...(a as [])),
    kredensialAktif: vi.fn(async () => null),
    semuaKredensial: vi.fn(async () => []),
    tandaiWebhookTerverifikasi: vi.fn(),
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

const KAFE_A = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const KAFE_B = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
const ORDER_ID = '3f1c2b4a-5d6e-4f7a-8b9c-0d1e2f3a4b5c';
const KASIR_ID = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

const { pembayaranService } = await import('./pembayaran.service');
const { releaseService } = await import('./release.service');

const aktor = { userId: KASIR_ID, role: 'KASIR', ip: '1.2.3.4', userAgent: 'uji' };

function orderMenunggu(ubah: Record<string, unknown> = {}) {
  return {
    id: ORDER_ID,
    cafeId: KAFE_A,
    status: 'MENUNGGU_PEMBAYARAN',
    statusPembayaran: 'UNPAID',
    totalAmount: new Prisma.Decimal(50000),
    payment: null,
    pembayaranManual: null,
    ...ubah,
  };
}

/** Bentuk minimal metode yang tersedia pada sebuah kanal. */
function opsi(...metode: string[]) {
  return metode.map((m) => ({ metode: m, wajibVerifikasiKasir: true }));
}

beforeEach(() => {
  isiBawaan(prisma);
  prisma.order.findFirst.mockResolvedValue(orderMenunggu());
  prisma.order.findUnique.mockResolvedValue({
    id: ORDER_ID,
    totalAmount: new Prisma.Decimal(50000),
  });
  opsiMetode.mockResolvedValue(opsi('TUNAI', 'QRIS_STATIS', 'TRANSFER', 'EDC'));
});

// ── Kasir menerima pembayaran ────────────────────────────────────────────────

describe('konfirmasiManual — otorisasi & isolasi tenant', () => {
  // Pemegang sebuah orderId tidak bisa menyentuh pesanan kafe lain, sekalipun
  // ia menebak id-nya: pencariannya SELALU membawa cafeId dari token.
  it('mencari pesanan dengan cafeId dari token', async () => {
    await pembayaranService.konfirmasiManual(
      KAFE_A,
      { orderId: ORDER_ID, metode: 'TUNAI', nominal: 50000, catatanKasir: null, referensi: null },
      aktor,
    );

    expect(prisma.order.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: ORDER_ID, cafeId: KAFE_A } }),
    );
  });

  it('menolak pesanan milik kafe lain sebagai "tidak ditemukan"', async () => {
    prisma.order.findFirst.mockResolvedValue(null);

    await expect(
      pembayaranService.konfirmasiManual(
        KAFE_B,
        { orderId: ORDER_ID, metode: 'TUNAI', nominal: 50000, catatanKasir: null, referensi: null },
        aktor,
      ),
    ).rejects.toThrow(ApiError);
    expect(releaseService.releaseToKitchen).not.toHaveBeenCalled();
  });

  // Metode yang tidak diaktifkan kafe tidak bisa dipakai menagih, walaupun
  // tombolnya entah bagaimana muncul di layar.
  it('menolak metode yang tidak aktif di kanal kasir', async () => {
    opsiMetode.mockResolvedValue(opsi('TUNAI'));

    await expect(
      pembayaranService.konfirmasiManual(
        KAFE_A,
        { orderId: ORDER_ID, metode: 'EDC', nominal: 50000, catatanKasir: null, referensi: null },
        aktor,
      ),
    ).rejects.toThrow(/belum aktif untuk kasir/i);
  });
});

describe('konfirmasiManual — aturan uang', () => {
  it('menolak uang tunai yang kurang dari tagihan', async () => {
    await expect(
      pembayaranService.konfirmasiManual(
        KAFE_A,
        { orderId: ORDER_ID, metode: 'TUNAI', nominal: 30000, catatanKasir: null, referensi: null },
        aktor,
      ),
    ).rejects.toThrow(/kurang dari total tagihan/i);
    expect(releaseService.releaseToKitchen).not.toHaveBeenCalled();
  });

  it('menerima uang tunai berlebih (ada kembalian)', async () => {
    await pembayaranService.konfirmasiManual(
      KAFE_A,
      { orderId: ORDER_ID, metode: 'TUNAI', nominal: 100000, catatanKasir: null, referensi: null },
      aktor,
    );
    expect(releaseService.releaseToKitchen).toHaveBeenCalledWith(ORDER_ID);
  });

  it('menolak pesanan yang sudah lunas', async () => {
    prisma.order.findFirst.mockResolvedValue(
      orderMenunggu({ payment: { status: 'SUCCESS' } }),
    );

    await expect(
      pembayaranService.konfirmasiManual(
        KAFE_A,
        { orderId: ORDER_ID, metode: 'TUNAI', nominal: 50000, catatanKasir: null, referensi: null },
        aktor,
      ),
    ).rejects.toThrow(/sudah dibayar/i);
  });
});

describe('konfirmasiManual — jejak', () => {
  it('menyimpan SIAPA yang memverifikasi dan kapan', async () => {
    await pembayaranService.konfirmasiManual(
      KAFE_A,
      {
        orderId: ORDER_ID,
        metode: 'TRANSFER',
        nominal: 50000,
        catatanKasir: 'sudah dicek mutasi',
        referensi: 'TRF-99',
      },
      aktor,
    );

    const args = prisma.pembayaranManual.upsert.mock.calls[0][0] as {
      create: Record<string, unknown>;
    };
    expect(args.create).toMatchObject({
      metode: 'TRANSFER',
      sumber: 'KASIR',
      statusVerifikasi: 'DITERIMA',
      diverifikasiOleh: KASIR_ID,
      referensi: 'TRF-99',
    });
    expect(args.create.diverifikasiPada).toBeInstanceOf(Date);
  });

  it('mencatat penerimaan ke jejak audit', async () => {
    await pembayaranService.konfirmasiManual(
      KAFE_A,
      { orderId: ORDER_ID, metode: 'TUNAI', nominal: 50000, catatanKasir: null, referensi: null },
      aktor,
    );

    expect(catatAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        cafeId: KAFE_A,
        aksi: 'pembayaran.manual.diterima',
        orderId: ORDER_ID,
      }),
    );
  });

  // Idempoten per pesanan: dua kali tekan tidak melahirkan dua baris bukti.
  it('memakai upsert, bukan create, untuk bukti pembayaran', async () => {
    await pembayaranService.konfirmasiManual(
      KAFE_A,
      { orderId: ORDER_ID, metode: 'TUNAI', nominal: 50000, catatanKasir: null, referensi: null },
      aktor,
    );

    expect(prisma.pembayaranManual.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.pembayaranManual.create).not.toHaveBeenCalled();
  });
});

// ── Pelanggan mengajukan pembayaran ──────────────────────────────────────────

describe('ajukanManual — pengajuan dari checkout', () => {
  beforeEach(() => {
    prisma.order.findUnique.mockResolvedValue(orderMenunggu());
  });

  // INTI PERBAIKAN: tamu yang memilih transfer TIDAK membuat pesanannya lunas.
  it('menandai pesanan AWAITING_VERIFICATION, bukan PAID', async () => {
    opsiMetode.mockResolvedValue(opsi('TRANSFER'));
    prisma.order.findFirst.mockResolvedValue(null); // `statusPembayaran` di akhir

    await pembayaranService
      .ajukanManual({
        orderId: ORDER_ID,
        metode: 'TRANSFER',
        referensi: null,
        buktiUrl: null,
        buktiPublicId: null,
      })
      .catch(() => undefined); // pembacaan status akhir memerlukan pesanan; abaikan

    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { statusPembayaran: 'AWAITING_VERIFICATION', metodePembayaran: 'TRANSFER' },
      }),
    );
    expect(releaseService.releaseToKitchen).not.toHaveBeenCalled();
    expect(prisma.payment.upsert).not.toHaveBeenCalled();
  });

  it('QRIS statis pelanggan juga menghasilkan AWAITING_VERIFICATION', async () => {
    opsiMetode.mockResolvedValue(opsi('QRIS_STATIS'));
    prisma.order.findFirst.mockResolvedValue(null);

    await pembayaranService
      .ajukanManual({
        orderId: ORDER_ID,
        metode: 'QRIS_STATIS',
        referensi: null,
        buktiUrl: null,
        buktiPublicId: null,
      })
      .catch(() => undefined);

    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ statusPembayaran: 'AWAITING_VERIFICATION' }),
      }),
    );
  });

  // Tanpa ini, siapa pun yang memegang sebuah orderId bisa mengaburkan antrean
  // kasir dengan metode yang tidak pernah ditawarkan kafenya.
  it('menolak metode yang tidak ditawarkan di checkout', async () => {
    opsiMetode.mockResolvedValue(opsi('QRIS_STATIS'));

    await expect(
      pembayaranService.ajukanManual({
        orderId: ORDER_ID,
        metode: 'TUNAI',
        referensi: null,
        buktiUrl: null,
        buktiPublicId: null,
      }),
    ).rejects.toThrow(/tidak tersedia untuk pembayaran mandiri/i);
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('menolak pesanan yang sudah dibayar', async () => {
    prisma.order.findUnique.mockResolvedValue(
      orderMenunggu({ payment: { status: 'SUCCESS' } }),
    );

    await expect(
      pembayaranService.ajukanManual({
        orderId: ORDER_ID,
        metode: 'TRANSFER',
        referensi: null,
        buktiUrl: null,
        buktiPublicId: null,
      }),
    ).rejects.toThrow(/sudah dibayar/i);
  });

  // Tamu yang berganti pikiran dari transfer ke QRIS tidak boleh muncul dua
  // kali di antrean kasir.
  it('pengajuan ulang menimpa yang lama, tidak menggandakan', async () => {
    opsiMetode.mockResolvedValue(opsi('TRANSFER', 'QRIS_STATIS'));
    prisma.order.findFirst.mockResolvedValue(null);

    await pembayaranService
      .ajukanManual({
        orderId: ORDER_ID,
        metode: 'TRANSFER',
        referensi: null,
        buktiUrl: null,
        buktiPublicId: null,
      })
      .catch(() => undefined);

    expect(prisma.pembayaranManual.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.pembayaranManual.create).not.toHaveBeenCalled();
  });
});

// ── Kasir menolak pembayaran ─────────────────────────────────────────────────

describe('tolakManual', () => {
  const menunggu = {
    statusVerifikasi: 'MENUNGGU',
    metode: 'TRANSFER',
    alasanPenolakan: null,
  };

  beforeEach(() => {
    prisma.order.findFirst.mockResolvedValue(
      orderMenunggu({
        statusPembayaran: 'AWAITING_VERIFICATION',
        pembayaranManual: menunggu,
      }),
    );
  });

  it('menyimpan alasan, pelaku, dan waktunya', async () => {
    await pembayaranService
      .tolakManual(KAFE_A, { orderId: ORDER_ID, alasan: 'dana tidak masuk' }, aktor)
      .catch(() => undefined);

    const args = prisma.pembayaranManual.update.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(args.data).toMatchObject({
      statusVerifikasi: 'DITOLAK',
      alasanPenolakan: 'dana tidak masuk',
      diverifikasiOleh: KASIR_ID,
    });
    expect(args.data.diverifikasiPada).toBeInstanceOf(Date);
  });

  // Kembali ke UNPAID, bukan FAILED: tamu masih boleh mencoba metode lain, dan
  // pesanannya belum ke mana-mana.
  it('mengembalikan status pembayaran ke UNPAID', async () => {
    await pembayaranService
      .tolakManual(KAFE_A, { orderId: ORDER_ID, alasan: 'dana tidak masuk' }, aktor)
      .catch(() => undefined);

    expect(prisma.order.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { statusPembayaran: 'UNPAID' } }),
    );
  });

  it('mencatat penolakan beserta alasannya ke jejak audit', async () => {
    await pembayaranService
      .tolakManual(KAFE_A, { orderId: ORDER_ID, alasan: 'dana tidak masuk' }, aktor)
      .catch(() => undefined);

    expect(catatAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        aksi: 'pembayaran.manual.ditolak',
        nilaiBaru: expect.objectContaining({ alasan: 'dana tidak masuk' }),
      }),
    );
  });

  it('menolak pesanan yang sudah lunas', async () => {
    prisma.order.findFirst.mockResolvedValue(
      orderMenunggu({ payment: { status: 'SUCCESS' }, pembayaranManual: menunggu }),
    );

    await expect(
      pembayaranService.tolakManual(KAFE_A, { orderId: ORDER_ID, alasan: 'apa pun' }, aktor),
    ).rejects.toThrow(/sudah lunas/i);
  });

  it('menolak pesanan yang tidak punya pengajuan manual', async () => {
    prisma.order.findFirst.mockResolvedValue(orderMenunggu());

    await expect(
      pembayaranService.tolakManual(KAFE_A, { orderId: ORDER_ID, alasan: 'apa pun' }, aktor),
    ).rejects.toThrow(/tidak ada pengajuan/i);
  });

  // Penolakan kedua tidak menimpa alasan yang pertama — jejaknya utuh.
  it('penolakan berulang tidak menulis alasan kedua', async () => {
    prisma.order.findFirst.mockResolvedValue(
      orderMenunggu({
        pembayaranManual: { ...menunggu, statusVerifikasi: 'DITOLAK' },
      }),
    );

    await pembayaranService
      .tolakManual(KAFE_A, { orderId: ORDER_ID, alasan: 'alasan kedua' }, aktor)
      .catch(() => undefined);

    expect(prisma.pembayaranManual.update).not.toHaveBeenCalled();
  });
});
