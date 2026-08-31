import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { rateLimit } from '../middleware/rateLimit';
import { perangkatAccess, posAccess } from '../middleware/perangkat';
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
import { deviceService } from '../services/device.service';
import { tolakLintasSitus } from '../middleware/csrf';

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

/**
 * Batas laju penukaran kode pemasangan, per alamat IP.
 *
 * Kodenya 40 bit — ruang tebakan yang besar, tapi bukan tak terbatas. Yang
 * membuatnya memadai adalah tiga hal bersama: sekali pakai, berumur 15 menit,
 * dan batas ini. Tanpa yang terakhir, sebuah skrip bisa mencoba ribuan kode
 * dalam jendela 15 menit itu.
 */
const batasPasang = rateLimit({
  maks: 10,
  jendelaMs: 10 * 60_000,
  pesan: 'Terlalu banyak percobaan kode. Tunggu beberapa menit lalu coba lagi.',
});

// POST /api/pos/pasang — tukar KODE PEMASANGAN dengan cookie HttpOnly.
//
// Dipanggil sekali oleh terminal baru, membawa kode pendek yang dibaca pemilik
// dari layar Manajemen Staf. Tokennya lahir di server pada permintaan ini,
// langsung menjadi cookie, dan tidak pernah dikembalikan ke JavaScript —
// termasuk kode kami sendiri.
//
// TIDAK memakai `perangkatAccess`: yang memanggil ini justru perangkat yang
// BELUM punya kredensial apa pun. Yang menjaganya `tolakLintasSitus` (CSRF) dan
// batas laju di atas.
posRouter.post(
  '/pos/pasang',
  tolakLintasSitus,
  batasPasang,
  asyncHandler(async (req, res) => {
    const body = (req.body ?? {}) as { kode?: unknown };
    if (typeof body.kode !== 'string' || body.kode.trim() === '') {
      throw ApiError.badRequest('Kode pemasangan wajib diisi');
    }

    const { token, perangkat } = await deviceService.tukarKode(body.kode);
    pasangCookiePerangkat(res, token);

    res.json({
      data: {
        terpasang: true,
        deviceId: perangkat.id,
        label: perangkat.label,
        cafeId: perangkat.cafeId,
      },
    });
  }),
);

// GET /api/pos/terpasang — apakah peramban ini sudah menjadi terminal?
//
// Dipakai layar /kasir untuk memilih antara formulir kode dan daftar petugas,
// tanpa harus menebaknya dari sebuah 401.
posRouter.get(
  '/pos/terpasang',
  perangkatAccess,
  asyncHandler(async (req, res) => {
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
  perangkatAccess,
  asyncHandler(async (req, res) => {
    const data = await stafService.untukLayarPergantian(req.perangkat!.cafeId);
    res.json({ data });
  }),
);

// POST /api/pos/sesi — buka sesi kasir dengan PIN.
posRouter.post(
  '/pos/sesi',
  perangkatAccess,
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
  posAccess,
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
  posAccess,
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
