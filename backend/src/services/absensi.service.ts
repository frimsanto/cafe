import type { AttendanceRecord } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/ApiError';
import { kunciTanggal, rentangShift, selisihMenit, zonaAman } from '../lib/waktuKafe';
import {
  normalisasiStatusAbsensi,
  statusMasuk,
  statusPulang,
  type JenisFoto,
  type StatusAbsensi,
} from '../lib/shiftStatus';
import { AKSI_AUDIT, auditLogService, type AktorAudit } from './auditLog.service';
import { fotoAbsensiService } from './fotoAbsensi.service';
import { jadwalService } from './jadwal.service';

/**
 * Absensi: siapa yang benar-benar datang, kapan, dengan bukti foto.
 *
 * ── Waktu selalu waktu SERVER ──
 *
 * `masukPada` dan `keluarPada` diisi dari jam server saat permintaannya
 * diterima, tidak pernah dari nilai yang dikirim perangkat. Jam tablet bisa
 * diputar mundur oleh siapa pun yang memegangnya, dan absensi yang bisa diputar
 * mundur tidak membuktikan apa pun — ia hanya membuat pemilik mengira punya
 * bukti. Waktu tangkap yang diklaim perangkat tetap dicatat, tapi sebagai
 * KETERANGAN pada fotonya (`attendance_photos.diambil_pada`), bukan sebagai
 * jam kerja.
 *
 * ── Foto tidak pernah dilewati diam-diam ──
 *
 * Kamera bisa gagal: perangkat tanpa kamera, izin ditolak, lensa rusak. Jalan
 * keluarnya ADA, tapi ia meninggalkan jejak — `pengecualianFoto = true` dengan
 * alasan wajib, menunggu persetujuan pemilik. Yang tidak boleh terjadi adalah
 * absensi tanpa foto yang tampak sama persis dengan absensi berfoto di layar
 * pemilik.
 *
 * ── Absensi bukan shift kasir ──
 *
 * Absen masuk menyatakan kehadiran, bukan tanggung jawab atas uang. Membuka
 * shift kasir adalah langkah TERPISAH yang menuntut absensi ini lebih dulu.
 * Seorang staf dapur absen tanpa pernah menyentuh laci, dan seorang kasir bisa
 * hadir setengah jam sebelum ia membuka lacinya.
 */

export interface AbsensiDTO {
  id: string;
  userId: string;
  nama: string;
  status: StatusAbsensi;
  masukPada: string | null;
  keluarPada: string | null;
  terlambatMenit: number | null;
  lemburMenit: number | null;
  durasiMenit: number | null;
  pengecualianFoto: boolean;
  alasanPengecualian: string | null;
  disetujuiPada: string | null;
  jadwal: { id: string; namaShift: string; mulaiPada: string; selesaiPada: string } | null;
  foto: Array<{ id: string; jenis: string; terlambatDiunggah: boolean; diterimaPada: string }>;
  catatan: string | null;
}

type AbsensiLengkap = AttendanceRecord & {
  user: { name: string };
  photos: Array<{
    id: string;
    jenis: string;
    terlambatDiunggah: boolean;
    diterimaPada: Date;
    dihapusPada: Date | null;
  }>;
  schedule:
    | ({ id: string; tanggal: Date; template: { nama: string } } & Record<string, unknown>)
    | null;
};

const ABSENSI_INCLUDE = {
  user: { select: { name: true } },
  photos: {
    select: {
      id: true,
      jenis: true,
      terlambatDiunggah: true,
      diterimaPada: true,
      dihapusPada: true,
    },
    orderBy: { diterimaPada: 'asc' },
  },
  schedule: { include: { template: true } },
} as const;

