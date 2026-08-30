import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { attachUser, requireAuth, requireRole } from '../middleware/auth';
import { tenantScope } from '../middleware/tenant';
import { requirePerangkat, requireSesiKasir } from '../middleware/perangkat';
import { uploadSingle } from '../middleware/upload';
import { ApiError } from '../lib/ApiError';
import { rentangHariOperasional, zonaAman } from '../lib/waktuKafe';
import { prisma } from '../lib/prisma';
import { jadwalService } from '../services/jadwal.service';
import { absensiService } from '../services/absensi.service';
import { shiftKasirService } from '../services/shiftKasir.service';
import { penggantianService } from '../services/penggantian.service';
import { fotoAbsensiService } from '../services/fotoAbsensi.service';
import { aktorDariRequest } from '../services/auditLog.service';
import {
  parseJadwalBaru,
  parseRentangTanggal,
  parseTemplateShift,
} from '../validation/jadwal.validation';
import {
  parseAbsen,
  parseAjukanPengganti,
  parseBukaShift,
  parseKas,
  parseKoreksiShift,
  parsePutusanPengganti,
  parseTutupShift,
} from '../validation/shift.validation';

export const shiftRouter = Router();

/**
 * Jadwal, absensi, shift kasir, dan penggantian.
 *
 * Dua rantai akses yang sengaja dipisah, karena keduanya menjawab pertanyaan
 * yang berbeda:
 *
 *   `pemilikSaja`  — pemilik yang login. Menyusun jadwal, menyetujui
 *                    penggantian, membaca foto absensi, mengoreksi shift.
 *   `posAkses`     — perangkat terdaftar + petugas yang sudah membuktikan PIN.
 *                    Absen, buka/tutup shift, catat kas. Tidak pernah menerima
 *                    `cafeId` dari klien: kafenya dari token perangkat.
 *
 * Yang TIDAK ada di sini: jalan bagi kasir untuk menyunting shift yang sudah
 * ditutup. Koreksi hanya lewat jalur pemilik, dan wajib beralasan.
 */
const pemilikSaja = [requireAuth, requireRole('OWNER'), attachUser, tenantScope];
const posAkses = [requirePerangkat, requireSesiKasir];

const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function idDariUrl(nilai: string, nama: string): string {
  if (!POLA_UUID.test(nilai)) throw ApiError.notFound(`${nama} tidak ditemukan`);
  return nilai;
}

/** Rentang hari operasional kafe — dipakai daftar absensi & shift. */
async function rentangKafe(
  cafeId: string,
  dari: string,
  sampai: string,
): Promise<{ mulai: Date; selesai: Date }> {
  const cafe = await prisma.cafe.findUnique({
    where: { id: cafeId },
    select: { timezone: true, awalHariOperasional: true },
  });
  const p = {
    timezone: zonaAman(cafe?.timezone),
    awalHariOperasional: cafe?.awalHariOperasional ?? 0,
  };
  return {
    mulai: rentangHariOperasional(dari, p).mulai,
    selesai: rentangHariOperasional(sampai, p).selesai,
  };
}

// ══ JADWAL — pemilik ════════════════════════════════════════════════════════

shiftRouter.get(
  '/jadwal/template',
  pemilikSaja,
  asyncHandler(async (req, res) => {
    res.json({ data: await jadwalService.daftarTemplate(req.auth!.cafeId) });
  }),
);

shiftRouter.post(
  '/jadwal/template',
  pemilikSaja,
  asyncHandler(async (req, res) => {
    const input = parseTemplateShift(req.body);
    const data = await jadwalService.simpanTemplate(
      req.auth!.cafeId,
      input,
      aktorDariRequest(req),
    );
    res.status(201).json({ data });
  }),
);

shiftRouter.put(
  '/jadwal/template/:id',
  pemilikSaja,
  asyncHandler(async (req, res) => {
    const input = parseTemplateShift(req.body);
    const data = await jadwalService.simpanTemplate(
      req.auth!.cafeId,
      input,
      aktorDariRequest(req),
      idDariUrl(req.params.id, 'Template'),
    );
    res.json({ data });
  }),
);

shiftRouter.delete(
  '/jadwal/template/:id',
  pemilikSaja,
  asyncHandler(async (req, res) => {
    await jadwalService.hapusTemplate(
      req.auth!.cafeId,
      idDariUrl(req.params.id, 'Template'),
      aktorDariRequest(req),
    );
    res.json({ data: { dihapus: true } });
  }),
);

// GET /api/jadwal?dari=&sampai=&userId=
shiftRouter.get(
  '/jadwal',
  pemilikSaja,
  asyncHandler(async (req, res) => {
    const { dari, sampai, userId } = parseRentangTanggal(
      req.query as Record<string, unknown>,
    );
    const data = await jadwalService.daftar(req.auth!.cafeId, dari, sampai, { userId });
    res.json({ data });
  }),
);

shiftRouter.post(
  '/jadwal',
  pemilikSaja,
  asyncHandler(async (req, res) => {
    const input = parseJadwalBaru(req.body);
    const data = await jadwalService.tetapkan(
      req.auth!.cafeId,
      input,
      aktorDariRequest(req),
    );
    res.status(201).json({ data });
  }),
);

