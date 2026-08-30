import type { ShiftSchedule, ShiftTemplate } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ApiError } from '../lib/ApiError';
import {
  formatJam,
  hariISO,
  kunciTanggal,
  rentangShift,
  zonaAman,
  type Rentang,
} from '../lib/waktuKafe';
import { AKSI_AUDIT, auditLogService, type AktorAudit } from './auditLog.service';
import type {
  JadwalBaruInput,
  TemplateShiftInput,
} from '../validation/jadwal.validation';

/**
 * Jadwal kerja: pola shift yang berulang, dan siapa yang ditugaskan kapan.
 *
 * Jadwal adalah RENCANA — ia tidak menyatakan siapa yang benar-benar datang
 * (itu `attendance_records`) maupun siapa yang memegang uang (itu
 * `cashier_shifts`). Perbedaan itu yang membuat pertanyaan "Budi terlambat
 * berapa menit" punya jawaban: ada rencana untuk dibandingkan.
 *
 * ── Bentrok jadwal tidak bisa dijadikan constraint database ──
 *
 * `shift_schedules` punya unique `(cafeId, templateId, userId, tanggal)`, yang
 * hanya mencegah penugasan KEMBAR PERSIS. Bentrok yang sesungguhnya — dua
 * template BERBEDA yang jamnya bertumpang tindih — tidak bisa dinyatakan
 * sebagai constraint karena jamnya ada di tabel lain, dan perbandingannya
 * menuntut aritmetika zona waktu. Karena itu ia diperiksa di sini, dan
 * pemeriksaannya harus memperhitungkan shift yang melewati tengah malam:
 * shift malam tanggal 5 (22:00-06:00) bertabrakan dengan shift pagi tanggal 6
 * (05:00-13:00) meski tanggalnya berbeda.
 */

// ── Bentuk yang dikirim ke klien ─────────────────────────────────────────────

export interface TemplateShiftDTO {
  id: string;
  nama: string;
  jamMulai: string;
  jamSelesai: string;
  menitMulai: number;
  menitSelesai: number;
  lewatTengahMalam: boolean;
  toleransiTerlambatMenit: number;
  hariBerlaku: number[];
  aktif: boolean;
  urutan: number;
  catatan: string | null;
}

export interface JadwalDTO {
  id: string;
  tanggal: string;
  status: string;
  catatan: string | null;
  template: TemplateShiftDTO;
  staf: { id: string; nama: string; role: string };
  terminal: { id: string; label: string } | null;
  /** Waktu mulai & selesai sesungguhnya, sudah memperhitungkan tengah malam. */
  mulaiPada: string;
  selesaiPada: string;
}

function toTemplateDTO(t: ShiftTemplate): TemplateShiftDTO {
  return {
    id: t.id,
    nama: t.nama,
    jamMulai: formatJam(t.menitMulai),
    jamSelesai: formatJam(t.menitSelesai),
    menitMulai: t.menitMulai,
    menitSelesai: t.menitSelesai,
    lewatTengahMalam: t.lewatTengahMalam,
    toleransiTerlambatMenit: t.toleransiTerlambatMenit,
    hariBerlaku: t.hariBerlaku,
    aktif: t.aktif,
    urutan: t.urutan,
    catatan: t.catatan,
  };
}

type JadwalLengkap = ShiftSchedule & {
  template: ShiftTemplate;
  user: { id: string; name: string; role: string };
  device: { id: string; label: string } | null;
};

const JADWAL_INCLUDE = {
  template: true,
  user: { select: { id: true, name: true, role: true } },
  device: { select: { id: true, label: true } },
} as const;

/** Tanggal kolom `DATE` → `YYYY-MM-DD`, tanpa tergelincir zona waktu. */
function kunciDariKolomTanggal(tanggal: Date): string {
  return kunciTanggal(tanggal, 'UTC');
}

function toJadwalDTO(j: JadwalLengkap, timezone: string): JadwalDTO {
  const kunci = kunciDariKolomTanggal(j.tanggal);
  const rentang = rentangShift(kunci, j.template, timezone);
  return {
    id: j.id,
    tanggal: kunci,
    status: j.status,
    catatan: j.catatan,
    template: toTemplateDTO(j.template),
    staf: { id: j.user.id, nama: j.user.name, role: j.user.role },
    terminal: j.device ? { id: j.device.id, label: j.device.label } : null,
    mulaiPada: rentang.mulai.toISOString(),
    selesaiPada: rentang.selesai.toISOString(),
  };
}

