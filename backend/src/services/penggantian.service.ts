import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/ApiError';
import { normalisasiStatusPenggantian, type StatusPenggantian } from '../lib/shiftStatus';
import { AKSI_AUDIT, auditLogService, type AktorAudit } from './auditLog.service';

/**
 * Kasir pengganti.
 *
 * ── Jadwalnya TIDAK diubah ──
 *
 * Godaan yang paling besar adalah menimpa `shift_schedules.user_id` dengan nama
 * penggantinya — satu baris, selesai. Tapi itu menghapus fakta bahwa
 * penggantian pernah terjadi, dan justru itulah fakta yang ingin dilihat
 * pemilik: siapa yang SEHARUSNYA datang, siapa yang AKHIRNYA datang, dan
 * kenapa. Karena itu jadwalnya dibiarkan utuh dan penggantian hidup sebagai
 * barisnya sendiri.
 *
 * ── Kebijakan kafe menentukan urutannya ──
 *
 * Dua kafe bisa menginginkan hal yang berlawanan, dan keduanya masuk akal:
 *
 *   `penggantiBolehLangsung = true`  — pengganti boleh mulai bekerja sekarang,
 *     persetujuan menyusul. Kafe yang kasirnya mendadak sakit pukul enam pagi
 *     tidak bisa menunggu pemiliknya bangun.
 *   `penggantiBolehLangsung = false` — persetujuan dulu, baru boleh bekerja.
 *     Kafe yang ingin memastikan tidak ada orang tak dikenal memegang laci.
 *
 * Yang diputuskan kebijakan ini hanyalah APAKAH shift boleh dibuka sebelum
 * disetujui. Pencatatannya sama di kedua kasus — permintaan yang ditolak
 * belakangan tetap meninggalkan jejak bahwa orang itu sempat bekerja.
 */

export interface PenggantianDTO {
  id: string;
  status: StatusPenggantian;
  alasan: string;
  diajukanPada: string;
  diputuskanPada: string | null;
  alasanKeputusan: string | null;
  jadwal: { id: string; tanggal: string; namaShift: string };
  staffTerjadwal: { id: string; nama: string };
  staffPengganti: { id: string; nama: string };
}

const INCLUDE = {
  schedule: { include: { template: { select: { nama: true } } } },
  staffTerjadwal: { select: { id: true, name: true } },
  staffPengganti: { select: { id: true, name: true } },
} as const;

type PenggantianLengkap = {
  id: string;
  status: string;
  alasan: string;
  diajukanPada: Date;
  diputuskanPada: Date | null;
  alasanKeputusan: string | null;
  schedule: { id: string; tanggal: Date; template: { nama: string } };
  staffTerjadwal: { id: string; name: string };
  staffPengganti: { id: string; name: string };
};

function toDTO(p: PenggantianLengkap): PenggantianDTO {
  return {
    id: p.id,
    status: normalisasiStatusPenggantian(p.status),
    alasan: p.alasan,
    diajukanPada: p.diajukanPada.toISOString(),
    diputuskanPada: p.diputuskanPada?.toISOString() ?? null,
    alasanKeputusan: p.alasanKeputusan,
    jadwal: {
      id: p.schedule.id,
      tanggal: p.schedule.tanggal.toISOString().slice(0, 10),
      namaShift: p.schedule.template.nama,
    },
    staffTerjadwal: { id: p.staffTerjadwal.id, nama: p.staffTerjadwal.name },
    staffPengganti: { id: p.staffPengganti.id, nama: p.staffPengganti.name },
  };
}

