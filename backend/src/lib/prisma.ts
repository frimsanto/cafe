import { PrismaClient } from '@prisma/client';
import { tenantExtension } from './tenantExtension';

// Singleton PrismaClient — hindari membuat koneksi berlebihan saat hot-reload
// (tsx watch) dengan menyimpan instance di global.
//
// Client dibungkus `tenantExtension` sehingga query pada model ber-tenant
// otomatis dibatasi `cafeId` saat berjalan di dalam konteks tenant.
function createPrismaClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error'],
  }).$extends(tenantExtension);
}

type ExtendedPrismaClient = ReturnType<typeof createPrismaClient>;

const globalForPrisma = globalThis as unknown as { prisma?: ExtendedPrismaClient };

export const prisma: ExtendedPrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