function toAbsensiDTO(a: AbsensiLengkap, timezone: string): AbsensiDTO {
  let jadwal: AbsensiDTO['jadwal'] = null;
  if (a.schedule) {
    const template = a.schedule.template as {
      nama: string;
      menitMulai: number;
      menitSelesai: number;
      lewatTengahMalam: boolean;
    };
    // Rentang dihitung ulang dari template & tanggalnya — bukan disimpan —
    // supaya tidak ada dua sumber kebenaran untuk "shift ini mulai jam berapa".
    const r = rentangShift(kunciTanggal(a.schedule.tanggal, 'UTC'), template, timezone);
    jadwal = {
      id: a.schedule.id,
      namaShift: template.nama,
      mulaiPada: r.mulai.toISOString(),
      selesaiPada: r.selesai.toISOString(),
    };
  }

  return {
    id: a.id,
    userId: a.userId,
    nama: a.user.name,
    status: normalisasiStatusAbsensi(a.status),
    masukPada: a.masukPada?.toISOString() ?? null,
    keluarPada: a.keluarPada?.toISOString() ?? null,
    terlambatMenit: a.terlambatMenit,
    lemburMenit: a.lemburMenit,
    durasiMenit: a.durasiMenit,
    pengecualianFoto: a.pengecualianFoto,
    alasanPengecualian: a.alasanPengecualian,
    disetujuiPada: a.disetujuiPada?.toISOString() ?? null,
    jadwal,
    // Foto yang sudah lewat masa simpan tidak lagi disebut — tautannya akan
    // menuju berkas yang tiada.
    foto: a.photos
      .filter((f) => f.dihapusPada === null)
      .map((f) => ({
        id: f.id,
        jenis: f.jenis,
        terlambatDiunggah: f.terlambatDiunggah,
        diterimaPada: f.diterimaPada.toISOString(),
      })),
    catatan: a.catatan,
  };
}

async function zonaKafe(cafeId: string): Promise<string> {
  const cafe = await prisma.cafe.findUnique({
    where: { id: cafeId },
    select: { timezone: true },
  });
  return zonaAman(cafe?.timezone);
}

export interface MasukInput {
  cafeId: string;
  userId: string;
  deviceId: string | null;
  /** Byte foto dari kamera. Null hanya bila ada pengecualian. */
  foto: Buffer | null;
  /** Waktu yang DIKLAIM perangkat saat memotret — keterangan, bukan jam kerja. */
  diambilPada: Date | null;
  alasanPengecualian: string | null;
  correlationId: string | null;
}

