import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { attachUser, requireAuth, requireRole } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimit';
import { stafService } from '../services/staf.service';
import { deviceService } from '../services/device.service';
import { aktorDariRequest } from '../services/auditLog.service';
import {
  parseAturPin,
  parseStafAktif,
  parseStafBaru,
  parseStafUbah,
  parseLabelPerangkat,
} from '../validation/staf.validation';
import { ApiError } from '../lib/ApiError';

export const stafRouter = Router();

/**
 * Manajemen Staf & perangkat POS — PEMILIK SAJA.
 *
 * Kasir tidak boleh membuka satu pun endpoint di berkas ini, dan itu bukan
 * sekadar soal kerapian menu: yang ada di sini adalah kemampuan mengangkat
 * peran, menetapkan PIN orang lain, dan mendaftarkan terminal baru. Seorang
 * kasir yang bisa memanggilnya bisa mengangkat dirinya sendiri menjadi pemilik.
 *
 * `tenantScope` SENGAJA TIDAK DIPASANG. Model `User` tidak terdaftar di
 * `TENANT_MODELS`, sehingga ekstensi tenant tidak akan menyisipkan apa pun ke
 * query staf — memasangnya di sini hanya akan menciptakan rasa aman yang keliru
 * bagi pembaca berikutnya. Isolasinya ditulis tangan di `staf.service`, tempat
 * setiap query menyebut `cafeId` sendiri.
 */
const pemilikSaja = [requireAuth, requireRole('OWNER'), attachUser];

/**
 * Batas laju penetapan PIN.
 *
 * Bukan untuk melawan penebak — endpoint ini menulis PIN, bukan mencocokkannya.
 * Yang dicegah adalah pemilik (atau skrip yang memakai tokennya) mengganti PIN
 * seluruh stafnya berulang kali; setiap penggantian membuat PIN yang dipegang
 * staf berhenti berlaku di tengah shift.
 */
const batasPin = rateLimit({
  maks: 20,
  jendelaMs: 10 * 60_000,
  pesan: 'Terlalu banyak perubahan PIN. Tunggu beberapa menit lalu coba lagi.',
});

/** Id dari URL — ditolak lebih awal bila bukan UUID, supaya Prisma tidak 500. */
const POLA_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function idDariUrl(nilai: string, nama: string): string {
  if (!POLA_UUID.test(nilai)) {
    throw ApiError.notFound(`${nama} tidak ditemukan`);
  }
  return nilai;
}

// ── Staf ─────────────────────────────────────────────────────────────────────

// GET /api/staf — daftar staf beserta status hadir & shift aktifnya.
stafRouter.get(
  '/staf',
  pemilikSaja,
  asyncHandler(async (req, res) => {
    const data = await stafService.daftar(req.auth!.cafeId);
    res.json({ data });
  }),
);

// GET /api/staf/:id
stafRouter.get(
  '/staf/:id',
  pemilikSaja,
  asyncHandler(async (req, res) => {
    const data = await stafService.detail(
      req.auth!.cafeId,
      idDariUrl(req.params.id, 'Staf'),
    );
    res.json({ data });
  }),
);

// POST /api/staf — tambah staf baru.
stafRouter.post(
  '/staf',
  pemilikSaja,
  asyncHandler(async (req, res) => {
    const input = parseStafBaru(req.body);
    const data = await stafService.tambah(
      req.auth!.cafeId,
      input,
      aktorDariRequest(req),
    );
    res.status(201).json({ data });
  }),
);

// PATCH /api/staf/:id — ubah nama/email/HP/peran.
stafRouter.patch(
  '/staf/:id',
  pemilikSaja,
  asyncHandler(async (req, res) => {
    const input = parseStafUbah(req.body);
    const data = await stafService.perbarui(
      req.auth!.cafeId,
      idDariUrl(req.params.id, 'Staf'),
      input,
      aktorDariRequest(req),
    );
    res.json({ data });
  }),
);

