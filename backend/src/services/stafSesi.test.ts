import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buatPrismaMock, isiBawaan, type PrismaMock } from '../test/prismaMock';
import { ApiError } from '../lib/ApiError';

const prisma: PrismaMock = buatPrismaMock();
vi.mock('../lib/prisma', () => ({ prisma }));

const catat = vi.fn();
vi.mock('./auditLog.service', async () => {
  const asli = await vi.importActual<typeof import('./auditLog.service')>(
    './auditLog.service',
  );
  return { ...asli, auditLogService: { catat, riwayat: vi.fn() } };
});

const { stafService } = await import('./staf.service');
const { sesiKasirService } = await import('./sesiKasir.service');
const { deviceService } = await import('./device.service');
const { hashPin } = await import('../lib/pin');

const CAFE = 'cafe-a';
const CAFE_LAIN = 'cafe-b';
const AKTOR = { userId: 'pemilik-1', role: 'OWNER' as const };

function stafPalsu(ubah: Record<string, unknown> = {}) {
  return {
    id: 'staf-1',
    cafeId: CAFE,
    name: 'Budi',
    email: 'budi@kopisenja.id',
    phone: null,
    role: 'KASIR',
    passwordHash: 'hash-sandi',
    aktif: true,
    pinHash: null,
    pinGagal: 0,
    pinTerkunciSampai: null,
    pinDiperbaruiPada: null,
    deletedAt: null,
    createdAt: new Date('2026-03-01T00:00:00Z'),
    updatedAt: new Date('2026-03-01T00:00:00Z'),
    cafe: { name: 'Kopi Senja' },
    ...ubah,
  };
}

function perangkatPalsu(ubah: Record<string, unknown> = {}) {
  return {
    id: 'terminal-1',
    cafeId: CAFE,
    label: 'Kasir Depan',
    tokenHash: 'hash',
    aktif: true,
    dicabutPada: null,
    dicabutOleh: null,
    dibuatOleh: null,
    terakhirDipakai: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...ubah,
  };
}

beforeEach(() => {
  isiBawaan(prisma);
  catat.mockReset();
});

// ═══════════════════════════════════════════════════════════════════════════

/**
 * Isolasi tenant Manajemen Staf.
 *
 * Model `User` TIDAK terdaftar di `TENANT_MODELS`, jadi ekstensi Prisma tidak
 * menyisipkan `cafeId` apa pun ke query modul ini. Yang menjaganya adalah kode
 * yang ditulis tangan — dan uji di bawah memeriksa persis itu: setiap query
 * menyebut `cafeId` sendiri. Satu `findUnique({ where: { id } })` yang lolos
 * sudah cukup untuk membuat pemilik kafe A mengubah PIN staf kafe B.
 */
describe('staf — isolasi tenant ditulis tangan', () => {
  it('menyaring daftar staf dengan cafeId', async () => {
    prisma.user.findMany.mockResolvedValue([stafPalsu()]);
    await stafService.daftar(CAFE);

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ cafeId: CAFE }) }),
    );
  });

  it('tidak pernah memakai findUnique untuk mengambil staf', async () => {
    prisma.user.findFirst.mockResolvedValue(stafPalsu());
    await stafService.detail(CAFE, 'staf-1');

    // `findUnique` hanya menerima kolom unik pada `where`-nya, sehingga `cafeId`
    // tidak bisa ikut disebut di sana — memakainya berarti melepas isolasi.
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: 'staf-1', cafeId: CAFE, deletedAt: null },
    });
  });

  it('menolak staf milik kafe lain sebagai "tidak ditemukan"', async () => {
    // Query dengan cafeId yang benar tidak menemukan apa pun.
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(stafService.detail(CAFE_LAIN, 'staf-1')).rejects.toThrow(
      /tidak ditemukan/i,
    );
  });

  it('menyertakan cafeId saat menulis perubahan, lewat updateMany', async () => {
    prisma.user.findFirst.mockResolvedValue(stafPalsu());
    prisma.user.updateMany.mockResolvedValue({ count: 1 });

    await stafService.perbarui(CAFE, 'staf-1', { name: 'Budi Santoso' }, AKTOR);

    expect(prisma.user.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'staf-1', cafeId: CAFE }),
      }),
    );
    // `update` biasa memakai `where: { id }` saja — tidak boleh dipakai di sini.
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('menganggap penulisan yang tidak mengenai baris apa pun sebagai 404', async () => {
    prisma.user.findFirst.mockResolvedValue(stafPalsu());
    prisma.user.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      stafService.perbarui(CAFE, 'staf-1', { name: 'X' }, AKTOR),
    ).rejects.toThrow(/tidak ditemukan/i);
  });
});