shiftRouter.delete(
  '/jadwal/:id',
  pemilikSaja,
  asyncHandler(async (req, res) => {
    const alasan =
      typeof (req.body as Record<string, unknown>)?.alasan === 'string'
        ? ((req.body as Record<string, unknown>).alasan as string).slice(0, 300)
        : null;
    const data = await jadwalService.batalkan(
      req.auth!.cafeId,
      idDariUrl(req.params.id, 'Jadwal'),
      alasan,
      aktorDariRequest(req),
    );
    res.json({ data });
  }),
);

// ══ ABSENSI ═════════════════════════════════════════════════════════════════

// GET /api/pos/absensi — kehadiran petugas yang sedang memegang terminal.
shiftRouter.get(
  '/pos/absensi',
  posAkses,
  asyncHandler(async (req, res) => {
    const sesi = req.sesiKasir!;
    const [absensi, jadwal] = await Promise.all([
      absensiService.berjalan(sesi.cafeId, sesi.userId),
      jadwalService.untukAbsen(sesi.cafeId, sesi.userId, new Date()),
    ]);
    res.json({
      data: { absensi, jadwalCocok: jadwal.map((j) => j.jadwal) },
    });
  }),
);

// POST /api/pos/absensi/masuk — multipart: field `foto` + metadata.
shiftRouter.post(
  '/pos/absensi/masuk',
  posAkses,
  uploadSingle,
  asyncHandler(async (req, res) => {
    const sesi = req.sesiKasir!;
    const input = parseAbsen(req.body);

    const data = await absensiService.masuk(
      {
        cafeId: sesi.cafeId,
        userId: sesi.userId,
        deviceId: req.perangkat!.id,
        foto: req.file?.buffer ?? null,
        diambilPada: input.diambilPada,
        alasanPengecualian: input.alasanPengecualian,
        correlationId: input.correlationId,
      },
      aktorDariRequest(req),
    );
    res.status(201).json({ data });
  }),
);

// POST /api/pos/absensi/pulang
shiftRouter.post(
  '/pos/absensi/pulang',
  posAkses,
  uploadSingle,
  asyncHandler(async (req, res) => {
    const sesi = req.sesiKasir!;
    const input = parseAbsen(req.body);

    const data = await absensiService.pulang(
      sesi.cafeId,
      sesi.userId,
      {
        deviceId: req.perangkat!.id,
        foto: req.file?.buffer ?? null,
        diambilPada: input.diambilPada,
        alasanPengecualian: input.alasanPengecualian,
        catatan: input.catatan,
      },
      aktorDariRequest(req),
    );
    res.json({ data });
  }),
);

// GET /api/absensi?dari=&sampai=&userId= — pemilik.
shiftRouter.get(
  '/absensi',
  pemilikSaja,
  asyncHandler(async (req, res) => {
    const { dari, sampai, userId } = parseRentangTanggal(
      req.query as Record<string, unknown>,
    );
    const rentang = await rentangKafe(req.auth!.cafeId, dari, sampai);
    const data = await absensiService.daftar(
      req.auth!.cafeId,
      rentang.mulai,
      rentang.selesai,
      { userId },
    );
    res.json({ data });
  }),
);

shiftRouter.post(
  '/absensi/:id/setujui-pengecualian',
  pemilikSaja,
  asyncHandler(async (req, res) => {
    const data = await absensiService.setujuiPengecualian(
      req.auth!.cafeId,
      idDariUrl(req.params.id, 'Absensi'),
      aktorDariRequest(req),
    );
    res.json({ data });
  }),
);

/**
 * GET /api/absensi/foto/:id — sajikan satu foto absensi.
 *
 * PEMILIK SAJA, dan kafenya dari TOKEN. Inilah satu-satunya jalan sebuah foto
 * absensi bisa keluar dari server: tidak ada URL publik, tidak ada berkas yang
 * disajikan statis, tidak ada tautan yang tetap berlaku setelah dibagikan.
 *
 * `Cache-Control: private, no-store` mencegah proxy bersama menyimpannya, dan
 * mencegah peramban meninggalkan salinannya di disk komputer yang mungkin
 * dipakai bergantian.
 */
shiftRouter.get(
  '/absensi/foto/:id',
  pemilikSaja,
  asyncHandler(async (req, res) => {
    const { buffer, mimeType } = await fotoAbsensiService.baca(
      req.auth!.cafeId,
      idDariUrl(req.params.id, 'Foto'),
    );
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Content-Disposition', 'inline');
    // Peramban tidak boleh menebak-nebak tipe berkasnya sendiri.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(buffer);
  }),
);

// ══ SHIFT KASIR ═════════════════════════════════════════════════════════════

// GET /api/pos/shift — shift yang sedang dipegang petugas terminal ini.
shiftRouter.get(
  '/pos/shift',
  posAkses,
  asyncHandler(async (req, res) => {
    const sesi = req.sesiKasir!;
    res.json({ data: await shiftKasirService.aktifMilik(sesi.cafeId, sesi.userId) });
  }),
);

