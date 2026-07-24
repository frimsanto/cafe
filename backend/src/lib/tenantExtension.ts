import { Prisma } from '@prisma/client';
import { getTenantId } from './tenantContext';

/** Model yang barisnya dimiliki satu kafe (punya kolom `cafe_id`). */
const TENANT_MODELS = new Set([
  'MenuCategory',
  'MenuItem',
  'Table',
  'Order',
  'DashboardPreference',
  'PushSubscription',
]);

/**
 * Operasi berbasis filter — aman disisipi `where.cafeId`.
 *
 * `findUnique`/`update`/`delete` SENGAJA tidak disentuh: Prisma hanya menerima
 * kolom unik pada `where`-nya, sehingga menyisipkan `cafeId` akan ditolak.
 * Untuk operasi tersebut, service tetap wajib memverifikasi kepemilikan
 * (pola yang sudah dipakai: `findFirst({ where: { id, cafeId } })`).
 */
const FILTER_OPERATIONS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'updateMany',
  'deleteMany',
]);

type QueryArgs = { where?: Record<string, unknown>; data?: unknown };

/**
 * Sisipkan batasan tenant ke argumen query. Fungsi murni — dipisah agar
 * perilakunya bisa diuji tanpa koneksi database.
 *
 * Mengembalikan argumen apa adanya bila model bukan milik tenant atau operasi
 * tidak aman disisipi.
 */
export function applyTenantToArgs(
  model: string,
  operation: string,
  args: unknown,
  cafeId: string,
): unknown {
  if (!TENANT_MODELS.has(model)) return args;

  const typedArgs = (args ?? {}) as QueryArgs;

  if (FILTER_OPERATIONS.has(operation)) {
    return { ...typedArgs, where: { ...(typedArgs.where ?? {}), cafeId } };
  }

  // Baris baru selalu lahir sebagai milik kafe yang sedang aktif.
  if (
    operation === 'create' &&
    typeof typedArgs.data === 'object' &&
    typedArgs.data !== null
  ) {
    return {
      ...typedArgs,
      data: { ...(typedArgs.data as Record<string, unknown>), cafeId },
    };
  }

  return args;
}

/**
 * Ekstensi Prisma yang memaksa isolasi tenant.
 *
 * Saat sebuah permintaan berjalan di dalam konteks tenant (lihat middleware
 * `tenantScope`), setiap query ke model ber-tenant otomatis dibatasi
 * `cafeId` milik pengguna — sehingga lupa menulis filter tidak lagi berujung
 * kebocoran data antar kafe. Di luar konteks (mis. endpoint publik pelanggan
 * atau webhook), perilaku query tidak diubah sama sekali.
 */
export const tenantExtension = Prisma.defineExtension({
  name: 'tenant-isolation',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        const cafeId = getTenantId();
        if (!cafeId) return query(args);
        return query(applyTenantToArgs(model, operation, args, cafeId) as typeof args);
      },
    },
  },
});