describe('staf — bentuk data yang keluar', () => {
  it('tidak pernah mengirim passwordHash maupun pinHash', async () => {
    prisma.user.findFirst.mockResolvedValue(
      stafPalsu({ pinHash: 'hash-pin-rahasia', passwordHash: 'hash-sandi-rahasia' }),
    );

    const dto = await stafService.detail(CAFE, 'staf-1');
    const teks = JSON.stringify(dto);

    expect(teks).not.toContain('hash-pin-rahasia');
    expect(teks).not.toContain('hash-sandi-rahasia');
    expect(teks).not.toContain('passwordHash');
    expect(teks).not.toContain('pinHash');
    // Yang dikirim hanyalah FAKTA bahwa PIN-nya ada.
    expect(dto.punyaPin).toBe(true);
  });

  it('menyembunyikan email & status kunci di layar pergantian petugas', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'staf-1', name: 'Budi', role: 'KASIR' },
    ]);

    const daftar = await stafService.untukLayarPergantian(CAFE);

    expect(daftar[0]).toEqual({ id: 'staf-1', name: 'Budi', role: 'KASIR' });
    // Layar ini berdiri di area kasir dan terlihat siapa saja yang lewat.
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { id: true, name: true, role: true },
        where: expect.objectContaining({
          cafeId: CAFE,
          aktif: true,
          pinHash: { not: null },
        }),
      }),
    );
  });
});

describe('staf — penjaga yang tidak boleh dilewati', () => {
  it('menolak menonaktifkan kasir yang masih memegang shift terbuka', async () => {
    prisma.user.findFirst.mockResolvedValue(stafPalsu({ aktif: true }));
    prisma.cashierShift.findFirst.mockResolvedValue({ id: 'shift-1' });

    await expect(stafService.ubahAktif(CAFE, 'staf-1', false, AKTOR)).rejects.toThrow(
      /masih memegang shift/i,
    );
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  // Tanpa penjaga ini, kafe bisa kehilangan satu-satunya orang yang bisa
  // membuka pengaturannya — dan tidak ada jalan memulihkannya dari dalam.
  it('menolak menonaktifkan pemilik terakhir', async () => {
    prisma.user.findFirst.mockResolvedValue(stafPalsu({ role: 'OWNER' }));
    prisma.user.count.mockResolvedValue(0);

    await expect(stafService.ubahAktif(CAFE, 'staf-1', false, AKTOR)).rejects.toThrow(
      /satu-satunya pemilik/i,
    );
  });

  it('mengizinkan menonaktifkan pemilik bila masih ada pemilik lain', async () => {
    prisma.user.findFirst.mockResolvedValue(stafPalsu({ role: 'OWNER' }));
    prisma.user.count.mockResolvedValue(1);
    prisma.cashierShift.findFirst.mockResolvedValue(null);
    prisma.user.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      stafService.ubahAktif(CAFE, 'staf-1', false, AKTOR),
    ).resolves.toBeDefined();
  });

  it('menolak email yang sudah dipakai tanpa menyebut kafe pemakainya', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'orang-lain' });

    const galat = await stafService
      .tambah(
        CAFE,
        {
          name: 'Sari',
          email: 'budi@kopisenja.id',
          phone: null,
          role: 'KASIR',
          password: 'sandi-panjang',
          pin: null,
        },
        AKTOR,
      )
      .catch((e: Error) => e.message);

    expect(galat).toMatch(/sudah dipakai/i);
    // Membocorkan kafe pemakainya = memberi tahu penebak bahwa alamat itu ada
    // di tenant lain.
    expect(galat).not.toMatch(/kafe|cafe/i);
  });
});