shiftRouter.post(
  '/pos/shift/buka',
  posAkses,
  asyncHandler(async (req, res) => {
    const sesi = req.sesiKasir!;
    const input = parseBukaShift(req.body);
    const data = await shiftKasirService.buka(
      {
        cafeId: sesi.cafeId,
        userId: sesi.userId,
        deviceId: req.perangkat!.id,
        modalAwal: input.modalAwal,
        scheduleId: input.scheduleId,
        catatan: input.catatan,
      },
      aktorDariRequest(req),
    );
    res.status(201).json({ data });
  }),
);

shiftRouter.post(
  '/pos/shift/:id/tutup',
  posAkses,
  asyncHandler(async (req, res) => {
    const sesi = req.sesiKasir!;
    const input = parseTutupShift(req.body);
    const shiftId = idDariUrl(req.params.id, 'Shift');

    // Kasir hanya boleh menutup shiftnya SENDIRI. Tanpa pemeriksaan ini, siapa
    // pun yang memegang terminal bisa menutup laci orang lain — dan selisihnya
    // tercatat atas nama orang yang tidak pernah menghitungnya.
    const milik = await shiftKasirService.ambil(sesi.cafeId, shiftId);
    if (milik.kasir.id !== sesi.userId) {
      throw ApiError.conflict('Shift ini bukan milikmu.');
    }

    const data = await shiftKasirService.tutup(
      sesi.cafeId,
      shiftId,
      input.kasAktual,
      input.catatan,
      aktorDariRequest(req),
    );
    res.json({ data });
  }),
);

shiftRouter.post(
  '/pos/shift/:id/kas',
  posAkses,
  asyncHandler(async (req, res) => {
    const sesi = req.sesiKasir!;
    const input = parseKas(req.body);
    const shiftId = idDariUrl(req.params.id, 'Shift');

    const milik = await shiftKasirService.ambil(sesi.cafeId, shiftId);
    if (milik.kasir.id !== sesi.userId) {
      throw ApiError.conflict('Shift ini bukan milikmu.');
    }

    const data = await shiftKasirService.catatKas(
      sesi.cafeId,
      shiftId,
      input.jenis,
      input.nominal,
      input.alasan,
      aktorDariRequest(req),
    );
    res.json({ data });
  }),
);

// GET /api/shift?dari=&sampai=&userId= — pemilik.
shiftRouter.get(
  '/shift',
  pemilikSaja,
  asyncHandler(async (req, res) => {
    const { dari, sampai, userId } = parseRentangTanggal(
      req.query as Record<string, unknown>,
    );
    const rentang = await rentangKafe(req.auth!.cafeId, dari, sampai);
    const data = await shiftKasirService.daftar(
      req.auth!.cafeId,
      rentang.mulai,
      rentang.selesai,
      { userId },
    );
    res.json({ data });
  }),
);

shiftRouter.get(
  '/shift/:id',
  pemilikSaja,
  asyncHandler(async (req, res) => {
    const data = await shiftKasirService.ambil(
      req.auth!.cafeId,
      idDariUrl(req.params.id, 'Shift'),
    );
    res.json({ data });
  }),
);

// POST /api/shift/:id/koreksi — PEMILIK saja, wajib beralasan.
shiftRouter.post(
  '/shift/:id/koreksi',
  pemilikSaja,
  asyncHandler(async (req, res) => {
    const input = parseKoreksiShift(req.body);
    const data = await shiftKasirService.koreksi(
      req.auth!.cafeId,
      idDariUrl(req.params.id, 'Shift'),
      { kasAktual: input.kasAktual, modalAwal: input.modalAwal },
      input.alasan,
      aktorDariRequest(req),
    );
    res.json({ data });
  }),
);

// ══ PENGGANTIAN ═════════════════════════════════════════════════════════════

shiftRouter.post(
  '/pos/pengganti',
  posAkses,
  asyncHandler(async (req, res) => {
    const sesi = req.sesiKasir!;
    const input = parseAjukanPengganti(req.body);
    const data = await penggantianService.ajukan(
      sesi.cafeId,
      input.scheduleId,
      sesi.userId,
      input.alasan,
      aktorDariRequest(req),
    );
    res.status(201).json({ data });
  }),
);

shiftRouter.get(
  '/pengganti',
  pemilikSaja,
  asyncHandler(async (req, res) => {
    const status = req.query.status;
    const data = await penggantianService.daftar(
      req.auth!.cafeId,
      typeof status === 'string' && status === 'PENDING_APPROVAL'
        ? { status: 'PENDING_APPROVAL' }
        : {},
    );
    res.json({ data });
  }),
);

shiftRouter.post(
  '/pengganti/:id/putuskan',
  pemilikSaja,
  asyncHandler(async (req, res) => {
    const input = parsePutusanPengganti(req.body);
    const data = await penggantianService.putuskan(
      req.auth!.cafeId,
      idDariUrl(req.params.id, 'Permintaan'),
      input.setuju,
      input.alasan,
      aktorDariRequest(req),
    );
    res.json({ data });
  }),
);
