import { describe, expect, it } from 'vitest';
import { applyTenantToArgs } from './tenantExtension';

const KAFE_A = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const KAFE_B = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';

/**
 * Isolasi tenant pada lapisan Prisma.
 *
 * Yang diuji di sini bukan "apakah query jalan", tapi apakah `cafeId` benar-
 * benar dipaksakan pada model pembayaran yang baru. Model yang lupa didaftarkan
 * ke `TENANT_MODELS` tidak akan gagal di mana pun — ia cuma diam-diam bisa
 * dibaca lintas kafe, dan itu tidak terlihat sampai ada yang mencarinya.
 */
describe('applyTenantToArgs — model pembayaran', () => {
  const modelBaru = [
    'MetodePembayaranKafe',
    'MidtransCredential',
    'PaymentAuditLog',
    'GatewayWebhookEvent',
  ];

  it.each(modelBaru)('menyisipkan cafeId pada findMany %s', (model) => {
    expect(applyTenantToArgs(model, 'findMany', {}, KAFE_A)).toEqual({
      where: { cafeId: KAFE_A },
    });
  });

  // Ini yang mencegah tenant A membaca konfigurasi tenant B dengan menempelkan
  // id tenant B pada filter: batasan tenant ditulis BELAKANGAN, jadi ia menang.
  it.each(modelBaru)('menimpa cafeId yang dikirim klien pada %s', (model) => {
    const hasil = applyTenantToArgs(
      model,
      'findFirst',
      { where: { cafeId: KAFE_B, metode: 'TUNAI' } },
      KAFE_A,
    ) as { where: Record<string, unknown> };

    expect(hasil.where.cafeId).toBe(KAFE_A);
    expect(hasil.where.metode).toBe('TUNAI');
  });

  it('membatasi updateMany & deleteMany juga', () => {
    for (const operasi of ['updateMany', 'deleteMany']) {
      const hasil = applyTenantToArgs(
        'MidtransCredential',
        operasi,
        { where: { mode: 'PRODUCTION' } },
        KAFE_A,
      ) as { where: Record<string, unknown> };
      expect(hasil.where.cafeId).toBe(KAFE_A);
    }
  });

  it('baris baru lahir sebagai milik kafe aktif', () => {
    const hasil = applyTenantToArgs(
      'PaymentAuditLog',
      'create',
      { data: { aksi: 'metode.diperbarui', cafeId: KAFE_B } },
      KAFE_A,
    ) as { data: Record<string, unknown> };

    expect(hasil.data.cafeId).toBe(KAFE_A);
  });

  // `findUnique`/`update` menerima hanya kolom unik pada `where`-nya, jadi
  // menyisipkan `cafeId` justru akan ditolak Prisma. Service yang memakainya
  // WAJIB memverifikasi kepemilikan sendiri — dan uji ini menjaga agar tidak
  // ada yang keliru mengira lapisan ini menanganinya.
  it('tidak menyentuh operasi berbasis kunci unik', () => {
    const args = { where: { id: 'x' } };
    expect(applyTenantToArgs('MidtransCredential', 'findUnique', args, KAFE_A)).toBe(args);
    expect(applyTenantToArgs('MidtransCredential', 'update', args, KAFE_A)).toBe(args);
  });

  it('membiarkan model non-tenant apa adanya', () => {
    const args = { where: { email: 'a@b.c' } };
    expect(applyTenantToArgs('TenantRegistration', 'findMany', args, KAFE_A)).toBe(args);
  });
});