/** Zona waktu kafe — dibaca sekali per operasi, bukan per baris. */
async function zonaKafe(cafeId: string): Promise<string> {
  const cafe = await prisma.cafe.findUnique({
    where: { id: cafeId },
    select: { timezone: true },
  });
  return zonaAman(cafe?.timezone);
}

/** Dua rentang setengah terbuka bertumpang tindih? */
function bertumpangTindih(a: Rentang, b: Rentang): boolean {
  return a.mulai < b.selesai && b.mulai < a.selesai;
}

export const jadwalService = {
  // ── Template shift ─────────────────────────────────────────────────────────

  async daftarTemplate(cafeId: string): Promise<TemplateShiftDTO[]> {
    const baris = await prisma.shiftTemplate.findMany({
      where: { cafeId, deletedAt: null },
      orderBy: [{ urutan: 'asc' }, { menitMulai: 'asc' }],
    });
    return baris.map(toTemplateDTO);
  },

  async simpanTemplate(
    cafeId: string,
    input: TemplateShiftInput,
    aktor: AktorAudit,
    templateId?: string,
  ): Promise<TemplateShiftDTO> {
    // `lewatTengahMalam` DITURUNKAN di validasi, bukan dipercaya dari klien —
    // lihat catatannya di `jadwal.validation.ts`.
    const data = {
      nama: input.nama,
      menitMulai: input.menitMulai,
      menitSelesai: input.menitSelesai,
      lewatTengahMalam: input.lewatTengahMalam,
      toleransiTerlambatMenit: input.toleransiTerlambatMenit,
      hariBerlaku: input.hariBerlaku,
      aktif: input.aktif,
      urutan: input.urutan,
      catatan: input.catatan,
    };

    let template: ShiftTemplate;
    if (templateId) {
      const ada = await prisma.shiftTemplate.findFirst({
        where: { id: templateId, cafeId, deletedAt: null },
      });
      if (!ada) throw ApiError.notFound('Template shift tidak ditemukan di kafe ini');
      template = await prisma.shiftTemplate.update({
        where: { id: templateId },
        data,
      });
    } else {
      template = await prisma.shiftTemplate.create({ data: { ...data, cafeId } });
    }

    await auditLogService.catat({
      cafeId,
      aksi: AKSI_AUDIT.JADWAL_TEMPLATE_DISIMPAN,
      aktor,
      entityType: 'shift_template',
      entityId: template.id,
      nilaiBaru: {
        nama: template.nama,
        jam: `${formatJam(template.menitMulai)}-${formatJam(template.menitSelesai)}`,
        lewatTengahMalam: template.lewatTengahMalam,
      },
    });

    return toTemplateDTO(template);
  },

  /**
   * Hapus template — SOFT DELETE.
   *
   * Jadwal dan shift kasir yang sudah terjadi menunjuk ke template ini, dan
   * laporan bulan lalu membacanya untuk tahu shift apa itu. Menghapusnya
   * sungguhan akan membuat riwayat kehilangan namanya (dan foreign key-nya
   * memang `Restrict`, jadi database akan menolak lebih dulu).
   */
  async hapusTemplate(
    cafeId: string,
    templateId: string,
    aktor: AktorAudit,
  ): Promise<void> {
    const template = await prisma.shiftTemplate.findFirst({
      where: { id: templateId, cafeId, deletedAt: null },
    });
    if (!template) throw ApiError.notFound('Template shift tidak ditemukan di kafe ini');

    const terpakai = await prisma.shiftSchedule.count({
      where: { cafeId, templateId, tanggal: { gte: new Date() } },
    });
    if (terpakai > 0) {
      throw ApiError.conflict(
        `Template ini masih dipakai ${terpakai} jadwal mendatang. Batalkan jadwalnya dulu.`,
      );
    }

    await prisma.shiftTemplate.update({
      where: { id: templateId },
      data: { deletedAt: new Date(), aktif: false },
    });

    await auditLogService.catat({
      cafeId,
      aksi: AKSI_AUDIT.JADWAL_TEMPLATE_DIHAPUS,
      aktor,
      entityType: 'shift_template',
      entityId: templateId,
      nilaiLama: { nama: template.nama },
    });
  },

  // ── Penugasan ──────────────────────────────────────────────────────────────

  /** Jadwal sebuah kafe pada rentang tanggal (inklusif). */
  async daftar(
    cafeId: string,
    dari: string,
    sampai: string,
    filter: { userId?: string } = {},
  ): Promise<JadwalDTO[]> {
    const timezone = await zonaKafe(cafeId);
    const baris = await prisma.shiftSchedule.findMany({
      where: {
        cafeId,
        tanggal: { gte: new Date(`${dari}T00:00:00Z`), lte: new Date(`${sampai}T00:00:00Z`) },
        ...(filter.userId ? { userId: filter.userId } : {}),
      },
      include: JADWAL_INCLUDE,
      orderBy: [{ tanggal: 'asc' }, { template: { menitMulai: 'asc' } }],
    });
    return baris.map((j) => toJadwalDTO(j as JadwalLengkap, timezone));
  },

  /**
   * Tetapkan seorang staf pada sebuah shift di sebuah tanggal.
   *
   * Bentrok diperiksa terhadap SELURUH jadwal orang itu di tanggal tersebut
   * DAN tanggal sebelumnya — shift malam kemarin bisa masih berjalan hari ini.
   */
  async tetapkan(
    cafeId: string,
    input: JadwalBaruInput,
    aktor: AktorAudit,
  ): Promise<JadwalDTO> {
    const timezone = await zonaKafe(cafeId);

    const [template, staf] = await Promise.all([
      prisma.shiftTemplate.findFirst({
        where: { id: input.templateId, cafeId, deletedAt: null, aktif: true },
      }),
      // `cafeId` eksplisit — `User` tidak ikut ekstensi tenant.
      prisma.user.findFirst({
        where: { id: input.userId, cafeId, deletedAt: null, aktif: true },
        select: { id: true, name: true },
      }),
    ]);
    if (!template) throw ApiError.notFound('Template shift tidak ditemukan atau non-aktif');
    if (!staf) throw ApiError.notFound('Staf tidak ditemukan di kafe ini');

    // Hari berlaku: daftar kosong berarti berlaku setiap hari.
    if (template.hariBerlaku.length > 0) {
      const rentang = rentangShift(input.tanggal, template, timezone);
      const hari = hariISO(rentang.mulai, timezone);
      if (!template.hariBerlaku.includes(hari)) {
        throw ApiError.badRequest(
          `Shift "${template.nama}" tidak berlaku pada hari itu.`,
        );
      }
    }

    if (input.deviceId) {
      const terminal = await prisma.cashierDevice.findFirst({
        where: { id: input.deviceId, cafeId, aktif: true },
        select: { id: true },
      });
      if (!terminal) throw ApiError.notFound('Terminal tidak ditemukan di kafe ini');
    }

    await pastikanTidakBentrok(cafeId, input.userId, input.tanggal, template, timezone);

    const dibuat = await prisma.shiftSchedule
      .create({
        data: {
          cafeId,
          templateId: input.templateId,
          userId: input.userId,
          tanggal: new Date(`${input.tanggal}T00:00:00Z`),
          deviceId: input.deviceId,
          catatan: input.catatan,
          dibuatOleh: aktor.userId ?? null,
        },
        include: JADWAL_INCLUDE,
      })
      .catch((err: unknown) => {
        // Unique `(cafeId, templateId, userId, tanggal)` — penugasan kembar
        // persis. Database yang menjadi penengahnya, bukan pemeriksaan di atas
        // yang bisa didahului permintaan lain.
        if (String(err).includes('Unique constraint')) {
          throw ApiError.conflict('Staf ini sudah dijadwalkan pada shift itu.');
        }
        throw err;
      });

    await auditLogService.catat({
      cafeId,
      aksi: AKSI_AUDIT.JADWAL_DITETAPKAN,
      aktor,
      entityType: 'shift_schedule',
      entityId: dibuat.id,
      nilaiBaru: {
        staf: staf.name,
        shift: template.nama,
        tanggal: input.tanggal,
      },
    });

    return toJadwalDTO(dibuat as JadwalLengkap, timezone);
  },

  /**
   * Batalkan sebuah penugasan.
   *
   * Statusnya diubah menjadi DIBATALKAN, barisnya tidak dihapus: absensi yang
   * sudah menunjuk ke jadwal ini tetap harus bisa menyebut apa yang semula
   * direncanakan.
   */
  async batalkan(
    cafeId: string,
    jadwalId: string,
    alasan: string | null,
    aktor: AktorAudit,
  ): Promise<JadwalDTO> {
    const jadwal = await prisma.shiftSchedule.findFirst({
      where: { id: jadwalId, cafeId },
      include: JADWAL_INCLUDE,
    });
    if (!jadwal) throw ApiError.notFound('Jadwal tidak ditemukan di kafe ini');

    const diperbarui = await prisma.shiftSchedule.update({
      where: { id: jadwalId },
      data: { status: 'DIBATALKAN' },
      include: JADWAL_INCLUDE,
    });

    await auditLogService.catat({
      cafeId,
      aksi: AKSI_AUDIT.JADWAL_DIBATALKAN,
      aktor,
      entityType: 'shift_schedule',
      entityId: jadwalId,
      alasan,
      nilaiLama: { status: jadwal.status },
      nilaiBaru: { status: 'DIBATALKAN' },
    });

    return toJadwalDTO(diperbarui as JadwalLengkap, await zonaKafe(cafeId));
  },

  /**
   * Jadwal seorang staf yang RELEVAN untuk sekarang — dipakai saat absen masuk
   * dan buka shift.
   *
   * Mengembalikan jadwal yang jendela waktunya sedang/hampir berjalan, diurutkan
   * dari yang paling dekat dengan `sekarang`. Jendelanya sengaja longgar (empat
   * jam sebelum sampai selesai): kasir yang datang setengah jam lebih awal
   * harus tetap menemukan shiftnya, dan yang terlambat satu jam pun masih.
   */
  async untukAbsen(
    cafeId: string,
    userId: string,
    sekarang: Date,
  ): Promise<Array<{ jadwal: JadwalDTO; rentang: Rentang }>> {
    const timezone = await zonaKafe(cafeId);
    const hariIni = kunciTanggal(sekarang, timezone);

    // Kemarin ikut dibaca: shift malam yang dimulai kemarin masih berjalan.
    const baris = await prisma.shiftSchedule.findMany({
      where: {
        cafeId,
        userId,
        status: 'DIJADWALKAN',
        tanggal: {
          gte: new Date(`${geserTanggal(hariIni, -1)}T00:00:00Z`),
          lte: new Date(`${geserTanggal(hariIni, 1)}T00:00:00Z`),
        },
      },
      include: JADWAL_INCLUDE,
    });

    const TOLERANSI_AWAL_MS = 4 * 60 * 60 * 1000;

    return baris
      .map((j) => {
        const kunci = kunciDariKolomTanggal(j.tanggal);
        return {
          jadwal: toJadwalDTO(j as JadwalLengkap, timezone),
          rentang: rentangShift(kunci, (j as JadwalLengkap).template, timezone),
        };
      })
      .filter(
        ({ rentang }) =>
          sekarang.getTime() >= rentang.mulai.getTime() - TOLERANSI_AWAL_MS &&
          sekarang.getTime() <= rentang.selesai.getTime(),
      )
      .sort(
        (a, b) =>
          Math.abs(a.rentang.mulai.getTime() - sekarang.getTime()) -
          Math.abs(b.rentang.mulai.getTime() - sekarang.getTime()),
      );
  },
};

