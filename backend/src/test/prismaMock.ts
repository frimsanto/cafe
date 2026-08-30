import { vi } from 'vitest';

/**
 * Prisma tiruan untuk uji service.
 *
 * TIDAK ADA database yang disentuh rangkaian uji ini — lihat catatan di
 * `vitest.config.ts`. Yang ditiru hanyalah operasi yang benar-benar dipakai
 * service pembayaran; menambah operasi baru berarti menambahkannya di sini
 * juga, dan itu disengaja: daftar ini sekaligus menjadi catatan tentang
 * seberapa lebar permukaan database yang disentuh modul pembayaran.
 */

type Fn = ReturnType<typeof vi.fn>;

function model(): Record<string, Fn> {
  return {
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    createMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
    groupBy: vi.fn(),
    aggregate: vi.fn(),
  };
}

export type PrismaMock = ReturnType<typeof buatPrismaMock>;

export function buatPrismaMock() {
  const mock = {
    cafe: model(),
    user: model(),
    table: model(),
    menuItem: model(),
    order: model(),
    orderItem: model(),
    payment: model(),
    pembayaranManual: model(),
    metodePembayaranKafe: model(),
    midtransCredential: model(),
    paymentAuditLog: model(),
    gatewayWebhookEvent: model(),
    // Transaksi interaktif menjalankan callback-nya dengan klien yang sama.
    // Cukup untuk uji: yang diperiksa adalah APA yang ditulis, bukan bahwa
    // PostgreSQL benar-benar menggulungnya kembali.
    $transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb(mock)),
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn(),
  };
  return mock;
}

/** Nilai bawaan yang membuat pemanggilan tak terduga tidak meledak. */
export function isiBawaan(prisma: PrismaMock): void {
  for (const [nama, nilai] of Object.entries(prisma)) {
    if (typeof nilai !== 'object' || nilai === null) continue;
    if (nama.startsWith('$')) continue;
    const m = nilai as Record<string, Fn>;
    m.findUnique.mockResolvedValue(null);
    m.findUniqueOrThrow.mockResolvedValue(null);
    m.findFirst.mockResolvedValue(null);
    m.findMany.mockResolvedValue([]);
    m.create.mockResolvedValue({});
    m.createMany.mockResolvedValue({ count: 0 });
    m.update.mockResolvedValue({});
    m.updateMany.mockResolvedValue({ count: 0 });
    m.upsert.mockResolvedValue({});
    m.delete.mockResolvedValue({});
    m.deleteMany.mockResolvedValue({ count: 0 });
    m.count.mockResolvedValue(0);
    if (m.groupBy) m.groupBy.mockResolvedValue([]);
    if (m.aggregate) m.aggregate.mockResolvedValue({ _sum: {}, _count: { _all: 0 } });
  }
  prisma.$queryRaw.mockResolvedValue([]);
  prisma.$executeRaw.mockResolvedValue(0);
}
