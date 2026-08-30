import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buatPrismaMock, isiBawaan } from '../test/prismaMock';

// Pencarian pesanan untuk halaman status.
//
// Endpoint `GET /api/pembayaran/:orderId/status` menerima DUA bentuk id: id
// pesanan CafeOS (UUID) dan `order_id` gateway (`CAFEOS-...`). Kolom `orders.id`
// bertipe `uuid` di PostgreSQL, jadi menyertakan `{ id: orderId }` untuk nilai
// yang bukan UUID membuat Prisma melempar P2023 — SELURUH query gagal sebelum
// sempat mencocokkan `midtransOrderId`, dan pesanan yang jelas ada dijawab 500.
//
// Terbukti di produksi 2026-08-30: `GET .../CAFEOS-633ddcd4-.../status` → 500,
// sementara UUID yang tidak ada menjawab 404 dengan benar.

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
vi.mock('./release.service', () => ({ releaseService: { releaseToKitchen: vi.fn() } }));
vi.mock('./auditLog.service', async () => {
  const asli = await vi.importActual<typeof import('./auditLog.service')>(
    './auditLog.service',
  );
  return {
    ...asli,
    auditLogService: { catat: vi.fn(async () => undefined), riwayat: vi.fn() },
  };
});
vi.mock('./paymentSettings.service', () => ({
  paymentSettingsService: {
    // Tidak ada kredensial → tidak ada panggilan ke Midtrans; uji ini hanya
    // soal bentuk query, bukan rekonsiliasi gateway.
    kredensialAktif: vi.fn(async () => null),
    semuaKredensial: vi.fn(async () => []),
    tandaiWebhookTerverifikasi: vi.fn(),
    opsiMetode: vi.fn(async () => []),
  },
}));

const { pembayaranService } = await import('./pembayaran.service');

const KAFE = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const ORDER_UUID = '3f1c2b4a-5d6e-4f7a-8b9c-0d1e2f3a4b5c';
const ORDER_GATEWAY = 'CAFEOS-aaaaaaaa-3f1c2b4a-1788008331937';

function pesanan() {
  return {
    id: ORDER_UUID,
    cafeId: KAFE,
    status: 'MENUNGGU_PEMBAYARAN',
    statusPembayaran: 'UNPAID',
    metodePembayaran: null,
    midtransOrderId: ORDER_GATEWAY,
    nominalDibayar: null,
    totalAmount: new Prisma.Decimal(50000),
    createdAt: new Date('2026-08-30T12:00:00Z'),
    updatedAt: new Date('2026-08-30T13:00:00Z'),
    items: [],
    table: null,
    payment: null,
    pembayaranManual: null,
  };
}

/** Klausa `OR` yang dikirim ke Prisma pada pemanggilan terakhir. */
function klausaOr(): Array<Record<string, unknown>> {
  const arg = prisma.order.findFirst.mock.calls.at(-1)?.[0] as {
    where: { OR: Array<Record<string, unknown>> };
  };
  return arg.where.OR;
}

beforeEach(() => {
  isiBawaan(prisma);
  prisma.order.findFirst.mockResolvedValue(pesanan());
  prisma.cafe.findUnique.mockResolvedValue({ name: 'Kopi Nako' });
  prisma.pembayaranManual.findUnique.mockResolvedValue(null);
});

describe('cari pesanan untuk halaman status', () => {
  it('mencocokkan id CafeOS bila bentuknya UUID', async () => {
    await pembayaranService.statusPembayaran(ORDER_UUID);
    expect(klausaOr()).toContainEqual({ id: ORDER_UUID });
  });

  // Inti perbaikannya: `{ id: ... }` TIDAK boleh ikut untuk nilai non-UUID.
  it('TIDAK menyertakan klausa id untuk order_id gateway', async () => {
    await pembayaranService.statusPembayaran(ORDER_GATEWAY);
    const or = klausaOr();

    expect(or).toContainEqual({ midtransOrderId: ORDER_GATEWAY });
    expect(or.some((k) => 'id' in k)).toBe(false);
  });

  it('tetap mencari lewat referensi DOKU', async () => {
    await pembayaranService.statusPembayaran('INV-DOKU-123');
    expect(klausaOr()).toContainEqual({ dokuInvoiceNumber: 'INV-DOKU-123' });
  });

  it('mengembalikan status pesanan yang ditemukan lewat order_id gateway', async () => {
    const hasil = await pembayaranService.statusPembayaran(ORDER_GATEWAY);
    expect(hasil.status).toBe('UNPAID');
    expect(hasil.cafeName).toBe('Kopi Nako');
  });

  // Teks ngawur harus berakhir 404 yang jujur, bukan 500 dari galat query.
  it('menjawab 404 untuk id yang tidak cocok apa pun', async () => {
    prisma.order.findFirst.mockResolvedValue(null);
    await expect(pembayaranService.statusPembayaran('bukan-uuid')).rejects.toMatchObject(
      { statusCode: 404 },
    );
    // Query tetap dijalankan (dan tidak melempar P2023) — 404-nya datang dari
    // "tidak ada yang cocok", bukan dari galat tipe kolom.
    expect(prisma.order.findFirst).toHaveBeenCalled();
    expect(klausaOr().some((k) => 'id' in k)).toBe(false);
  });
});
