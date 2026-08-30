import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { rateLimit } from '../middleware/rateLimit';
import { requirePerangkat, requireSesiKasir } from '../middleware/perangkat';
import {
  hapusCookieSesi,
  pasangCookiePerangkat,
  pasangCookieSesi,
} from '../lib/cookie';
import { ApiError } from '../lib/ApiError';
import { sesiKasirService } from '../services/sesiKasir.service';
import { stafService } from '../services/staf.service';
import { aktorDariRequest } from '../services/auditLog.service';
import { parseBukaSesi } from '../validation/staf.validation';

export const posRouter = Router();

/**
 * Terminal POS: pemasangan perangkat dan layar pergantian petugas.
 *
 * Tidak satu pun endpoint di sini memakai token staf biasa. Yang menentukan
 * kafe adalah TOKEN PERANGKAT, dan yang menentukan orang adalah PIN — dua hal
 * yang dipegang benda dan orang yang benar-benar berada di kafe itu.
 */

/**
 * Batas laju percobaan PIN, per alamat IP.
 *
 * Lapis KEDUA di atas penguncian per-akun di `lib/pin.ts`. Keduanya menjaga hal
 * yang berbeda dan sama-sama dibutuhkan: penguncian per-akun menghentikan
 * penebakan pada SATU staf, sedangkan batas per-IP menghentikan penebakan yang
 * menyebar ke SELURUH staf (satu percobaan per orang, berputar terus, sehingga
 * tidak ada satu akun pun yang penghitungnya mencapai ambang).
 */
const batasPin = rateLimit({
  maks: 15,
  jendelaMs: 5 * 60_000,
  pesan: 'Terlalu banyak percobaan dari perangkat ini. Tunggu sebentar.',
});

// POST /api/pos/pasang — tukar token perangkat dengan cookie HttpOnly.
//
// Dipanggil SEKALI oleh terminal yang baru didaftarkan, membawa tokennya di
// header `x-device-token`. Sesudah ini tokennya hidup di cookie yang tidak bisa
// dibaca JavaScript, dan header itu tidak pernah dikirim lagi.
posRouter.post(
  '/pos/pasang',
  requirePerangkat,
  asyncHandler(async (req, res) => {
    const dariHeader = req.headers['x-device-token'];
    const token = typeof dariHeader === 'string' ? dariHeader.trim() : null;

    // Kalau tokennya datang dari cookie (bukan header), perangkat ini memang
    // sudah terpasang — tidak ada yang perlu dikerjakan, dan tidak ada token
    // untuk dipasang ulang karena kami tidak pernah menyimpannya.
    if (token) pasangCookiePerangkat(res, token);

    res.json({
      data: {
        terpasang: true,
        deviceId: req.perangkat!.id,
        label: req.perangkat!.label,
        cafeId: req.perangkat!.cafeId,
      },
    });
  }),
);

// GET /api/pos/petugas — nama-nama yang boleh membuka sesi di terminal ini.
//
// Bentuknya sengaja miskin (id, nama, peran). Layar ini berdiri di area kasir
// dan terlihat siapa saja yang lewat: email, nomor HP, dan status penguncian
// PIN tidak punya urusan di sana.
posRouter.get(
  '/pos/petugas',
  requirePerangkat,
  asyncHandler(async (req, res) => {
    const data = await stafService.untukLayarPergantian(req.perangkat!.cafeId);
    res.json({ data });
  }),
);

// POST /api/pos/sesi — buka sesi kasir dengan PIN.
posRouter.post(
  '/pos/sesi',
  requirePerangkat,
  batasPin,
  asyncHandler(async (req, res) => {
    const input = parseBukaSesi(req.body);
    const { token, sesi } = await sesiKasirService.buka(
      req.perangkat!,
      input.userId,
      input.pin,
      aktorDariRequest(req),
    );

    // Token sesi TIDAK ikut di body — hanya sebagai cookie HttpOnly.
    pasangCookieSesi(res, token);
    res.json({ data: sesi });
  }),
);

// GET /api/pos/sesi — siapa yang sedang memegang terminal ini.
posRouter.get(
  '/pos/sesi',
  requirePerangkat,
  requireSesiKasir,
  asyncHandler(async (req, res) => {
    const sesi = await sesiKasirService.muat(
      req.sesiKasir!.cafeId,
      req.sesiKasir!.userId,
      req.perangkat!,
    );
    if (!sesi) {
      // Staf dinonaktifkan / dipindah kafe setelah tokennya terbit.
      hapusCookieSesi(res);
      throw new ApiError(401, 'Sesi tidak berlaku lagi. Masukkan PIN lagi.');
    }
    res.json({ data: sesi });
  }),
);

// DELETE /api/pos/sesi — "Ganti Petugas".
//
// Shift kasir yang sedang berjalan SENGAJA tidak ikut ditutup: menutup shift
// berarti menghitung uang di laci, dan itu tidak boleh terjadi sebagai efek
// samping dari menekan tombol ini.
posRouter.delete(
  '/pos/sesi',
  requirePerangkat,
  requireSesiKasir,
  asyncHandler(async (req, res) => {
    await sesiKasirService.kunci(
      req.sesiKasir!.cafeId,
      req.sesiKasir!.userId,
      req.perangkat!.id,
      aktorDariRequest(req),
    );
    hapusCookieSesi(res);
    res.json({ data: { terkunci: true } });
  }),
);