export const penggantianService = {
  /**
   * Ajukan diri sebagai pengganti.
   *
   * Alasan WAJIB — pemilik menyetujui alasan, bukan sekadar nama. "Budi sakit"
   * dan "Budi tidak memberi kabar" menuntut tindak lanjut yang berbeda, dan
   * keduanya lenyap bila kolom ini boleh kosong.
   */
  async ajukan(
    cafeId: string,
    scheduleId: string,
    penggantiId: string,
    alasan: string,
    aktor: AktorAudit,
  ): Promise<PenggantianDTO> {
    const jadwal = await prisma.shiftSchedule.findFirst({
      where: { id: scheduleId, cafeId, status: 'DIJADWALKAN' },
      include: { template: { select: { nama: true } } },
    });
    if (!jadwal) throw ApiError.notFound('Jadwal tidak ditemukan di kafe ini');

    if (jadwal.userId === penggantiId) {
      throw ApiError.badRequest('Kamu memang yang dijadwalkan pada shift itu.');
    }

    // `cafeId` eksplisit — `User` tidak ikut ekstensi tenant.
    const pengganti = await prisma.user.findFirst({
      where: { id: penggantiId, cafeId, deletedAt: null, aktif: true },
      select: { id: true, name: true, role: true },
    });
    if (!pengganti) throw ApiError.notFound('Staf pengganti tidak ditemukan di kafe ini');
    if (pengganti.role === 'DAPUR') {
      throw ApiError.badRequest('Peran dapur tidak bisa menggantikan shift kasir.');
    }

    const sudahAda = await prisma.shiftReplacement.findFirst({
      where: { cafeId, scheduleId, status: 'PENDING_APPROVAL' },
      select: { id: true },
    });
    if (sudahAda) {
      throw ApiError.conflict('Sudah ada permintaan pengganti yang menunggu persetujuan.');
    }

    const dibuat = await prisma.shiftReplacement.create({
      data: {
        cafeId,
        scheduleId,
        staffTerjadwalId: jadwal.userId,
        staffPenggantiId: penggantiId,
        alasan,
        status: 'PENDING_APPROVAL',
      },
      include: INCLUDE,
    });

    await auditLogService.catat({
      cafeId,
      aksi: AKSI_AUDIT.PENGGANTI_DIAJUKAN,
      aktor,
      entityType: 'shift_replacement',
      entityId: dibuat.id,
      alasan,
      nilaiBaru: { pengganti: pengganti.name, shift: jadwal.template.nama },
    });

    return toDTO(dibuat as unknown as PenggantianLengkap);
  },

  /** Pemilik menyetujui / menolak. */
  async putuskan(
    cafeId: string,
    penggantianId: string,
    setuju: boolean,
    alasanKeputusan: string | null,
    aktor: AktorAudit,
  ): Promise<PenggantianDTO> {
    const permintaan = await prisma.shiftReplacement.findFirst({
      where: { id: penggantianId, cafeId },
      include: INCLUDE,
    });
    if (!permintaan) throw ApiError.notFound('Permintaan tidak ditemukan di kafe ini');
    if (normalisasiStatusPenggantian(permintaan.status) !== 'PENDING_APPROVAL') {
      throw ApiError.conflict('Permintaan ini sudah diputuskan.');
    }
    if (!setuju && !alasanKeputusan) {
      throw ApiError.badRequest('Penolakan wajib disertai alasan.');
    }

    const diperbarui = await prisma.shiftReplacement.update({
      where: { id: penggantianId },
      data: {
        status: setuju ? 'APPROVED' : 'REJECTED',
        diputuskanOleh: aktor.userId ?? null,
        diputuskanPada: new Date(),
        alasanKeputusan,
      },
      include: INCLUDE,
    });

    // Absensi staf yang digantikan ditandai REPLACED bila ia memang tidak
    // datang — supaya laporan kehadiran tidak menghitungnya sebagai mangkir.
    if (setuju) {
      await prisma.attendanceRecord.updateMany({
        where: {
          cafeId,
          scheduleId: permintaan.scheduleId,
          userId: permintaan.staffTerjadwalId,
          masukPada: null,
        },
        data: { status: 'REPLACED' },
      });
    }

    await auditLogService.catat({
      cafeId,
      aksi: setuju ? AKSI_AUDIT.PENGGANTI_DISETUJUI : AKSI_AUDIT.PENGGANTI_DITOLAK,
      aktor,
      entityType: 'shift_replacement',
      entityId: penggantianId,
      alasan: alasanKeputusan,
      nilaiLama: { status: 'PENDING_APPROVAL' },
      nilaiBaru: { status: setuju ? 'APPROVED' : 'REJECTED' },
    });

    return toDTO(diperbarui as unknown as PenggantianLengkap);
  },

  /**
   * Boleh tidak orang ini membuka shift atas jadwal itu sekarang?
   *
   * Dipanggil sebelum buka shift. Mengembalikan alasan penolakan sebagai teks,
   * atau `null` bila boleh — bentuk itu dipilih supaya pemanggilnya tidak perlu
   * menebak kalimat apa yang harus ditampilkan.
   */
  async penghalangUntukMembuka(
    cafeId: string,
    scheduleId: string,
    userId: string,
  ): Promise<string | null> {
    const jadwal = await prisma.shiftSchedule.findFirst({
      where: { id: scheduleId, cafeId },
      select: { userId: true },
    });
    if (!jadwal) return null;
    if (jadwal.userId === userId) return null;

    const cafe = await prisma.cafe.findUnique({
      where: { id: cafeId },
      select: { penggantiBolehLangsung: true },
    });

    const permintaan = await prisma.shiftReplacement.findFirst({
      where: { cafeId, scheduleId, staffPenggantiId: userId },
      orderBy: { diajukanPada: 'desc' },
      select: { status: true },
    });

    if (!permintaan) {
      return 'Shift ini dijadwalkan untuk orang lain. Ajukan diri sebagai pengganti dulu.';
    }
    const status = normalisasiStatusPenggantian(permintaan.status);
    if (status === 'REJECTED') {
      return 'Permintaan penggantianmu ditolak pemilik.';
    }
    if (status === 'PENDING_APPROVAL' && cafe?.penggantiBolehLangsung === false) {
      return 'Penggantian ini masih menunggu persetujuan pemilik.';
    }
    return null;
  },

  /** Daftar permintaan — pemilik memakainya sebagai antrean persetujuan. */
  async daftar(
    cafeId: string,
    filter: { status?: StatusPenggantian } = {},
  ): Promise<PenggantianDTO[]> {
    const baris = await prisma.shiftReplacement.findMany({
      where: { cafeId, ...(filter.status ? { status: filter.status } : {}) },
      include: INCLUDE,
      orderBy: { diajukanPada: 'desc' },
      take: 200,
    });
    return baris.map((b) => toDTO(b as unknown as PenggantianLengkap));
  },
};
