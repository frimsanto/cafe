import type { Prisma, User } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/ApiError';
import { hashPin, validasiPin } from '../lib/pin';
import { hashPassword } from '../lib/password';
import { AKSI_AUDIT, auditLogService, type AktorAudit } from './auditLog.service';
import type { StafBaruInput, StafUbahInput } from '../validation/staf.validation';

/**
 * Manajemen staf sebuah kafe — daftar, tambah, ubah, aktif/nonaktif, dan PIN.
 *
 * ── ISOLASI TENANT DI SINI DITULIS TANGAN, DAN ITU DISENGAJA ──
 *
 * Model `User` TIDAK terdaftar di `TENANT_MODELS` (`lib/tenantExtension.ts`),
 * jadi ekstensi Prisma yang biasanya menyisipkan `cafeId` secara otomatis TIDAK
 * bekerja di modul ini. Itu bukan kelalaian: `users` juga dibaca jalur login,
 * yang justru berjalan SEBELUM ada kafe yang diketahui — menambahkannya ke
 * daftar itu akan membuat setiap upaya masuk mencari pengguna di dalam kafe
 * yang belum ada.
 *
 * Konsekuensinya keras dan harus diingat setiap kali berkas ini disunting:
 * SETIAP query di modul ini WAJIB menyebut `cafeId` sendiri. Satu `findUnique`
 * yang hanya menyebut `id` sudah cukup untuk membuat pemilik kafe A mengubah
 * PIN staf kafe B dengan menebak sebuah UUID. Karena itu tidak ada satu pun
 * `findUnique` di bawah — semuanya `findFirst({ where: { id, cafeId } })`,
 * dan setiap penulisan memakai `updateMany` dengan `cafeId` di `where`-nya,
 * yang gagal dengan `count: 0` alih-alih menulis baris milik orang lain.
 *
 * ── Yang tidak pernah keluar dari sini ──
 *
 * `passwordHash` dan `pinHash`. DTO di bawah menyebut kolomnya satu per satu
 * (bukan `...user`), sehingga kolom rahasia yang kelak ditambahkan ke tabel
 * tidak ikut terbawa keluar hanya karena seseorang lupa membuangnya.
 */

// ── Bentuk yang aman dikirim ke klien ────────────────────────────────────────

export interface StafDTO {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: 'OWNER' | 'KASIR' | 'DAPUR';
  aktif: boolean;
  /** Punya PIN atau belum — nilainya sendiri tidak pernah dikirim. */
  punyaPin: boolean;
  pinTerkunci: boolean;
  createdAt: string;
}

export interface StafDenganStatusDTO extends StafDTO {
  /** Shift kasir yang sedang berjalan, bila ada. */
  shiftAktif: { id: string; namaShift: string; dibukaPada: string } | null;
  /** Kehadiran hari ini, bila sudah absen masuk. */
  hadirSejak: string | null;
}

function toStafDTO(user: User, sekarang: Date): StafDTO {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    aktif: user.aktif,
    punyaPin: user.pinHash !== null,
    pinTerkunci: user.pinTerkunciSampai !== null && user.pinTerkunciSampai > sekarang,
    createdAt: user.createdAt.toISOString(),
  };
}

/**
 * Ambil satu staf MILIK KAFE INI, atau lempar 404.
 *
 * Sengaja 404 (bukan 403) untuk staf milik kafe lain: membedakan "tidak ada"
 * dari "ada tapi bukan milikmu" memberi tahu penebak bahwa id-nya benar.
 */
async function ambilStaf(cafeId: string, userId: string): Promise<User> {
  const staf = await prisma.user.findFirst({
    where: { id: userId, cafeId, deletedAt: null },
  });
  if (!staf) throw ApiError.notFound('Staf tidak ditemukan di kafe ini');
  return staf;
}