// PUT /api/staf/:id/aktif — aktifkan / nonaktifkan.
//
// Tidak ada DELETE di berkas ini, dan itu disengaja: staf yang pernah memegang
// laci muncul di rekap shift dan laporan absensi berbulan-bulan sesudahnya.
stafRouter.put(
  '/staf/:id/aktif',
  pemilikSaja,
  asyncHandler(async (req, res) => {
    const aktif = parseStafAktif(req.body);
    const data = await stafService.ubahAktif(
      req.auth!.cafeId,
      idDariUrl(req.params.id, 'Staf'),
      aktif,
      aktorDariRequest(req),
    );
    res.json({ data });
  }),
);

// PUT /api/staf/:id/pin — tetapkan / reset PIN.
//
// Balasannya TIDAK PERNAH memuat PIN, termasuk yang baru saja dikirim: pemilik
// sudah mengetiknya sendiri, dan mengembalikannya hanya menambah satu tempat
// lagi ia bisa tersimpan (log proxy, riwayat DevTools, tangkapan layar).
stafRouter.put(
  '/staf/:id/pin',
  pemilikSaja,
  batasPin,
  asyncHandler(async (req, res) => {
    const pin = parseAturPin(req.body);
    const data = await stafService.aturPin(
      req.auth!.cafeId,
      idDariUrl(req.params.id, 'Staf'),
      pin,
      aktorDariRequest(req),
    );
    res.json({ data });
  }),
);

// POST /api/staf/:id/buka-kunci — lepaskan penguncian PIN.
stafRouter.post(
  '/staf/:id/buka-kunci',
  pemilikSaja,
  asyncHandler(async (req, res) => {
    const data = await stafService.bukaKunciPin(
      req.auth!.cafeId,
      idDariUrl(req.params.id, 'Staf'),
      aktorDariRequest(req),
    );
    res.json({ data });
  }),
);

// ── Perangkat POS ────────────────────────────────────────────────────────────

// GET /api/perangkat — daftar terminal kafe.
stafRouter.get(
  '/perangkat',
  pemilikSaja,
  asyncHandler(async (req, res) => {
    const data = await deviceService.daftar(req.auth!.cafeId);
    res.json({ data });
  }),
);

// POST /api/perangkat — daftarkan terminal baru.
//
// Yang dikembalikan adalah KODE PEMASANGAN berumur pendek, bukan token. Token
// perangkat lahir kelak di `/api/pos/pasang`, di tablet yang bersangkutan, dan
// tidak pernah terlihat manusia mana pun — termasuk pemilik kafe.
stafRouter.post(
  '/perangkat',
  pemilikSaja,
  asyncHandler(async (req, res) => {
    const data = await deviceService.daftarkan(
      req.auth!.cafeId,
      parseLabelPerangkat((req.body as Record<string, unknown>)?.label),
      aktorDariRequest(req),
    );
    res.status(201).json({ data });
  }),
);

// POST /api/perangkat/:id/kode — terbitkan ulang kode pemasangan.
//
// Kode berumur 15 menit, dan pemilik yang terlambat berjalan ke terminalnya
// tidak boleh dipaksa mencabut lalu mendaftarkan ulang: pencabutan memutus
// riwayat shift terminal itu, sedangkan yang basi cuma selembar kode.
stafRouter.post(
  '/perangkat/:id/kode',
  pemilikSaja,
  asyncHandler(async (req, res) => {
    const data = await deviceService.terbitkanKode(
      req.auth!.cafeId,
      idDariUrl(req.params.id, 'Perangkat'),
      aktorDariRequest(req),
    );
    res.json({ data });
  }),
);

// DELETE /api/perangkat/:id — cabut terminal.
stafRouter.delete(
  '/perangkat/:id',
  pemilikSaja,
  asyncHandler(async (req, res) => {
    const data = await deviceService.cabut(
      req.auth!.cafeId,
      idDariUrl(req.params.id, 'Perangkat'),
      aktorDariRequest(req),
    );
    res.json({ data });
  }),
);