export const absensiService = {
  /** Absensi berjalan (sudah masuk, belum pulang) milik seorang staf. */
  async berjalan(cafeId: string, userId: string): Promise<AbsensiDTO | null> {
    const baris = await prisma.attendanceRecord.findFirst({
      where: { cafeId, userId, masukPada: { not: null }, keluarPada: null },
      include: ABSENSI_INCLUDE,
      orderBy: { masukPada: 'desc' },
    });
    if (!baris) return null;
    return toAbsensiDTO(baris as unknown as AbsensiLengkap, await zonaKafe(cafeId));
  },

  /**
   * Absen masuk.
   *
   * Jadwal dicocokkan bila ada — kalau tidak ada, kehadirannya tetap dicatat.
   * Menolak absensi hanya karena orangnya tidak terjadwal akan membuat kasir
   * pengganti yang datang mendadak tidak punya cara mencatatkan dirinya, dan
   * pemilik kehilangan justru data yang paling ingin dilihatnya.
   */
  async masuk(input: MasukInput, aktor: AktorAudit): Promise<AbsensiDTO> {
    const { cafeId, userId } = input;
    const sekarang = new Date();

    const staf = await prisma.user.findFirst({
      where: { id: userId, cafeId, deletedAt: null, aktif: true },
      select: { id: true, name: true },
    });
    if (!staf) throw ApiError.notFound('Staf tidak ditemukan di kafe ini');

    const sudah = await prisma.attendanceRecord.findFirst({
      where: { cafeId, userId, masukPada: { not: null }, keluarPada: null },
      select: { id: true },
    });
    if (sudah) {
      throw ApiError.conflict('Kamu sudah absen masuk dan belum absen pulang.');
    }

    // Foto WAJIB, kecuali ada pengecualian beralasan. Tidak ada jalan ketiga.
    if (!input.foto && !input.alasanPengecualian) {
      throw ApiError.badRequest(
        'Foto absen masuk wajib. Bila kamera bermasalah, isi alasan pengecualian.',
      );
    }

    const cocok = await jadwalService.untukAbsen(cafeId, userId, sekarang);
    const terpilih = cocok[0] ?? null;

    let terlambatMenit: number | null = null;
    let status: StatusAbsensi = 'PRESENT';
    if (terpilih) {
      terlambatMenit = selisihMenit(terpilih.rentang.mulai, sekarang);
      status = statusMasuk(
        terlambatMenit,
        terpilih.jadwal.template.toleransiTerlambatMenit,
      );
    }

    // Foto disimpan ke disk LEBIH DULU. Kalau penyimpanannya gagal, tidak ada
    // baris absensi yang terlanjur mengaku punya bukti.
    const hasilFoto = input.foto
      ? await fotoAbsensiService.simpan(cafeId, input.foto, input.diambilPada, sekarang)
      : null;

    const absensi = await prisma.attendanceRecord.create({
      data: {
        cafeId,
        userId,
        scheduleId: terpilih?.jadwal.id ?? null,
        masukPada: sekarang,
        status,
        terlambatMenit,
        deviceMasukId: input.deviceId,
        pengecualianFoto: hasilFoto === null,
        alasanPengecualian: hasilFoto === null ? input.alasanPengecualian : null,
        correlationId: input.correlationId,
      },
      include: ABSENSI_INCLUDE,
    });

    if (hasilFoto) {
      await fotoAbsensiService.catat(
        cafeId,
        absensi.id,
        'MASUK' as JenisFoto,
        hasilFoto,
        input.diambilPada,
      );
    }

    await auditLogService.catat({
      cafeId,
      aksi: AKSI_AUDIT.ABSEN_MASUK,
      aktor,
      entityType: 'attendance',
      entityId: absensi.id,
      deviceId: input.deviceId,
      correlationId: input.correlationId,
      nilaiBaru: {
        staf: staf.name,
        status,
        terlambatMenit,
        berfoto: hasilFoto !== null,
      },
    });

    if (hasilFoto === null) {
      // Pengecualian dicatat TERPISAH supaya pemilik bisa menyaringnya sebagai
      // daftar tersendiri — bukan mencarinya di antara absensi biasa.
      await auditLogService.catat({
        cafeId,
        aksi: AKSI_AUDIT.ABSEN_PENGECUALIAN_FOTO,
        aktor,
        entityType: 'attendance',
        entityId: absensi.id,
        alasan: input.alasanPengecualian,
        deviceId: input.deviceId,
      });
    }

    return this.ambil(cafeId, absensi.id);
  },

  /**
   * Absen pulang.
   *
   * Shift kasir yang masih terbuka MENGHALANGI — uang di laci belum dihitung,
   * dan orang yang memegangnya tidak boleh tercatat sudah pulang. Urutannya
   * tetap: tutup shift dulu, baru absen pulang.
   */
  async pulang(
    cafeId: string,
    userId: string,
    opsi: {
      deviceId: string | null;
      foto: Buffer | null;
      diambilPada: Date | null;
      alasanPengecualian: string | null;
      catatan: string | null;
    },
    aktor: AktorAudit,
  ): Promise<AbsensiDTO> {
    const sekarang = new Date();

    const absensi = await prisma.attendanceRecord.findFirst({
      where: { cafeId, userId, masukPada: { not: null }, keluarPada: null },
      include: ABSENSI_INCLUDE,
      orderBy: { masukPada: 'desc' },
    });
    if (!absensi) throw ApiError.conflict('Belum ada absen masuk yang perlu ditutup.');

    const shiftTerbuka = await prisma.cashierShift.findFirst({
      where: { cafeId, userId, status: 'AKTIF' },
      select: { id: true, namaShift: true },
    });
    if (shiftTerbuka) {
      throw ApiError.conflict(
        `Shift "${shiftTerbuka.namaShift}" masih terbuka. Tutup shift dulu sebelum absen pulang.`,
      );
    }

    if (!opsi.foto && !opsi.alasanPengecualian) {
      throw ApiError.badRequest(
        'Foto absen pulang wajib. Bila kamera bermasalah, isi alasan pengecualian.',
      );
    }

    const timezone = await zonaKafe(cafeId);
    const dto = toAbsensiDTO(absensi as unknown as AbsensiLengkap, timezone);

    const durasiMenit = absensi.masukPada
      ? selisihMenit(absensi.masukPada, sekarang)
      : null;

    // Lembur & pulang-awal diukur terhadap JADWALNYA, bukan terhadap durasi.
    // Seseorang bisa bekerja delapan jam penuh dan tetap pulang lebih awal bila
    // ia datang terlambat — dua fakta berbeda yang keduanya perlu tercatat.
    let lemburMenit = 0;
    let pulangAwalMenit = 0;
    if (dto.jadwal) {
      const selesaiJadwal = new Date(dto.jadwal.selesaiPada);
      const beda = selisihMenit(selesaiJadwal, sekarang);
      if (beda > 0) lemburMenit = beda;
      else pulangAwalMenit = -beda;
    }

    const statusAkhir = statusPulang(
      normalisasiStatusAbsensi(absensi.status),
      lemburMenit,
      pulangAwalMenit,
    );

    const hasilFoto = opsi.foto
      ? await fotoAbsensiService.simpan(cafeId, opsi.foto, opsi.diambilPada, sekarang)
      : null;

    await prisma.attendanceRecord.update({
      where: { id: absensi.id },
      data: {
        keluarPada: sekarang,
        durasiMenit,
        lemburMenit: lemburMenit || null,
        status: statusAkhir,
        deviceKeluarId: opsi.deviceId,
        catatan: opsi.catatan ?? absensi.catatan,
        ...(hasilFoto === null && opsi.alasanPengecualian
          ? {
              pengecualianFoto: true,
              alasanPengecualian: opsi.alasanPengecualian,
            }
          : {}),
      },
    });

    if (hasilFoto) {
      await fotoAbsensiService.catat(
        cafeId,
        absensi.id,
        'KELUAR' as JenisFoto,
        hasilFoto,
        opsi.diambilPada,
      );
    }

    await auditLogService.catat({
      cafeId,
      aksi: AKSI_AUDIT.ABSEN_PULANG,
      aktor,
      entityType: 'attendance',
      entityId: absensi.id,
      deviceId: opsi.deviceId,
      nilaiBaru: { status: statusAkhir, durasiMenit, lemburMenit, pulangAwalMenit },
    });

    if (hasilFoto === null) {
      await auditLogService.catat({
        cafeId,
        aksi: AKSI_AUDIT.ABSEN_PENGECUALIAN_FOTO,
        aktor,
        entityType: 'attendance',
        entityId: absensi.id,
        alasan: opsi.alasanPengecualian,
        deviceId: opsi.deviceId,
      });
    }

    return this.ambil(cafeId, absensi.id);
  },

  async ambil(cafeId: string, absensiId: string): Promise<AbsensiDTO> {
    const baris = await prisma.attendanceRecord.findFirst({
      where: { id: absensiId, cafeId },
      include: ABSENSI_INCLUDE,
    });
    if (!baris) throw ApiError.notFound('Catatan absensi tidak ditemukan');
    return toAbsensiDTO(baris as unknown as AbsensiLengkap, await zonaKafe(cafeId));
  },

  /** Riwayat absensi kafe pada rentang tanggal — dipakai laporan & dasbor. */
  async daftar(
    cafeId: string,
    dari: Date,
    sampai: Date,
    filter: { userId?: string } = {},
  ): Promise<AbsensiDTO[]> {
    const timezone = await zonaKafe(cafeId);
    const baris = await prisma.attendanceRecord.findMany({
      where: {
        cafeId,
        masukPada: { gte: dari, lt: sampai },
        ...(filter.userId ? { userId: filter.userId } : {}),
      },
      include: ABSENSI_INCLUDE,
      orderBy: { masukPada: 'desc' },
    });
    return baris.map((b) => toAbsensiDTO(b as unknown as AbsensiLengkap, timezone));
  },

  /** Pemilik menyetujui sebuah pengecualian foto. */
  async setujuiPengecualian(
    cafeId: string,
    absensiId: string,
    aktor: AktorAudit,
  ): Promise<AbsensiDTO> {
    const absensi = await prisma.attendanceRecord.findFirst({
      where: { id: absensiId, cafeId },
      select: { id: true, pengecualianFoto: true },
    });
    if (!absensi) throw ApiError.notFound('Catatan absensi tidak ditemukan');
    if (!absensi.pengecualianFoto) {
      throw ApiError.badRequest('Absensi ini tidak punya pengecualian foto.');
    }

    await prisma.attendanceRecord.update({
      where: { id: absensiId },
      data: { disetujuiOleh: aktor.userId ?? null, disetujuiPada: new Date() },
    });

    await auditLogService.catat({
      cafeId,
      aksi: AKSI_AUDIT.ABSEN_DIKOREKSI,
      aktor,
      entityType: 'attendance',
      entityId: absensiId,
      nilaiBaru: { pengecualianDisetujui: true },
    });

    return this.ambil(cafeId, absensiId);
  },
};