/** Geser `YYYY-MM-DD` beberapa hari lewat kalender UTC murni. */
function geserTanggal(kunci: string, hari: number): string {
  const [y, m, d] = kunci.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + hari));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

/**
 * Tolak penugasan yang jamnya bertabrakan dengan jadwal lain milik orang itu.
 *
 * Tanggal di sekitarnya ikut diperiksa, bukan hanya tanggal yang diminta: shift
 * malam 22:00-06:00 pada tanggal 5 berakhir di tanggal 6, sehingga ia
 * bertabrakan dengan shift pagi tanggal 6 meski keduanya "tanggal berbeda".
 * Memeriksa satu tanggal saja akan melewatkan justru bentrok yang paling sering
 * terjadi di kafe yang buka malam.
 */
async function pastikanTidakBentrok(
  cafeId: string,
  userId: string,
  tanggal: string,
  template: ShiftTemplate,
  timezone: string,
): Promise<void> {
  const baru = rentangShift(tanggal, template, timezone);

  const sekitar = await prisma.shiftSchedule.findMany({
    where: {
      cafeId,
      userId,
      status: 'DIJADWALKAN',
      tanggal: {
        gte: new Date(`${geserTanggal(tanggal, -1)}T00:00:00Z`),
        lte: new Date(`${geserTanggal(tanggal, 1)}T00:00:00Z`),
      },
    },
    include: { template: true },
  });

  for (const lain of sekitar) {
    const rentangLain = rentangShift(
      kunciDariKolomTanggal(lain.tanggal),
      lain.template,
      timezone,
    );
    if (bertumpangTindih(baru, rentangLain)) {
      throw ApiError.conflict(
        `Bentrok dengan jadwal "${lain.template.nama}" ` +
          `(${formatJam(lain.template.menitMulai)}-${formatJam(lain.template.menitSelesai)}) ` +
          `pada ${kunciDariKolomTanggal(lain.tanggal)}.`,
      );
    }
  }
}