export const stafService = {
  /** Seluruh staf kafe, beserta status hadir & shift aktifnya. */
  async daftar(cafeId: string): Promise<StafDenganStatusDTO[]> {
    const sekarang = new Date();

    const staf = await prisma.user.findMany({
      where: { cafeId, deletedAt: null },
      orderBy: [{ aktif: 'desc' }, { name: 'asc' }],
    });

    // Dua query berikut menggantikan satu query per staf (N+1) — daftar staf
    // dibuka setiap kali pemilik membuka halamannya, dan jumlah stafnya kecil
    // tapi jumlah pembukaan halamannya tidak.
    const [shiftAktif, absensiHariIni] = await Promise.all([
      prisma.cashierShift.findMany({
        where: { cafeId, status: 'AKTIF' },
        select: { id: true, userId: true, namaShift: true, dibukaPada: true },
      }),
      prisma.attendanceRecord.findMany({
        where: { cafeId, keluarPada: null, masukPada: { not: null } },
        select: { userId: true, masukPada: true },
      }),
    ]);

    const shiftPerUser = new Map(shiftAktif.map((s) => [s.userId, s]));
    const hadirPerUser = new Map(absensiHariIni.map((a) => [a.userId, a.masukPada]));

    return staf.map((u) => {
      const shift = shiftPerUser.get(u.id);
      return {
        ...toStafDTO(u, sekarang),
        shiftAktif: shift
          ? {
              id: shift.id,
              namaShift: shift.namaShift,
              dibukaPada: shift.dibukaPada.toISOString(),
            }
          : null,
        hadirSejak: hadirPerUser.get(u.id)?.toISOString() ?? null,
      };
    });
  },

  async detail(cafeId: string, userId: string): Promise<StafDTO> {
    return toStafDTO(await ambilStaf(cafeId, userId), new Date());
  },

  /**
   * Tambah staf baru.
   *
   * `email` unik LINTAS SISTEM (bukan per kafe) karena ia dipakai sebagai
   * identitas login. Pelanggarannya diterjemahkan menjadi 409 dengan pesan yang
   * TIDAK menyebut kafe mana yang sudah memakainya — itu akan membocorkan
   * keberadaan staf di tenant lain kepada siapa pun yang mau menebak alamat.
   */
  async tambah(
    cafeId: string,
    input: StafBaruInput,
    aktor: AktorAudit,
  ): Promise<StafDTO> {
    const sudahAda = await prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    });
    if (sudahAda) {
      throw ApiError.conflict('Email itu sudah dipakai. Gunakan alamat lain.');
    }

    const data: Prisma.UserCreateInput = {
      cafe: { connect: { id: cafeId } },
      name: input.name,
      email: input.email,
      phone: input.phone,
      role: input.role,
      passwordHash: await hashPassword(input.password),
      aktif: true,
    };

    // PIN opsional saat pembuatan — pemilik boleh menetapkannya belakangan,
    // dan staf tanpa PIN sekadar belum bisa membuka sesi di terminal.
    if (input.pin) {
      const cek = validasiPin(input.pin);
      if (!cek.valid) throw ApiError.badRequest(cek.pesan!);
      data.pinHash = await hashPin(input.pin);
      data.pinDiperbaruiPada = new Date();
    }

    const staf = await prisma.user.create({ data });

    await auditLogService.catat({
      cafeId,
      aksi: AKSI_AUDIT.STAF_DITAMBAH,
      aktor,
      entityType: 'user',
      entityId: staf.id,
      // Nama & peran boleh dicatat; PIN tidak pernah ikut — `auditRedaksi`
      // menyaringnya sekali lagi sebagai jaring pengaman.
      nilaiBaru: { name: staf.name, email: staf.email, role: staf.role },
    });

    return toStafDTO(staf, new Date());
  },

  /** Ubah data staf. Peran & email boleh berubah; sandi dan PIN terpisah. */
  async perbarui(
    cafeId: string,
    userId: string,
    input: StafUbahInput,
    aktor: AktorAudit,
  ): Promise<StafDTO> {
    const sebelum = await ambilStaf(cafeId, userId);

    if (input.email && input.email !== sebelum.email) {
      const bentrok = await prisma.user.findUnique({
        where: { email: input.email },
        select: { id: true },
      });
      if (bentrok) throw ApiError.conflict('Email itu sudah dipakai. Gunakan alamat lain.');
    }

    // Pemilik terakhir tidak boleh menurunkan perannya sendiri sampai kafenya
    // tidak punya pemilik sama sekali — tidak akan ada yang bisa memulihkannya.
    if (input.role && input.role !== 'OWNER' && sebelum.role === 'OWNER') {
      await pastikanBukanPemilikTerakhir(cafeId, userId);
    }

    // `updateMany` + `cafeId` di where: kalau baris itu ternyata milik kafe
    // lain, yang terjadi adalah `count: 0` — bukan penulisan yang berhasil.
    const hasil = await prisma.user.updateMany({
      where: { id: userId, cafeId, deletedAt: null },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.email !== undefined && { email: input.email }),
        ...(input.phone !== undefined && { phone: input.phone }),
        ...(input.role !== undefined && { role: input.role }),
      },
    });
    if (hasil.count === 0) throw ApiError.notFound('Staf tidak ditemukan di kafe ini');

    const sesudah = await ambilStaf(cafeId, userId);

    await auditLogService.catat({
      cafeId,
      aksi: AKSI_AUDIT.STAF_DIPERBARUI,
      aktor,
      entityType: 'user',
      entityId: userId,
      nilaiLama: { name: sebelum.name, email: sebelum.email, role: sebelum.role },
      nilaiBaru: { name: sesudah.name, email: sesudah.email, role: sesudah.role },
    });

    return toStafDTO(sesudah, new Date());
  },

  /**
   * Aktifkan / nonaktifkan staf.
   *
   * TIDAK ADA penghapusan staf di modul ini, dan itu keputusan yang disengaja:
   * seorang kasir yang pernah memegang laci muncul di rekap shift, jejak audit,
   * dan laporan absensi berbulan-bulan sesudahnya. Menghapusnya berarti
   * membuat laporan-laporan itu menunjuk orang tanpa nama. Yang dibutuhkan
   * pemilik ketika seseorang berhenti bekerja bukan penghapusan, melainkan
   * "orang ini tidak boleh masuk lagi" — dan itulah yang dilakukan di sini.
   */
  async ubahAktif(
    cafeId: string,
    userId: string,
    aktif: boolean,
    aktor: AktorAudit,
  ): Promise<StafDTO> {
    const staf = await ambilStaf(cafeId, userId);
    if (staf.aktif === aktif) return toStafDTO(staf, new Date());

    if (!aktif) {
      if (staf.role === 'OWNER') await pastikanBukanPemilikTerakhir(cafeId, userId);

      // Menonaktifkan kasir yang masih memegang laci akan meninggalkan shift
      // yang tidak bisa ditutup siapa pun — uangnya tidak pernah terhitung.
      const shift = await prisma.cashierShift.findFirst({
        where: { cafeId, userId, status: 'AKTIF' },
        select: { id: true },
      });
      if (shift) {
        throw ApiError.conflict(
          'Staf ini masih memegang shift kasir yang terbuka. Tutup shiftnya dulu.',
        );
      }
    }

    const hasil = await prisma.user.updateMany({
      where: { id: userId, cafeId, deletedAt: null },
      data: { aktif },
    });
    if (hasil.count === 0) throw ApiError.notFound('Staf tidak ditemukan di kafe ini');

    await auditLogService.catat({
      cafeId,
      aksi: aktif ? AKSI_AUDIT.STAF_DIAKTIFKAN : AKSI_AUDIT.STAF_DINONAKTIFKAN,
      aktor,
      entityType: 'user',
      entityId: userId,
      nilaiLama: { aktif: staf.aktif },
      nilaiBaru: { aktif },
    });

    return toStafDTO({ ...staf, aktif }, new Date());
  },

  /**
   * Tetapkan atau ganti PIN seorang staf.
   *
   * Tidak ada jalan MEMBACA PIN lama — tidak di sini, tidak di mana pun.
   * "Reset PIN" berarti menggantinya dengan yang baru, dan pemilik menyampaikan
   * yang baru itu kepada stafnya secara langsung. Penghitung percobaan dan
   * penguncian ikut dibersihkan: staf yang PIN-nya baru saja diganti tidak
   * boleh langsung terkunci oleh kegagalan pemegang PIN lama.
   */
  async aturPin(
    cafeId: string,
    userId: string,
    pin: string,
    aktor: AktorAudit,
  ): Promise<StafDTO> {
    const staf = await ambilStaf(cafeId, userId);

    const cek = validasiPin(pin);
    if (!cek.valid) throw ApiError.badRequest(cek.pesan!);

    const hasil = await prisma.user.updateMany({
      where: { id: userId, cafeId, deletedAt: null },
      data: {
        pinHash: await hashPin(pin),
        pinDiperbaruiPada: new Date(),
        pinGagal: 0,
        pinTerkunciSampai: null,
      },
    });
    if (hasil.count === 0) throw ApiError.notFound('Staf tidak ditemukan di kafe ini');

    await auditLogService.catat({
      cafeId,
      aksi: staf.pinHash ? AKSI_AUDIT.PIN_DIRESET : AKSI_AUDIT.PIN_DIATUR,
      aktor,
      entityType: 'user',
      entityId: userId,
      // Yang dicatat hanyalah FAKTA bahwa PIN diubah. Nilainya — lama maupun
      // baru — tidak pernah ikut, dan `auditRedaksi` menyaring kunci apa pun
      // yang mengandung "pin" sebagai jaring pengaman kedua.
      nilaiBaru: { punyaPinSebelumnya: staf.pinHash !== null },
    });

    return toStafDTO({ ...staf, pinHash: 'diperbarui' } as User, new Date());
  },

  /** Buka kunci PIN yang terkunci karena percobaan gagal beruntun. */
  async bukaKunciPin(
    cafeId: string,
    userId: string,
    aktor: AktorAudit,
  ): Promise<StafDTO> {
    await ambilStaf(cafeId, userId);

    const hasil = await prisma.user.updateMany({
      where: { id: userId, cafeId, deletedAt: null },
      data: { pinGagal: 0, pinTerkunciSampai: null },
    });
    if (hasil.count === 0) throw ApiError.notFound('Staf tidak ditemukan di kafe ini');

    await auditLogService.catat({
      cafeId,
      aksi: AKSI_AUDIT.PIN_TERKUNCI,
      aktor,
      entityType: 'user',
      entityId: userId,
      nilaiBaru: { dibukaOlehPemilik: true },
    });

    return this.detail(cafeId, userId);
  },

  /**
   * Staf yang boleh muncul di layar pergantian petugas sebuah terminal.
   *
   * Bentuknya sengaja MISKIN — hanya id, nama, dan peran. Layar ini terbuka di
   * terminal yang berdiri di area kasir dan bisa dilihat siapa saja yang lewat,
   * jadi ia tidak boleh menampilkan email, nomor HP, apalagi status penguncian
   * PIN yang memberi tahu penebak bahwa sebuah akun sedang rapuh.
   */
  async untukLayarPergantian(
    cafeId: string,
  ): Promise<Array<{ id: string; name: string; role: string }>> {
    const staf = await prisma.user.findMany({
      where: {
        cafeId,
        deletedAt: null,
        aktif: true,
        // Hanya yang sudah punya PIN — menampilkan nama yang pasti gagal
        // dibuka hanya membuat kasir mengira PIN-nya yang salah.
        pinHash: { not: null },
        role: { in: ['KASIR', 'OWNER'] },
      },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, role: true },
    });
    return staf;
  },
};

/**
 * Cegah kafe kehilangan pemilik terakhirnya.
 *
 * Tanpa penjaga ini, seorang pemilik bisa menurunkan perannya sendiri menjadi
 * KASIR — dan sesudah itu tidak ada seorang pun di kafe itu yang bisa membuka
 * pengaturan untuk mengembalikannya.
 */
async function pastikanBukanPemilikTerakhir(
  cafeId: string,
  userId: string,
): Promise<void> {
  const pemilikLain = await prisma.user.count({
    where: { cafeId, deletedAt: null, aktif: true, role: 'OWNER', id: { not: userId } },
  });
  if (pemilikLain === 0) {
    throw ApiError.conflict(
      'Ini satu-satunya pemilik yang aktif. Angkat pemilik lain dulu sebelum mengubah yang ini.',
    );
  }
}