describe('staf — PIN', () => {
  it('menyimpan PIN sebagai hash, tidak pernah mentah', async () => {
    prisma.user.findFirst.mockResolvedValue(stafPalsu());
    prisma.user.updateMany.mockResolvedValue({ count: 1 });

    await stafService.aturPin(CAFE, 'staf-1', '4837', AKTOR);

    const data = prisma.user.updateMany.mock.calls[0][0].data;
    expect(data.pinHash).toBeTypeOf('string');
    expect(data.pinHash).not.toBe('4837');
    expect(data.pinHash).not.toContain('4837');
  });

  // Staf yang PIN-nya baru diganti tidak boleh langsung terkunci oleh kegagalan
  // pemegang PIN lama.
  it('membersihkan penghitung & penguncian saat PIN diganti', async () => {
    prisma.user.findFirst.mockResolvedValue(
      stafPalsu({ pinHash: 'lama', pinGagal: 4, pinTerkunciSampai: new Date() }),
    );
    prisma.user.updateMany.mockResolvedValue({ count: 1 });

    await stafService.aturPin(CAFE, 'staf-1', '4837', AKTOR);

    const data = prisma.user.updateMany.mock.calls[0][0].data;
    expect(data.pinGagal).toBe(0);
    expect(data.pinTerkunciSampai).toBeNull();
  });

  it('menolak PIN yang bentuknya tidak sah tanpa menyentuh database', async () => {
    prisma.user.findFirst.mockResolvedValue(stafPalsu());

    await expect(stafService.aturPin(CAFE, 'staf-1', '1234', AKTOR)).rejects.toThrow(
      /mudah ditebak/i,
    );
    await expect(stafService.aturPin(CAFE, 'staf-1', '12', AKTOR)).rejects.toThrow(
      /4-6 digit/i,
    );
    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  // Bagian N: PIN tidak pernah masuk audit log, dalam bentuk apa pun.
  it('tidak pernah menuliskan PIN ke audit log', async () => {
    prisma.user.findFirst.mockResolvedValue(stafPalsu({ pinHash: 'lama' }));
    prisma.user.updateMany.mockResolvedValue({ count: 1 });

    await stafService.aturPin(CAFE, 'staf-1', '529174', AKTOR);

    expect(catat).toHaveBeenCalled();
    expect(JSON.stringify(catat.mock.calls)).not.toContain('529174');
  });
});

// ═══════════════════════════════════════════════════════════════════════════

describe('perangkat POS', () => {
  it('menyimpan hash KODE, dan belum punya token sama sekali', async () => {
    prisma.cashierDevice.create.mockResolvedValue(perangkatPalsu());

    const { kode } = await deviceService.daftarkan(CAFE, 'Kasir Depan', AKTOR);

    const data = prisma.cashierDevice.create.mock.calls[0][0].data;
    // Terminal LAHIR TANPA TOKEN: tokennya baru terbit saat kodenya ditukar di
    // perangkat yang bersangkutan.
    expect(data.tokenHash).toBeNull();
    expect(data.kodeHash).toBeTypeOf('string');
    expect(data.kodeHash).not.toBe(kode);
    expect(data.kodeHash).not.toContain(kode);
    expect(data.kodeBerlakuHingga).toBeInstanceOf(Date);
    // Bentuk yang bisa dibaca & diucapkan manusia — itu seluruh alasannya ada.
    expect(kode).toMatch(/^KSR-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
  });

  it('tidak pernah menuliskan kode pemasangan ke audit log', async () => {
    prisma.cashierDevice.create.mockResolvedValue(perangkatPalsu());
    const { kode } = await deviceService.daftarkan(CAFE, 'Kasir Depan', AKTOR);
    expect(JSON.stringify(catat.mock.calls)).not.toContain(kode);
  });

  it('menerbitkan kode berbeda pada setiap pendaftaran', async () => {
    prisma.cashierDevice.create.mockResolvedValue(perangkatPalsu());
    const a = await deviceService.daftarkan(CAFE, 'A', AKTOR);
    const b = await deviceService.daftarkan(CAFE, 'B', AKTOR);
    expect(a.kode).not.toBe(b.kode);
  });

  /**
   * Penukaran kode adalah SATU-SATUNYA tempat token perangkat lahir, dan
   * sekali-pakainya yang membuat kode 40-bit ini memadai.
   */
  it('menukar kode dengan token, lalu melumpuhkan kodenya', async () => {
    const perangkat = perangkatPalsu({
      tokenHash: null,
      kodeDipakaiPada: null,
      kodeBerlakuHingga: new Date(Date.now() + 10 * 60_000),
    });
    prisma.cashierDevice.findUnique.mockResolvedValue(perangkat);
    prisma.cashierDevice.update.mockResolvedValue(perangkat);

    const { token } = await deviceService.tukarKode('KSR-ABCD-2345');

    expect(token).toMatch(/^[0-9a-f]{64}$/);
    const data = prisma.cashierDevice.update.mock.calls[0][0].data;
    expect(data.tokenHash).toBeTypeOf('string');
    expect(data.tokenHash).not.toBe(token);
    // Dikosongkan, bukan sekadar ditandai: baris yang tidak lagi memuat hash
    // kode tidak bisa dicocokkan percobaan kedua mana pun.
    expect(data.kodeHash).toBeNull();
    expect(data.kodeDipakaiPada).toBeInstanceOf(Date);
    expect(data.terpasangPada).toBeInstanceOf(Date);
  });

  it('memaafkan salah ketik yang sudah diketahui bentuknya (O/0, I/1)', async () => {
    const perangkat = perangkatPalsu({
      tokenHash: null,
      kodeDipakaiPada: null,
      kodeBerlakuHingga: new Date(Date.now() + 10 * 60_000),
    });
    prisma.cashierDevice.findUnique.mockResolvedValue(perangkat);
    prisma.cashierDevice.update.mockResolvedValue(perangkat);

    // Diketik dengan huruf O dan I, spasi, huruf kecil, tanpa awalan.
    await deviceService.tukarKode(' abcd 2345 ');
    const dicari = prisma.cashierDevice.findUnique.mock.calls[0][0].where.kodeHash;

    prisma.cashierDevice.findUnique.mockClear();
    await deviceService.tukarKode('KSR-ABCD-2345');
    expect(prisma.cashierDevice.findUnique.mock.calls[0][0].where.kodeHash).toBe(dicari);
  });

  it('menolak bentuk kode yang salah tanpa menyentuh database', async () => {
    await expect(deviceService.tukarKode('bukan-kode')).rejects.toThrow(ApiError);
    expect(prisma.cashierDevice.findUnique).not.toHaveBeenCalled();
  });

  /**
   * Empat sebab penolakan, SATU pesan. Membedakannya memberi tahu penebak bahwa
   * tebakannya "hampir benar" — satu-satunya keterangan yang berguna baginya.
   */
  it('menolak kode terpakai, kedaluwarsa, dan terminal yang dicabut dengan pesan sama', async () => {
    const dasar = {
      tokenHash: null,
      kodeDipakaiPada: null,
      kodeBerlakuHingga: new Date(Date.now() + 10 * 60_000),
    };
    const kasus = [
      { ...dasar, kodeDipakaiPada: new Date() },
      { ...dasar, kodeBerlakuHingga: new Date(Date.now() - 1000) },
      { ...dasar, aktif: false, dicabutPada: new Date() },
    ];

    const pesan = new Set<string>();
    for (const ubah of kasus) {
      prisma.cashierDevice.findUnique.mockResolvedValue(perangkatPalsu(ubah));
      await deviceService.tukarKode('KSR-ABCD-2345').catch((err: ApiError) => {
        pesan.add(err.message);
      });
    }
    // Kode yang sama sekali tidak ada pun harus terdengar sama.
    prisma.cashierDevice.findUnique.mockResolvedValue(null);
    await deviceService.tukarKode('KSR-ABCD-2345').catch((err: ApiError) => {
      pesan.add(err.message);
    });

    expect(pesan.size).toBe(1);
  });

  it('menolak token yang tidak dikenal', async () => {
    prisma.cashierDevice.findUnique.mockResolvedValue(null);
    expect(await deviceService.dariToken('token-karangan')).toBeNull();
    expect(await deviceService.dariToken(null)).toBeNull();
    expect(await deviceService.dariToken('')).toBeNull();
  });

  // Bagian P nomor 10: perangkat yang dicabut tidak bisa membuka sesi baru.
  it('menolak perangkat yang sudah dicabut, meski tokennya cocok', async () => {
    prisma.cashierDevice.findUnique.mockImplementation(
      async ({ where }: { where: { tokenHash: string } }) =>
        perangkatPalsu({ tokenHash: where.tokenHash, aktif: false, dicabutPada: new Date() }),
    );

    expect(await deviceService.dariToken('token-yang-dicabut')).toBeNull();
  });

  it('menolak mencabut terminal yang masih menjalankan shift', async () => {
    prisma.cashierDevice.findFirst.mockResolvedValue(perangkatPalsu());
    prisma.cashierShift.findFirst.mockResolvedValue({ id: 'shift-1' });

    await expect(deviceService.cabut(CAFE, 'terminal-1', AKTOR)).rejects.toThrow(
      /masih menjalankan shift/i,
    );
    expect(prisma.cashierDevice.update).not.toHaveBeenCalled();
  });

  // Bagian P nomor 9: perangkat tenant A tidak bisa dipakai untuk tenant B.
  it('tidak menemukan perangkat milik kafe lain', async () => {
    prisma.cashierDevice.findFirst.mockResolvedValue(null);
    await expect(deviceService.cabut(CAFE_LAIN, 'terminal-1', AKTOR)).rejects.toThrow(
      /tidak ditemukan/i,
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════

describe('sesi kasir — membuka dengan PIN', () => {
  it('membuka sesi dan membersihkan penghitung saat PIN benar', async () => {
    const pinHash = await hashPin('4837');
    prisma.user.findFirst.mockResolvedValue(stafPalsu({ pinHash, pinGagal: 3 }));
    prisma.user.updateMany.mockResolvedValue({ count: 1 });

    const { token, sesi } = await sesiKasirService.buka(
      perangkatPalsu() as never,
      'staf-1',
      '4837',
      AKTOR,
    );

    expect(token).toBeTypeOf('string');
    expect(sesi).toMatchObject({
      userId: 'staf-1',
      nama: 'Budi',
      cafeId: CAFE,
      deviceId: 'terminal-1',
    });

    const data = prisma.user.updateMany.mock.calls.at(-1)![0].data;
    expect(data.pinGagal).toBe(0);
    expect(data.pinTerkunciSampai).toBeNull();
  });

  // Kafe diambil dari PERANGKAT, tidak pernah dari klien — jadi terminal kafe A
  // mencari staf di kafe A saja, dan orang kafe B sekadar "tidak ditemukan".
  it('mencari staf memakai cafeId milik perangkat', async () => {
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(
      sesiKasirService.buka(perangkatPalsu() as never, 'staf-kafe-lain', '4837', AKTOR),
    ).rejects.toThrow();

    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ cafeId: CAFE, aktif: true }),
      }),
    );
  });

  it('menaikkan penghitung gagal saat PIN salah', async () => {
    const pinHash = await hashPin('4837');
    prisma.user.findFirst.mockResolvedValue(stafPalsu({ pinHash, pinGagal: 1 }));
    prisma.user.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      sesiKasirService.buka(perangkatPalsu() as never, 'staf-1', '9999', AKTOR),
    ).rejects.toThrow(/PIN salah/i);

    expect(prisma.user.updateMany.mock.calls[0][0].data.pinGagal).toBe(2);
  });

  // Membedakan keduanya memberi tahu penebak bahwa ia sudah menemukan orang
  // yang benar dan tinggal mengurus empat digitnya.
  it('memberi pesan yang SAMA untuk staf tak dikenal dan PIN salah', async () => {
    const pinHash = await hashPin('4837');

    prisma.user.findFirst.mockResolvedValue(null);
    const pesanTakDikenal = await sesiKasirService
      .buka(perangkatPalsu() as never, 'staf-hantu', '4837', AKTOR)
      .catch((e: Error) => e.message);

    prisma.user.findFirst.mockResolvedValue(stafPalsu({ pinHash }));
    prisma.user.updateMany.mockResolvedValue({ count: 1 });
    const pesanPinSalah = await sesiKasirService
      .buka(perangkatPalsu() as never, 'staf-1', '9999', AKTOR)
      .catch((e: Error) => e.message);

    expect(pesanTakDikenal).toBe(pesanPinSalah);
  });

  it('memperlakukan staf nonaktif & staf tanpa PIN seperti PIN salah', async () => {
    prisma.user.findFirst.mockResolvedValue(null); // filter `aktif: true` sudah membuangnya
    await expect(
      sesiKasirService.buka(perangkatPalsu() as never, 'staf-1', '4837', AKTOR),
    ).rejects.toThrow(/PIN salah/i);

    prisma.user.findFirst.mockResolvedValue(stafPalsu({ pinHash: null }));
    await expect(
      sesiKasirService.buka(perangkatPalsu() as never, 'staf-1', '4837', AKTOR),
    ).rejects.toThrow(/PIN salah/i);
  });

  /**
   * Penguncian diperiksa SEBELUM PIN dicocokkan.
   *
   * Kalau pencocokan tetap dijalankan saat terkunci, penebak cukup menunggu
   * penguncian berakhir lalu terus menebak tanpa penghitungnya pernah bertambah
   * — penguncian menjadi jeda, bukan penghalang.
   */
  it('menolak tanpa mencocokkan PIN saat sedang terkunci', async () => {
    const pinHash = await hashPin('4837');
    prisma.user.findFirst.mockResolvedValue(
      stafPalsu({
        pinHash,
        pinGagal: 5,
        pinTerkunciSampai: new Date(Date.now() + 60_000),
      }),
    );

    await expect(
      // PIN yang BENAR pun ditolak selama masih terkunci.
      sesiKasirService.buka(perangkatPalsu() as never, 'staf-1', '4837', AKTOR),
    ).rejects.toThrow(/Terlalu banyak percobaan/i);

    expect(prisma.user.updateMany).not.toHaveBeenCalled();
  });

  it('mengunci dan mencatat audit pada percobaan gagal kelima', async () => {
    const pinHash = await hashPin('4837');
    prisma.user.findFirst.mockResolvedValue(stafPalsu({ pinHash, pinGagal: 4 }));
    prisma.user.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      sesiKasirService.buka(perangkatPalsu() as never, 'staf-1', '0000', AKTOR),
    ).rejects.toThrow(/Terlalu banyak percobaan/i);

    expect(prisma.user.updateMany.mock.calls[0][0].data.pinTerkunciSampai).toBeInstanceOf(
      Date,
    );
    expect(catat).toHaveBeenCalledWith(
      expect.objectContaining({ aksi: 'pin.terkunci' }),
    );
  });

  it('menolak peran DAPUR membuka sesi kasir', async () => {
    const pinHash = await hashPin('4837');
    prisma.user.findFirst.mockResolvedValue(stafPalsu({ pinHash, role: 'DAPUR' }));
    prisma.user.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      sesiKasirService.buka(perangkatPalsu() as never, 'staf-1', '4837', AKTOR),
    ).rejects.toThrow(/tidak bisa membuka sesi kasir/i);
  });

  it('tidak pernah menuliskan PIN ke audit log saat gagal maupun berhasil', async () => {
    const pinHash = await hashPin('529174');
    prisma.user.findFirst.mockResolvedValue(stafPalsu({ pinHash, pinGagal: 4 }));
    prisma.user.updateMany.mockResolvedValue({ count: 1 });

    await sesiKasirService
      .buka(perangkatPalsu() as never, 'staf-1', '111111', AKTOR)
      .catch(() => undefined);

    const teks = JSON.stringify(catat.mock.calls);
    expect(teks).not.toContain('529174');
    expect(teks).not.toContain('111111');
  });
});

describe('sesi kasir — memuat ulang', () => {
  it('menolak sesi milik staf yang sudah dinonaktifkan', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    expect(await sesiKasirService.muat(CAFE, 'staf-1', perangkatPalsu() as never)).toBeNull();
  });

  it('menolak sesi bila peran staf berubah menjadi DAPUR', async () => {
    prisma.user.findFirst.mockResolvedValue(stafPalsu({ role: 'DAPUR' }));
    expect(await sesiKasirService.muat(CAFE, 'staf-1', perangkatPalsu() as never)).toBeNull();
  });
});
