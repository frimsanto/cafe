import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buatPrismaMock, isiBawaan } from '../test/prismaMock';

// Payload yang BENAR-BENAR dikirim ke Snap.
//
// Uji ini menahan satu regresi yang tidak bisa dilihat dari mana pun kecuali
// dari isi permintaannya sendiri: Midtrans menerima `enabled_payments` yang
// salah eja tanpa mengeluh, lalu diam-diam tidak menampilkan kanalnya. Sekali
// `other_qris` hilang dari daftar ini, QRIS lenyap dari Snap di HP — dan
// laptop tetap terlihat baik-baik saja karena GoPay di layar lebar digambar
// sebagai QR.

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
  releaseService: { releaseToKitchen: vi.fn() },
}));
vi.mock('./auditLog.service', async () => {
  const asli = await vi.importActual<typeof import('./auditLog.service')>(
    './auditLog.service',
  );
  return {
    ...asli,
    auditLogService: { catat: vi.fn(async () => undefined), riwayat: vi.fn() },
  };
});

const KAFE_A = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const KAFE_B = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
const ORDER_ID = '3f1c2b4a-5d6e-4f7a-8b9c-0d1e2f3a4b5c';

interface KredensialUji {
  cafeId: string;
  mode: 'SANDBOX' | 'PRODUCTION';
  clientKey: string;
  serverKey: string;
}

/** Kredensial per kafe — Server Key TIRUAN, tidak pernah keluar dari uji ini. */
const kredensial: Record<string, KredensialUji> = {
  [KAFE_A]: {
    cafeId: KAFE_A,
    mode: 'SANDBOX' as const,
    clientKey: 'SB-Mid-client-kafe-a',
    serverKey: 'SB-Mid-server-kafe-a',
  },
  [KAFE_B]: {
    cafeId: KAFE_B,
    mode: 'PRODUCTION' as const,
    clientKey: 'Mid-client-kafe-b',
    serverKey: 'Mid-server-kafe-b',
  },
};

const kredensialAktif = vi.fn(async (cafeId: string) => kredensial[cafeId] ?? null);
vi.mock('./paymentSettings.service', () => ({
  paymentSettingsService: {
    kredensialAktif: (...a: unknown[]) => kredensialAktif(a[0] as string),
    semuaKredensial: vi.fn(async () => []),
    tandaiWebhookTerverifikasi: vi.fn(),
    opsiMetode: vi.fn(async () => []),
  },
}));

/** Menangkap parameter `createTransaction` — inilah yang diperiksa. */
const createTransaction = vi.fn(async (_parameter: Record<string, unknown>) => ({
  token: 'snap-token-uji',
}));
const snapDibuatDengan = vi.fn();
vi.mock('../lib/midtrans', async () => {
  const asli = await vi.importActual<typeof import('../lib/midtrans')>('../lib/midtrans');
  return {
    ...asli,
    getMidtransSnap: (k: unknown) => {
      snapDibuatDengan(k);
      return { createTransaction };
    },
  };
});

const { pembayaranService } = await import('./pembayaran.service');

function orderMenunggu(cafeId = KAFE_A) {
  return {
    id: ORDER_ID,
    cafeId,
    status: 'MENUNGGU_PEMBAYARAN',
    statusPembayaran: 'UNPAID',
    midtransOrderId: null,
    totalAmount: new Prisma.Decimal(50000),
    payment: null,
    items: [
      {
        menuItemId: 'menu-1',
        name: 'Kopi Susu',
        price: new Prisma.Decimal(25000),
        quantity: 2,
      },
    ],
  };
}

/** Parameter permintaan Snap terakhir. */
function payloadTerkirim(): Record<string, unknown> {
  const terakhir = createTransaction.mock.calls.at(-1);
  if (!terakhir) throw new Error('createTransaction belum pernah dipanggil');
  return terakhir[0];
}

beforeEach(() => {
  isiBawaan(prisma);
  createTransaction.mockClear();
  snapDibuatDengan.mockClear();
  delete process.env.MIDTRANS_ENABLED_PAYMENTS;
  prisma.order.findUnique.mockResolvedValue(orderMenunggu());
  prisma.order.update.mockResolvedValue({});
});

describe('payload Snap — enabled_payments', () => {
  it('menyertakan other_qris', async () => {
    await pembayaranService.buatMidtrans(ORDER_ID);
    expect(payloadTerkirim().enabled_payments).toContain('other_qris');
  });

  // Ejaan lama yang membuat QRIS tak pernah muncul di HP.
  it('tidak lagi mengirim `qris`, `ovo`, atau `mandiri_bill`', async () => {
    await pembayaranService.buatMidtrans(ORDER_ID);
    const kanal = payloadTerkirim().enabled_payments as string[];

    expect(kanal).not.toContain('qris');
    expect(kanal).not.toContain('ovo');
    expect(kanal).not.toContain('mandiri_bill');
  });

  it('mempertahankan metode yang memang sudah ditawarkan', async () => {
    await pembayaranService.buatMidtrans(ORDER_ID);
    const kanal = payloadTerkirim().enabled_payments as string[];

    expect(kanal).toEqual(['other_qris', 'gopay', 'bca_va', 'bni_va', 'echannel']);
  });

  it('mengikuti MIDTRANS_ENABLED_PAYMENTS bila diisi', async () => {
    process.env.MIDTRANS_ENABLED_PAYMENTS = 'gopay,credit_card';
    await pembayaranService.buatMidtrans(ORDER_ID);

    expect(payloadTerkirim().enabled_payments).toEqual([
      'other_qris',
      'gopay',
      'credit_card',
    ]);
  });
});

describe('payload Snap — nominal & isolasi tenant', () => {
  it('gross_amount sama persis dengan jumlah item_details', async () => {
    await pembayaranService.buatMidtrans(ORDER_ID);
    const payload = payloadTerkirim();
    const detail = payload.transaction_details as { gross_amount: number };
    const item = payload.item_details as Array<{ price: number; quantity: number }>;

    expect(detail.gross_amount).toBe(50000);
    expect(item.reduce((s, i) => s + i.price * i.quantity, 0)).toBe(50000);
  });

  // Kafe diturunkan dari PESANAN, bukan dari input pemanggil — endpoint ini
  // publik dan tidak pernah menerima `cafeId` dari klien.
  it('memakai kredensial milik kafe pemilik pesanan', async () => {
    prisma.order.findUnique.mockResolvedValue(orderMenunggu(KAFE_B));
    await pembayaranService.buatMidtrans(ORDER_ID);

    expect(kredensialAktif).toHaveBeenCalledWith(KAFE_B);
    expect(snapDibuatDengan).toHaveBeenCalledWith(
      expect.objectContaining({ cafeId: KAFE_B, mode: 'PRODUCTION' }),
    );
  });

  it('order_id gateway memuat kafe & pesanan yang benar', async () => {
    await pembayaranService.buatMidtrans(ORDER_ID);
    const detail = payloadTerkirim().transaction_details as { order_id: string };

    expect(detail.order_id).toMatch(/^CAFEOS-aaaaaaaa-3f1c2b4a-\d+$/);
  });

  it('setiap percobaan memakai order_id gateway yang berbeda', async () => {
    await pembayaranService.buatMidtrans(ORDER_ID);
    const pertama = (payloadTerkirim().transaction_details as { order_id: string })
      .order_id;

    vi.setSystemTime(Date.now() + 1000);
    await pembayaranService.buatMidtrans(ORDER_ID);
    const kedua = (payloadTerkirim().transaction_details as { order_id: string })
      .order_id;

    expect(kedua).not.toBe(pertama);
    vi.useRealTimers();
  });
});

describe('payload Snap — rahasia', () => {
  // Server Key dipakai SDK untuk header Authorization; ia tidak pernah boleh
  // ikut dalam badan permintaan, dan tidak pernah dikirim ke frontend.
  it('tidak memuat Server Key di badan permintaan', async () => {
    await pembayaranService.buatMidtrans(ORDER_ID);
    expect(JSON.stringify(payloadTerkirim())).not.toContain('server');
  });

  it('hanya mengembalikan Client Key ke pemanggil', async () => {
    const hasil = await pembayaranService.buatMidtrans(ORDER_ID);

    expect(hasil.clientKey).toBe('SB-Mid-client-kafe-a');
    expect(JSON.stringify(hasil)).not.toContain('SB-Mid-server-kafe-a');
  });

  it('menolak pesanan dari kafe yang belum menyetel Midtrans', async () => {
    prisma.order.findUnique.mockResolvedValue(orderMenunggu('kafe-tanpa-midtrans'));
    await expect(pembayaranService.buatMidtrans(ORDER_ID)).rejects.toThrow(
      /Midtrans belum dikonfigurasi/,
    );
    expect(createTransaction).not.toHaveBeenCalled();
  });

  it('menolak membuat transaksi untuk pesanan yang sudah lunas', async () => {
    prisma.order.findUnique.mockResolvedValue({
      ...orderMenunggu(),
      payment: { status: 'SUCCESS' },
    });
    await expect(pembayaranService.buatMidtrans(ORDER_ID)).rejects.toThrow(
      /sudah dibayar/,
    );
    expect(createTransaction).not.toHaveBeenCalled();
  });
});
